import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Switch } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { db, Load, Rifle, Group, uid, parseLoadIds } from '../../lib/supabase';
import { cachedList, cachedGet } from '../../lib/cache';
import { parseShotView, toChronoSession } from '../../lib/importXero';
import { C, commonStyles } from '../../lib/theme';
import { PowderInput, BulletLibrary } from '../../components/ReloadPickers';
import { diameterLabel } from '../../lib/reloadData';
import { LAST_RIFLE_KEY, assignCodes, nextLoadId, previousIds, rifleOf } from '../../lib/loadIds';
import { recommend, Suggestion } from '../../lib/recommend';

type CS = { id: string; date: string; temp: string; distance: string; velocity: string; sd: string; es: string; group_size: string; n?: string };
type Step = { id: string; charge: string; velocity: string; group_size: string };

// COAL reference checkboxes → each maps to an existing load field
const COAL_REFS: { key: keyof Load; label: string }[] = [
  { key: 'overall_coal',       label: 'SAC' },
  { key: 'max_overall_coal',   label: 'Hornady' },
  { key: 'max_headspace_coal', label: 'OAL' },
];

const CS_FIELDS: { key: keyof CS; label: string }[] = [
  { key: 'date', label: 'Date' }, { key: 'temp', label: 'Temp (°F)' }, { key: 'distance', label: 'Distance (yd)' },
  { key: 'velocity', label: 'Velocity (fps)' }, { key: 'sd', label: 'SD' }, { key: 'es', label: 'ES' },
  { key: 'n', label: 'Shots' }, { key: 'group_size', label: 'Group (in)' },
];

const today = () => new Date().toISOString().slice(0, 10);

const emptyLoad = (): Partial<Load> => ({
  id: uid(), load_id: '', date: today(), rifle: '', rifle_id: '', caliber: '',
  bullet: '', bullet_wt: '', bullet_bc: '', powder: '', charge: '', primer: '',
  brass: '', brass_fires: '', trim_len: '', overall_coal: '', headspace_coal: '',
  max_overall_coal: '', max_headspace_coal: '', neck_tension: '', lot_number: '',
  velocity: '', sd: '', es: '', group_size: '', distance: '', status: 'testing',
  tumbled: 0, ultrasonic: 0, fl_sized: 0, neck_sized: 0, case_trimmed: 0,
  chrono_sessions: '', ladder: '', notes: '',
});

// what "Duplicate" carries over: the recipe and case prep, never results
const COPY_FIELDS: (keyof Load)[] = [
  'caliber', 'bullet', 'bullet_wt', 'bullet_bc', 'powder', 'charge', 'primer', 'brass', 'brass_fires',
  'trim_len', 'overall_coal', 'headspace_coal', 'max_overall_coal', 'max_headspace_coal', 'neck_tension',
  'tumbled', 'ultrasonic', 'fl_sized', 'neck_sized', 'case_trimmed',
];

function duplicateOf(src: Load): Partial<Load> {
  const d: Partial<Load> = { ...emptyLoad(), ...Object.fromEntries(COPY_FIELDS.map(k => [k, src[k]])) };
  if (/\d\s*[-–]\s*\d/.test(src.charge || '')) d.charge = ''; // a ladder range isn't a recipe
  d.rifle = src.rifle;
  d.rifle_id = src.rifle_id;
  d.notes = `Copied from ${src.load_id || 'an earlier load'}.`;
  return d;
}

export default function LoadDetail() {
  const params = useLocalSearchParams<{ id: string; rifle?: string; from?: string }>();
  const id = params.id;
  const router = useRouter();
  const isNew = id === 'new';
  const [form,     setForm]     = useState<Partial<Load>>(emptyLoad());
  const [rifles,   setRifles]   = useState<Rifle[]>([]);
  const [loads,    setLoads]    = useState<Load[]>([]);
  const [cs,       setCs]       = useState<CS[]>([]);
  const [ladder,   setLadder]   = useState<Step[]>([]);
  const [ladderOn, setLadderOn] = useState(false);
  const [coalOn,   setCoalOn]   = useState<Record<string, boolean>>({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [groups,    setGroups]    = useState<Group[]>([]);
  const [groupSel,  setGroupSel]  = useState<Set<string>>(new Set());
  const [groupInit, setGroupInit] = useState<Set<string>>(new Set());

  const f = (k: keyof Load, v: any) => setForm(p => ({ ...p, [k]: v }));

  // a COAL ref shows checked if toggled on, or (before any toggle) if it already has a value
  const coalChecked = (key: keyof Load) => coalOn[key] ?? (String(form[key] || '') !== '');
  const toggleCoal = (key: keyof Load) => {
    const next = !coalChecked(key);
    setCoalOn(p => ({ ...p, [key]: next }));
    if (!next) f(key, ''); // clear the value when unchecked
  };

  const toggleGroup = (gid: string) => setGroupSel(prev => {
    const next = new Set(prev);
    next.has(gid) ? next.delete(gid) : next.add(gid);
    return next;
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [rs, ls, gs] = await Promise.all([
        cachedList<Rifle>('rifles', db.rifles.getAll()),
        cachedList<Load>('loads', db.loads.getAll()),
        cachedList<Group>('groups', db.groups.getAll()),
      ]);
      if (!alive) return;
      setRifles(rs);
      setLoads(ls);
      setGroups(gs);
      // existing loads show their groups; a duplicate starts in its source's groups
      const memberOf = (loadId: string) => new Set(gs.filter(g => parseLoadIds(g.load_ids).includes(loadId)).map(g => g.id));
      if (isNew) { setGroupSel(params.from ? memberOf(params.from) : new Set()); setGroupInit(new Set()); }
      else { const inSet = memberOf(id); setGroupSel(inSet); setGroupInit(inSet); }
      if (isNew) {
        const src = params.from ? ls.find(x => x.id === params.from) : undefined;
        let draft = src ? duplicateOf(src) : emptyLoad();
        const last = await AsyncStorage.getItem(LAST_RIFLE_KEY).catch(() => null);
        const pick = rs.find(x => x.id === params.rifle)
          ?? (src ? rifleOf(src, rs) : undefined)
          ?? rs.find(x => x.id === last)
          ?? (rs.length === 1 ? rs[0] : undefined);
        if (pick) {
          draft = {
            ...draft, rifle: pick.name, rifle_id: pick.id,
            caliber: draft.caliber || pick.caliber || '',
            load_id: nextLoadId(assignCodes(rs)[pick.id], ls),
          };
        }
        if (alive) setForm(draft);
      } else {
        const data = await cachedGet<Load>('loads', db.loads.get(id), id);
        if (data && alive) {
          setForm(data);
          try { setCs(data.chrono_sessions ? JSON.parse(data.chrono_sessions) : []); } catch (e) {}
          try { const lad = data.ladder ? JSON.parse(data.ladder) : []; setLadder(lad); setLadderOn(lad.length > 0); } catch (e) {}
        }
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [id, params.rifle, params.from]);

  const codes = useMemo(() => assignCodes(rifles), [rifles]);
  const rifle = rifles.find(r => r.id === form.rifle_id) ?? rifleOf(form, rifles);
  const prevIds = previousIds(form);
  const rec = useMemo(() => recommend(form, rifle, loads), [form, rifle, loads]);

  const pickRifle = (r: Rifle) => setForm(p => ({
    ...p, rifle: r.name, rifle_id: r.id,
    caliber: p.caliber || r.caliber || '',
    load_id: isNew ? nextLoadId(codes[r.id], loads) : p.load_id,
  }));

  const applySuggestions = (list: Suggestion[]) => {
    setForm(p => ({ ...p, ...Object.fromEntries(list.map(s => [s.field, s.value])) }));
    const coal = list.filter(s => COAL_REFS.some(r => r.key === s.field)).map(s => [s.field, true]);
    if (coal.length) setCoalOn(p => ({ ...p, ...Object.fromEntries(coal) }));
  };

  const save = async () => {
    if (!rifle) {
      Alert.alert('Pick a rifle', "Each load belongs to a rifle, and its ID is built from the rifle's code.");
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    const payload: Partial<Load> = {
      ...form,
      rifle: rifle.name, rifle_id: rifle.id,
      load_id: form.load_id || nextLoadId(codes[rifle.id], loads),
      chrono_sessions: JSON.stringify(cs),
      ladder: ladderOn ? JSON.stringify(ladder) : '',
      updated_at: now, created_at: form.created_at || now,
    };
    let { error } = await db.loads.upsert(payload);
    if (error && isNew && error.code === '23505') {
      // that number was just taken (another device?) — use the next free one
      const fresh: Load[] = (await db.loads.getAll()).data || [];
      payload.load_id = nextLoadId(codes[rifle.id], fresh);
      ({ error } = await db.loads.upsert(payload));
    }
    if (error) {
      setSaving(false);
      const hint = /column/i.test(error.message)
        ? '\n\nRun supabase-migration-ids-ballistics.sql in the Supabase SQL editor, then try again.' : '';
      Alert.alert('Save failed', error.message + hint);
      return;
    }
    // sync group memberships — only the groups whose membership changed
    const loadId = payload.id!;
    for (const g of groups) {
      const was = groupInit.has(g.id), nowIn = groupSel.has(g.id);
      if (was === nowIn) continue;
      const ids = new Set(parseLoadIds(g.load_ids));
      nowIn ? ids.add(loadId) : ids.delete(loadId);
      await db.groups.upsert({ ...g, load_ids: JSON.stringify([...ids]), updated_at: now });
    }

    setSaving(false);
    AsyncStorage.setItem(LAST_RIFLE_KEY, rifle.id).catch(() => {});
    router.back();
  };

  const del = () => Alert.alert('Delete Load', 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await db.loads.delete(form.id!); router.back(); } },
  ]);

  const addCs = () => setCs(p => [...p, { id: uid(), date: today(), temp: '', distance: '', velocity: '', sd: '', es: '', group_size: '', n: '' }]);
  const updCs = (sid: string, k: keyof CS, v: string) => setCs(p => p.map(s => s.id === sid ? { ...s, [k]: v } : s));
  const delCs = (sid: string) => setCs(p => p.filter(s => s.id !== sid));

  // import one or more ShotView / Garmin Xero CSVs as chrono sessions on this load
  const importCs = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      multiple: true, copyToCacheDirectory: true,
      type: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values', '*/*'],
    });
    if (res.canceled) return;
    const added: CS[] = [];
    for (const asset of res.assets) {
      try {
        const text = await new File(asset.uri).text();
        const parsed = parseShotView(text);
        if (!parsed.shots.length && !parsed.avg) continue; // not a ShotView CSV
        added.push(toChronoSession(parsed));
      } catch (e) { /* skip unreadable files */ }
    }
    if (added.length) setCs(p => [...p, ...added]);
    else Alert.alert('No sessions imported', 'No readable ShotView/Xero CSV data found in the selected file(s).');
  };

  const toggleLadder = (on: boolean) => {
    setLadderOn(on);
    if (on && ladder.length === 0) setLadder([{ id: uid(), charge: '', velocity: '', group_size: '' }]);
  };
  const addStep = () => setLadder(p => p.length >= 10 ? p : [...p, { id: uid(), charge: '', velocity: '', group_size: '' }]);
  const updStep = (sid: string, k: keyof Step, v: string) => setLadder(p => p.map(s => s.id === sid ? { ...s, [k]: v } : s));
  const delStep = (sid: string) => setLadder(p => p.filter(s => s.id !== sid));

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  const inp = (k: keyof Load, lbl: string, placeholder = '') => (
    <View key={k}>
      <Text style={commonStyles.label}>{lbl}</Text>
      <TextInput style={commonStyles.input} value={String(form[k] || '')} onChangeText={v => f(k, v)}
        placeholderTextColor={C.muted} placeholder={placeholder || lbl} keyboardType="default" />
    </View>
  );

  const tog = (k: keyof Load, lbl: string) => (
    <View key={k} style={styles.togRow}>
      <Text style={styles.togLbl}>{lbl}</Text>
      <Switch value={!!form[k]} onValueChange={v => f(k, v ? 1 : 0)} trackColor={{ true: C.accent }} thumbColor={C.white} />
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'New Load' : (form.load_id || 'Load') }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>

        <Text style={commonStyles.sectionTitle}>Load ID</Text>
        <View style={styles.loadIdBox}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.loadIdText, !form.load_id && { color: C.muted }]}>{form.load_id || 'Pick a rifle'}</Text>
            {prevIds.length > 0 && <Text style={styles.prevIds}>Previously {prevIds.join(', ')}</Text>}
          </View>
          <Text style={styles.loadIdHint}>{isNew ? 'next for this rifle' : 'auto-generated'}</Text>
        </View>

        <Text style={commonStyles.sectionTitle}>Rifle</Text>
        {rifles.length === 0 ? (
          <TouchableOpacity onPress={() => router.push('/rifle/new' as any)}>
            <Text style={styles.linkText}>Add a rifle first</Text>
          </TouchableOpacity>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {rifles.map(r => {
              const on = rifle?.id === r.id;
              return (
                <TouchableOpacity key={r.id} style={[styles.chip, on && styles.chipOn]} onPress={() => pickRifle(r)}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.name}</Text>
                  <Text style={[styles.chipCode, on && styles.chipTextOn]}>{codes[r.id]}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <Text style={commonStyles.sectionTitle}>Status</Text>
        <View style={styles.statusRow}>
          {['testing', 'promising', 'proven', 'retired'].map(s => (
            <TouchableOpacity key={s} style={[styles.statusBtn, form.status === s && styles.statusBtnOn]} onPress={() => f('status', s)}>
              <Text style={[styles.statusText, form.status === s && styles.statusTextOn]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {groups.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>Groups</Text>
            <View style={styles.groupWrap}>
              {groups.map(g => {
                const on = groupSel.has(g.id);
                return (
                  <TouchableOpacity key={g.id} style={[styles.groupChip, on && styles.groupChipOn]} onPress={() => toggleGroup(g.id)}>
                    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={on ? C.accent : C.muted} />
                    <Text style={[styles.groupChipText, on && styles.groupChipTextOn]}>{g.name || 'Untitled'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <Text style={commonStyles.sectionTitle}>Components</Text>
        <BulletLibrary
          caliber={form.caliber}
          onPick={b => setForm(prev => ({
            ...prev,
            bullet: `${b.mfr} ${b.model}`,
            bullet_wt: String(b.weight),
            bullet_bc: b.bcG1 != null ? String(b.bcG1) : prev.bullet_bc,
            caliber: prev.caliber || diameterLabel(b.diameter),
            overall_coal: b.col != null ? String(b.col) : prev.overall_coal,
          }))}
        />
        {inp('caliber', 'Caliber')}
        {inp('bullet', 'Bullet')}
        {inp('bullet_wt', 'Bullet Weight (gr)')}
        {inp('bullet_bc', 'BC (G1)')}

        {rec && (rec.suggestions.length > 0 || rec.notes.length > 0) && (
          <View style={styles.recCard}>
            <View style={styles.recHead}>
              <Ionicons name="bulb-outline" size={16} color={C.orange} />
              <Text style={styles.recTitle}>{rec.title}</Text>
            </View>
            {rec.detail ? <Text style={styles.recDetail}>{rec.detail}</Text> : null}
            {rec.suggestions.map(s => (
              <View key={String(s.field)} style={styles.recRow}>
                <Text style={styles.recLabel}>{s.label}</Text>
                <Text style={styles.recValue}>
                  {s.value}{s.current ? <Text style={styles.recWas}>{`  now ${s.current}`}</Text> : null}
                </Text>
                <TouchableOpacity onPress={() => applySuggestions([s])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.recUse}>Use</Text>
                </TouchableOpacity>
              </View>
            ))}
            {rec.notes.map(n => <Text key={n} style={styles.recNote}>{n}</Text>)}
            {rec.suggestions.length > 1 && (
              <TouchableOpacity style={styles.recAll} onPress={() => applySuggestions(rec.suggestions)}>
                <Text style={styles.recAllText}>Use all {rec.suggestions.length}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <PowderInput value={form.powder || ''} onChange={v => f('powder', v)} />
        {inp('charge', 'Charge (gr)')}
        {inp('primer', 'Primer')}
        {inp('brass', 'Brass')}
        {inp('brass_fires', 'Fires')}

        <Text style={commonStyles.sectionTitle}>COAL</Text>
        <View style={styles.coalChkRow}>
          {COAL_REFS.map(r => {
            const on = coalChecked(r.key);
            return (
              <TouchableOpacity key={r.key} style={[styles.coalChk, on && styles.coalChkOn]} onPress={() => toggleCoal(r.key)}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? C.accent : C.muted} />
                <Text style={[styles.coalChkText, on && styles.coalChkTextOn]}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {COAL_REFS.map(r => coalChecked(r.key) ? (
          <View key={r.key}>
            <Text style={commonStyles.label}>{r.label} (in)</Text>
            <TextInput style={commonStyles.input} value={String(form[r.key] || '')} onChangeText={v => f(r.key, v)}
              placeholderTextColor={C.muted} placeholder={r.label} keyboardType="decimal-pad" />
          </View>
        ) : null)}
        {inp('headspace_coal', 'Headspace COAL (in)')}
        {inp('trim_len', 'Trim Length (in)')}
        {inp('neck_tension', 'Neck Tension')}

        <Text style={commonStyles.sectionTitle}>Case Prep</Text>
        {tog('tumbled', 'Tumbled')}
        {tog('ultrasonic', 'Ultrasonic')}
        {tog('fl_sized', 'FL Sized')}
        {tog('neck_sized', 'Neck Sized')}
        {tog('case_trimmed', 'Case Trimmed')}

        <Text style={commonStyles.sectionTitle}>Primary Results</Text>
        {inp('velocity', 'Velocity (fps)')}
        {inp('sd', 'SD')}
        {inp('es', 'ES')}
        {inp('group_size', 'Group Size (in)')}
        {inp('distance', 'Distance (yd)')}

        <View style={styles.csHeader}>
          <Text style={commonStyles.sectionTitle}>Ladder Development</Text>
          <Switch value={ladderOn} onValueChange={toggleLadder} trackColor={{ true: C.accent }} thumbColor={C.white} />
        </View>
        {ladderOn && (
          <>
            <View style={styles.ladderHead}>
              <Text style={[styles.ladderH, { width: 24 }]}>#</Text>
              <Text style={[styles.ladderH, { flex: 1 }]}>Charge gr</Text>
              <Text style={[styles.ladderH, { flex: 1 }]}>Velocity</Text>
              <Text style={[styles.ladderH, { flex: 1 }]}>Group in</Text>
              <View style={{ width: 24 }} />
            </View>
            {ladder.map((s, i) => (
              <View key={s.id} style={styles.ladderRow}>
                <Text style={styles.stepNum}>{i + 1}</Text>
                <TextInput style={styles.ladderInput} value={s.charge} onChangeText={v => updStep(s.id, 'charge', v)}
                  placeholder="—" placeholderTextColor={C.muted} keyboardType="decimal-pad" />
                <TextInput style={styles.ladderInput} value={s.velocity} onChangeText={v => updStep(s.id, 'velocity', v)}
                  placeholder="—" placeholderTextColor={C.muted} keyboardType="number-pad" />
                <TextInput style={styles.ladderInput} value={s.group_size} onChangeText={v => updStep(s.id, 'group_size', v)}
                  placeholder="—" placeholderTextColor={C.muted} keyboardType="decimal-pad" />
                <TouchableOpacity style={styles.stepDel} onPress={() => delStep(s.id)}><Text style={styles.csDelete}>✕</Text></TouchableOpacity>
              </View>
            ))}
            {ladder.length < 10 && (
              <TouchableOpacity style={styles.addBtnFull} onPress={addStep}>
                <Text style={styles.addBtnText}>+ Add charge  ({ladder.length}/10)</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <View style={styles.csHeader}>
          <Text style={commonStyles.sectionTitle}>Chrono Sessions</Text>
          <View style={styles.csHeaderBtns}>
            <TouchableOpacity style={styles.importBtn} onPress={importCs}>
              <Ionicons name="download-outline" size={13} color={C.accent} />
              <Text style={styles.importBtnText}>Import CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={addCs}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>
        </View>
        {cs.map((s, i) => (
          <View key={s.id} style={styles.csCard}>
            <View style={styles.csTitleRow}>
              <Text style={styles.csTitle}>Session {i + 1}{s.distance ? ` — ${s.distance}yd` : ''}</Text>
              <TouchableOpacity onPress={() => delCs(s.id)}><Text style={styles.csDelete}>✕</Text></TouchableOpacity>
            </View>
            {CS_FIELDS.map(({ key, label }) => (
              <View key={key}>
                <Text style={commonStyles.label}>{label}</Text>
                <TextInput style={commonStyles.input} value={s[key] || ''} onChangeText={v => updCs(s.id, key, v)}
                  placeholderTextColor={C.muted} placeholder={label} />
              </View>
            ))}
          </View>
        ))}

        <Text style={commonStyles.sectionTitle}>Notes</Text>
        <TextInput style={[commonStyles.input, styles.textarea]} value={form.notes || ''} onChangeText={v => f('notes', v)}
          placeholderTextColor={C.muted} placeholder="Notes…" multiline numberOfLines={4} />

        <TouchableOpacity style={commonStyles.primaryBtn} onPress={save} disabled={saving}>
          <Text style={commonStyles.primaryBtnText}>{saving ? 'Saving…' : 'Save Load'}</Text>
        </TouchableOpacity>
        {!isNew && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push(`/load/new?from=${form.id}` as any)}>
              <Ionicons name="copy-outline" size={16} color={C.text} />
              <Text style={styles.secondaryText}>Duplicate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push(`/truing/${form.id}` as any)}>
              <Ionicons name="analytics-outline" size={16} color={C.text} />
              <Text style={styles.secondaryText}>True ballistics</Text>
            </TouchableOpacity>
          </View>
        )}
        {!isNew && (
          <TouchableOpacity style={commonStyles.dangerBtn} onPress={del}>
            <Text style={commonStyles.dangerBtnText}>Delete Load</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  chipScroll:   { marginBottom: 12 },
  chip:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginRight: 8, alignItems: 'center' },
  chipOn:       { backgroundColor: C.accent + '22', borderColor: C.accent },
  chipText:     { color: C.muted, fontSize: 13, fontWeight: '600' },
  chipCode:     { color: C.muted, fontSize: 10, fontWeight: '700', marginTop: 1 },
  chipTextOn:   { color: C.accent },
  linkText:     { color: C.accent, fontWeight: '700', marginBottom: 12 },
  statusRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statusBtn:    { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  statusBtnOn:  { backgroundColor: C.accent + '22', borderColor: C.accent },
  statusText:   { color: C.muted, fontSize: 12, fontWeight: '600' },
  statusTextOn: { color: C.accent },
  togRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  togLbl:       { color: C.text, fontSize: 14 },
  csHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn:       { backgroundColor: C.green + '22', borderWidth: 1, borderColor: C.green, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 5 },
  addBtnText:   { color: C.green, fontSize: 12, fontWeight: '700' },
  csHeaderBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  importBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.accent + '18', borderWidth: 1, borderColor: C.accent, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  importBtnText:{ color: C.accent, fontSize: 12, fontWeight: '700' },
  groupWrap:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  groupChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  groupChipOn:    { borderColor: C.accent, backgroundColor: C.accent + '18' },
  groupChipText:  { color: C.muted, fontSize: 13, fontWeight: '600' },
  groupChipTextOn:{ color: C.accent },
  csCard:       { backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.borderHi, padding: 12, marginBottom: 10 },
  csTitleRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  csTitle:      { fontSize: 13, fontWeight: '700', color: C.accent },
  csDelete:     { color: C.red, fontSize: 16, fontWeight: '700' },
  textarea:     { height: 100, textAlignVertical: 'top' },
  loadIdBox:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderHi, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 4 },
  loadIdText:   { color: C.text, fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  prevIds:      { color: C.textSoft, fontSize: 12, marginTop: 3 },
  loadIdHint:   { color: C.muted, fontSize: 11, fontWeight: '600' },
  recCard:      { backgroundColor: C.orange + '10', borderWidth: 1, borderColor: C.orange + '55', borderRadius: 8, padding: 12, marginBottom: 12 },
  recHead:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recTitle:     { color: C.text, fontSize: 14, fontWeight: '700', flex: 1 },
  recDetail:    { color: C.textSoft, fontSize: 12, marginTop: 3, marginBottom: 6 },
  recRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.border },
  recLabel:     { color: C.muted, fontSize: 12, width: 112 },
  recValue:     { color: C.text, fontSize: 14, fontWeight: '600', flex: 1 },
  recWas:       { color: C.muted, fontSize: 11, fontWeight: '400' },
  recUse:       { color: C.orange, fontWeight: '700', fontSize: 13 },
  recNote:      { color: C.textSoft, fontSize: 12, marginTop: 6 },
  recAll:       { marginTop: 8, alignItems: 'center', paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: C.orange },
  recAllText:   { color: C.orange, fontWeight: '700', fontSize: 13 },
  actionRow:    { flexDirection: 'row', gap: 10, marginTop: 10 },
  secondaryBtn: { flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.borderHi, backgroundColor: C.surface, borderRadius: 8, padding: 13 },
  secondaryText:{ color: C.text, fontWeight: '700', fontSize: 14 },
  coalChkRow:    { flexDirection: 'row', gap: 8, marginBottom: 12 },
  coalChk:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  coalChkOn:     { borderColor: C.accent, backgroundColor: C.accent + '18' },
  coalChkText:   { color: C.muted, fontSize: 13, fontWeight: '600' },
  coalChkTextOn: { color: C.accent },
  ladderHead:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, marginTop: 2 },
  ladderH:      { color: C.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', textAlign: 'center' },
  ladderRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  stepNum:      { width: 24, textAlign: 'center', color: C.accent, fontWeight: '700', fontSize: 13 },
  ladderInput:  { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 6, color: C.text, fontSize: 14, paddingVertical: 9, paddingHorizontal: 6, textAlign: 'center' },
  stepDel:      { width: 24, alignItems: 'center' },
  addBtnFull:   { backgroundColor: C.green + '18', borderWidth: 1, borderColor: C.green, borderRadius: 6, padding: 11, alignItems: 'center', marginTop: 2, marginBottom: 6 },
});
