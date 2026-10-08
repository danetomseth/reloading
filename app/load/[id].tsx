import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Switch } from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { db, Load, Rifle, Group, uid, parseLoadIds } from '../../lib/supabase';
import { cachedList, cachedGet } from '../../lib/cache';
import { C, Type, commonStyles, statusColor, F } from '../../lib/theme';
import { PowderInput, BulletLibrary } from '../../components/ReloadPickers';
import { diameterLabel } from '../../lib/reloadData';
import { LAST_RIFLE_KEY, assignCodes, nextLoadId, previousIds, rifleOf } from '../../lib/loadIds';
import { recommend, Suggestion } from '../../lib/recommend';
import { parseShotView, toChronoSession } from '../../lib/importXero';
import { ChronoRow, chronoRows, num, readProfile, tempPoints } from '../../lib/ballisticProfile';
import { PlottedGroup, groupStats, inchesToMoa, pooledPrecision } from '../../lib/groups';
import { tempSensitivity } from '../../lib/ballistics/truing';
import {
  Badge, Button, Chips, Disclosure, EmptyState, HeaderButton, InputItem, Item, NotesInput, Row, Section, Segment,
  StatStrip, Table, ToggleItem,
} from '../../components/Form';
import { LineChart } from '../../components/Chart';
import { CASE_PREP, LadderStep, ladderSteps, loadMoa, longDate, shortDate } from '../../lib/metrics';

const MIGRATION_HINT = '\n\nRun supabase-migration-ids-ballistics.sql in the Supabase SQL editor, then try again.';
const STATUSES = ['testing', 'promising', 'proven', 'retired'] as const;
type Status = typeof STATUSES[number];
const CSV_TYPES = ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values', '*/*'];

// COAL reference checkboxes → each maps to an existing load field
const COAL_REFS: { key: keyof Load; label: string }[] = [
  { key: 'overall_coal',       label: 'SAC COAL' },
  { key: 'max_overall_coal',   label: 'Hornady COAL' },
  { key: 'max_headspace_coal', label: 'OAL' },
];

const today = () => new Date().toISOString().slice(0, 10);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const signed = (v: number, d = 0) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;

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

const memberOf = (gs: Group[], loadId: string) =>
  new Set(gs.filter(g => parseLoadIds(g.load_ids).includes(loadId)).map(g => g.id));

async function pickChronoCsvs(): Promise<ChronoRow[] | null> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: CSV_TYPES });
  if (res.canceled) return null;
  const added: ChronoRow[] = [];
  for (const asset of res.assets) {
    try {
      const parsed = parseShotView(await new File(asset.uri).text());
      if (!parsed.shots.length && !parsed.avg) continue; // not a ShotView CSV
      added.push(toChronoSession(parsed));
    } catch { /* skip unreadable files */ }
  }
  if (!added.length) Alert.alert('No sessions imported', 'No readable ShotView/Xero CSV data found in the selected file(s).');
  return added;
}

// evenly spaced subset of points for axis labels
function spreadTicks<P extends { x: number }>(pts: P[], label: (p: P) => string, max = 4) {
  if (pts.length <= max) return pts.map(p => ({ value: p.x, label: label(p) }));
  return Array.from({ length: max }, (_, i) => pts[Math.round((i * (pts.length - 1)) / (max - 1))]).map(p => ({ value: p.x, label: label(p) }));
}

export default function LoadScreen() {
  const params = useLocalSearchParams<{ id: string; rifle?: string; from?: string }>();
  const id = params.id;
  const isNew = id === 'new';
  const router = useRouter();
  const [load,    setLoad]    = useState<Load | null>(null);
  const [rifles,  setRifles]  = useState<Rifle[]>([]);
  const [loads,   setLoads]   = useState<Load[]>([]);
  const [groups,  setGroups]  = useState<Group[]>([]);
  const [draft,   setDraft]   = useState<{ load: Partial<Load>; groups: Set<string> } | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const drafted = useRef(false);

  const refresh = useCallback(async () => {
    const [rs, ls, gs] = await Promise.all([
      cachedList<Rifle>('rifles', db.rifles.getAll()),
      cachedList<Load>('loads', db.loads.getAll()),
      cachedList<Group>('groups', db.groups.getAll()),
    ]);
    setRifles(rs);
    setLoads(ls);
    setGroups(gs);
    if (isNew) {
      if (!drafted.current) {
        drafted.current = true;
        const src = params.from ? ls.find(x => x.id === params.from) : undefined;
        let d = src ? duplicateOf(src) : emptyLoad();
        const last = await AsyncStorage.getItem(LAST_RIFLE_KEY).catch(() => null);
        const pick = rs.find(x => x.id === params.rifle)
          ?? (src ? rifleOf(src, rs) : undefined)
          ?? rs.find(x => x.id === last)
          ?? (rs.length === 1 ? rs[0] : undefined);
        if (pick) {
          d = { ...d, rifle: pick.name, rifle_id: pick.id, caliber: d.caliber || pick.caliber || '', load_id: nextLoadId(assignCodes(rs)[pick.id], ls) };
        }
        // a duplicate starts in its source's groups
        setDraft({ load: d, groups: src ? memberOf(gs, src.id) : new Set<string>() });
      }
    } else {
      setLoad(await cachedGet<Load>('loads', db.loads.get(id), id));
    }
    setLoading(false);
  }, [id, isNew, params.rifle, params.from]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const spinner = <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;
  if (loading) return spinner;

  if (isNew) {
    if (!draft) return spinner;
    return (
      <LoadEditor
        isNew initial={draft.load} initialGroups={draft.groups} groupInit={new Set<string>()}
        rifles={rifles} loads={loads} groups={groups}
        onSaved={newId => router.replace(`/load/${newId}` as any)}
        onCancel={() => router.back()} onDeleted={() => router.back()}
      />
    );
  }
  if (!load) return <EmptyState icon="alert-circle-outline" title="Load not found" body="It may have been deleted, or it hasn't synced to this phone yet." />;
  if (editing) {
    const inGroups = memberOf(groups, load.id);
    return (
      <LoadEditor
        isNew={false} initial={load} initialGroups={inGroups} groupInit={inGroups}
        rifles={rifles} loads={loads} groups={groups}
        onSaved={() => { setEditing(false); refresh(); }}
        onCancel={() => setEditing(false)} onDeleted={() => router.back()}
      />
    );
  }
  return <LoadView load={load} rifles={rifles} groups={groups} onEdit={() => setEditing(true)} onChanged={refresh} />;
}

// ── summary ─────────────────────────────────────────────────────────────────
function LoadView({ load, rifles, groups, onEdit, onChanged }: {
  load: Load; rifles: Rifle[]; groups: Group[]; onEdit: () => void; onChanged: () => void;
}) {
  const router = useRouter();
  const go = (p: string) => router.push(p as any);
  const [importing, setImporting] = useState(false);

  const rifle = rifleOf(load, rifles);
  const cs = chronoRows(load);
  const ladder = ladderSteps(load);
  const prev = previousIds(load);
  const moa = loadMoa(load);
  const ts = useMemo(() => tempSensitivity(tempPoints(load)), [load]);
  const myGroups = groups.filter(g => parseLoadIds(g.load_ids).includes(load.id));

  const velRows = cs.filter(r => num(r.velocity) != null);
  const velPts = velRows.map((r, i) => ({ x: i, y: num(r.velocity) as number, err: num(r.sd) ?? undefined }));
  const ladderPts = ladder
    .map(s => ({ x: num(s.charge) ?? NaN, y: num(s.velocity) ?? NaN }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const tPts = tempPoints(load).map(p => ({ x: p.tempF, y: p.velocity }));
  const fit = ts && tPts.length >= 2
    ? [Math.min(...tPts.map(p => p.x)), Math.max(...tPts.map(p => p.x))].map(x => ({ x, y: ts.refVelocity + ts.fpsPerF * (x - ts.refTempF) }))
    : [];

  const fires = load.brass_fires === '0' ? 'new' : load.brass_fires ? `${load.brass_fires}× fired` : '';
  const recipeRows = ([
    ['Bullet', [load.bullet, load.bullet_wt ? `${load.bullet_wt} gr` : ''].filter(Boolean).join(' · ')],
    ['Powder', [load.powder, load.charge ? `${load.charge} gr` : ''].filter(Boolean).join(' · ')],
    ['Primer', load.primer],
    ['Brass', [load.brass, fires].filter(Boolean).join(' · ')],
    ...COAL_REFS.map(r => [r.label, load[r.key] ? `${load[r.key]} in` : ''] as [string, string]),
    ['Headspace COAL', load.headspace_coal ? `${load.headspace_coal} in` : ''],
    ['Trim length', load.trim_len ? `${load.trim_len} in` : ''],
    ['Neck tension', load.neck_tension],
    ['Case prep', CASE_PREP.filter(([k]) => !!load[k]).map(([, l]) => l).join(', ')],
    ['BC (G1)', load.bullet_bc],
  ] as [string, string | undefined][]).filter((r): r is [string, string] => !!r[1]);

  const hasStats = !!(load.velocity || load.sd || load.es || load.group_size);
  const plotted: PlottedGroup[] = readProfile(load, rifle).groups ?? [];
  const pooled = pooledPrecision(plotted);

  const removeGroup = (g: PlottedGroup) => Alert.alert('Delete this group?', `${shortDate(g.date)} at ${g.distanceYd} yd, ${g.shots.length} shots.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      let raw: Record<string, unknown> = {};
      try { raw = load.ballistics ? JSON.parse(load.ballistics) : {}; } catch { raw = {}; }
      const groups = (Array.isArray(raw.groups) ? (raw.groups as PlottedGroup[]) : []).filter(x => x.id !== g.id);
      const { error } = await db.loads.update(load.id, { ballistics: JSON.stringify({ ...raw, groups }) });
      if (error) { Alert.alert('Delete failed', error.message); return; }
      onChanged();
    } },
  ]);

  const importCs = async () => {
    const added = await pickChronoCsvs();
    if (!added || !added.length) return;
    setImporting(true);
    const last = added[added.length - 1];
    const { error } = await db.loads.update(load.id, {
      chrono_sessions: JSON.stringify([...cs, ...added]),
      velocity: last.velocity, sd: last.sd, es: last.es,
    });
    setImporting(false);
    if (error) { Alert.alert('Import failed', error.message); return; }
    onChanged();
  };

  return (
    <>
      <Stack.Screen options={{ title: load.load_id || 'Load', headerLeft: undefined, headerRight: () => <HeaderButton label="Edit" onPress={onEdit} /> }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
        <View style={st.hero}>
          <TouchableOpacity disabled={!rifle} onPress={() => rifle && go(`/rifle/${rifle.id}`)}>
            <Text style={st.heroRifle}>{rifle?.name ?? (load.rifle || 'No rifle')}</Text>
          </TouchableOpacity>
          <View style={st.heroRow}>
            <Badge label={cap(load.status || 'testing')} color={statusColor(load.status)} />
            {load.date ? <Text style={Type.caption}>{longDate(load.date)}</Text> : null}
          </View>
          {prev.length > 0 && <Text style={[Type.caption, { marginTop: 6 }]}>Previously {prev.join(', ')}</Text>}
        </View>

        {hasStats ? (
          <StatStrip items={[
            { label: 'Velocity', value: load.velocity || '—', sub: load.velocity ? 'fps' : undefined },
            { label: 'SD', value: load.sd || '—' },
            { label: 'ES', value: load.es || '—' },
            moa != null
              ? { label: 'Group', value: moa.toFixed(2), sub: `MOA · ${load.group_size}" @ ${load.distance}` }
              : { label: 'Group', value: load.group_size || '—', sub: load.group_size ? 'in' : undefined },
          ]} />
        ) : (
          <View style={st.hint}><Text style={Type.sub}>No results yet. Import a Garmin CSV below, or add results in Edit.</Text></View>
        )}

        {recipeRows.length > 0 && (
          <Section title="Recipe">
            {recipeRows.map(([k, v]) => <Item key={k} label={k} value={v} />)}
          </Section>
        )}

        {velPts.length >= 2 && (
          <Section title="Velocity by chrono session" plain footer="Dots are session averages; bars show ±1 SD.">
            <LineChart
              series={[{ points: velPts }]}
              xTicks={spreadTicks(velPts, p => shortDate(velRows[p.x].date) || `#${p.x + 1}`)}
            />
          </Section>
        )}

        {ladder.length > 0 && (
          <Section title="Ladder" plain footer={ladderPts.length >= 2 ? 'Velocity by charge. A flat stretch can hint at a stable charge, but single-shot ladders are noisy, so confirm with a 10-shot string.' : undefined}>
            {ladderPts.length >= 2 && <LineChart series={[{ points: ladderPts, color: C.purple }]} xFormat={v => v.toFixed(1)} />}
            <Table
              head={['Charge', 'Velocity', 'Group']}
              rows={ladder.map(s => ({ cells: [s.charge ? `${s.charge} gr` : '—', s.velocity ? `${s.velocity} fps` : '—', s.group_size ? `${s.group_size}"` : '—'] }))}
            />
          </Section>
        )}

        {ts && tPts.length >= 2 && (
          <Section title="Temperature sensitivity" plain
            footer={`${signed(ts.fpsPerF, 2)} fps per °F across ${ts.spanF.toFixed(0)}°F of sessions. Save it in True ballistics so the solver adjusts for the day.`}>
            <LineChart
              series={[{ points: tPts, color: C.orange, line: false }, { points: fit, color: C.orange + '99', dots: false }]}
              xFormat={v => `${Math.round(v)}°`}
            />
          </Section>
        )}

        {plotted.length > 0 && (
          <Section title="Plotted groups" action="Plot another" onAction={() => go(`/target/${load.id}`)}
            footer={pooled ? `Combined mean radius ${pooled.mrMoa.toFixed(2)} MOA over ${pooled.shots} shots. Tap a group to delete it.` : undefined}>
            {plotted.map(g => {
              const s = groupStats(g.shots);
              if (!s) return null;
              return (
                <Item key={g.id} chevron={false} onPress={() => removeGroup(g)}
                  label={`${shortDate(g.date)} · ${g.distanceYd} yd`}
                  sub={`${s.n} shots · ES ${inchesToMoa(s.es, g.distanceYd).toFixed(2)} MOA`}
                  value={`MR ${inchesToMoa(s.mr, g.distanceYd).toFixed(2)}`} />
              );
            })}
          </Section>
        )}

        <Section title="Chrono sessions" actions={[{ label: importing ? 'Importing…' : 'Import CSV', onPress: importCs }]}>
          {cs.length === 0
            ? <Item label="No chrono sessions yet" sub="Import a Garmin ShotView CSV, or add one in Edit." />
            : [...cs].reverse().map(r => (
              <Item key={r.id} label={shortDate(r.date) || 'Session'}
                sub={[r.n ? `${r.n} shots` : '', r.sd ? `SD ${r.sd}` : '', r.es ? `ES ${r.es}` : '', r.temp ? `${r.temp}°F` : ''].filter(Boolean).join(' · ') || undefined}
                value={r.velocity ? `${r.velocity} fps` : ''} />
            ))}
        </Section>

        {myGroups.length > 0 && (
          <Section title="Groups">
            {myGroups.map(g => <Item key={g.id} label={g.name || 'Untitled group'} onPress={() => go(`/group/${g.id}`)} />)}
          </Section>
        )}

        {load.notes ? <Section title="Notes" plain><Text style={Type.body}>{load.notes}</Text></Section> : null}

        <Section>
          <Item icon="clipboard-outline" label="Log a range session" onPress={() => go(`/session/new?load=${load.id}${rifle ? `&rifle=${rifle.id}` : ''}`)} />
          <Item icon="locate-outline" label="Plot a group" onPress={() => go(`/target/${load.id}`)} />
          <Item icon="analytics-outline" label="True ballistics" onPress={() => go(`/truing/${load.id}`)} />
          <Item icon="copy-outline" label="Duplicate as a new load" onPress={() => go(`/load/new?from=${load.id}`)} />
        </Section>
      </ScrollView>
    </>
  );
}

// ── editor ──────────────────────────────────────────────────────────────────
function LoadEditor({ isNew, initial, initialGroups, groupInit, rifles, loads, groups, onSaved, onCancel, onDeleted }: {
  isNew: boolean; initial: Partial<Load>; initialGroups: Set<string>; groupInit: Set<string>;
  rifles: Rifle[]; loads: Load[]; groups: Group[];
  onSaved: (id: string) => void; onCancel: () => void; onDeleted: () => void;
}) {
  const [form,     setForm]     = useState<Partial<Load>>(initial);
  const [cs,       setCs]       = useState<ChronoRow[]>(() => chronoRows(initial));
  const [ladder,   setLadder]   = useState<LadderStep[]>(() => ladderSteps(initial));
  const [ladderOn, setLadderOn] = useState(() => ladderSteps(initial).length > 0);
  const [coalOn,   setCoalOn]   = useState<Record<string, boolean>>({});
  const [groupSel, setGroupSel] = useState<Set<string>>(initialGroups);
  const [saving,   setSaving]   = useState(false);
  const [plan,     setPlan]     = useState({ start: '', step: '0.3', count: '8' });

  const f = (k: keyof Load, v: any) => setForm(p => ({ ...p, [k]: v }));
  const tf = (k: keyof Load) => (v: string) => f(k, v);

  // fill the ladder from a start charge, step and count
  const fillLadder = () => {
    const s = num(plan.start), step = num(plan.step), n = Math.min(10, Math.max(2, Math.round(num(plan.count) ?? 0)));
    if (s == null || !step) { Alert.alert('Ladder plan', 'Enter a starting charge and a step.'); return; }
    const dec = Math.max(1, (plan.step.split('.')[1] || '').length);
    setLadder(Array.from({ length: n }, (_, i) => ({ id: uid(), charge: (s + i * step).toFixed(dec), velocity: '', group_size: '' })));
  };
  const codes = useMemo(() => assignCodes(rifles), [rifles]);
  const rifle = rifles.find(r => r.id === form.rifle_id) ?? rifleOf(form, rifles);
  const prevIds = previousIds(form);
  const rec = useMemo(() => recommend(form, rifle, loads), [form, rifle, loads]);

  // a COAL ref shows if toggled on, or (before any toggle) if it already has a value
  const coalChecked = (key: keyof Load) => coalOn[key] ?? (String(form[key] || '') !== '');
  const toggleCoal = (key: keyof Load) => {
    const next = !coalChecked(key);
    setCoalOn(p => ({ ...p, [key]: next }));
    if (!next) f(key, '');
  };

  const pickRifle = (rid: string) => {
    const r = rifles.find(x => x.id === rid);
    if (!r) return;
    setForm(p => ({
      ...p, rifle: r.name, rifle_id: r.id,
      caliber: p.caliber || r.caliber || '',
      load_id: isNew ? nextLoadId(codes[r.id], loads) : p.load_id,
    }));
  };

  const applySuggestions = (list: Suggestion[]) => {
    setForm(p => ({ ...p, ...Object.fromEntries(list.map(s => [s.field, s.value])) }));
    const coal = list.filter(s => COAL_REFS.some(r => r.key === s.field)).map(s => [s.field, true]);
    if (coal.length) setCoalOn(p => ({ ...p, ...Object.fromEntries(coal) }));
  };

  const toggleGroup = (gid: string) => setGroupSel(prev => {
    const next = new Set(prev);
    next.has(gid) ? next.delete(gid) : next.add(gid);
    return next;
  });

  const importCs = async () => {
    const added = await pickChronoCsvs();
    if (added && added.length) setCs(p => [...p, ...added]);
  };
  const addCs = () => setCs(p => [...p, { id: uid(), date: today(), temp: '', distance: '', velocity: '', sd: '', es: '', group_size: '', n: '' }]);
  const updCs = (sid: string, k: keyof ChronoRow, v: string) => setCs(p => p.map(s => s.id === sid ? { ...s, [k]: v } : s));
  const delCs = (sid: string) => setCs(p => p.filter(s => s.id !== sid));

  const addStep = () => setLadder(p => p.length >= 10 ? p : [...p, { id: uid(), charge: '', velocity: '', group_size: '' }]);
  const updStep = (sid: string, k: keyof LadderStep, v: string) => setLadder(p => p.map(s => s.id === sid ? { ...s, [k]: v } : s));
  const delStep = (sid: string) => setLadder(p => p.filter(s => s.id !== sid));
  const toggleLadder = (on: boolean) => {
    setLadderOn(on);
    if (on && ladder.length === 0) setLadder([{ id: uid(), charge: '', velocity: '', group_size: '' }]);
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
      Alert.alert('Save failed', error.message + (/column/i.test(error.message) ? MIGRATION_HINT : ''));
      return;
    }
    // sync group memberships — only the groups whose membership changed
    for (const g of groups) {
      const was = groupInit.has(g.id), nowIn = groupSel.has(g.id);
      if (was === nowIn) continue;
      const ids = new Set(parseLoadIds(g.load_ids));
      nowIn ? ids.add(payload.id!) : ids.delete(payload.id!);
      await db.groups.upsert({ ...g, load_ids: JSON.stringify([...ids]), updated_at: now });
    }
    setSaving(false);
    AsyncStorage.setItem(LAST_RIFLE_KEY, rifle.id).catch(() => {});
    onSaved(payload.id!);
  };

  const del = () => Alert.alert('Delete load', 'This deletes the load and its chrono data.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await db.loads.delete(form.id!); onDeleted(); } },
  ]);

  const moreFilled = !!(form.trim_len || form.neck_tension || form.bullet_bc || CASE_PREP.some(([k]) => !!form[k]));
  const resultsFilled = !!(form.velocity || form.sd || form.es || form.group_size || form.distance);

  return (
    <>
      <Stack.Screen options={{
        title: isNew ? 'New load' : 'Edit load',
        headerLeft: isNew ? undefined : () => <HeaderButton label="Cancel" onPress={onCancel} />,
        headerRight: () => <HeaderButton label="Save" disabled={saving} onPress={save} />,
      }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={st.idBox}>
          <Text style={[st.idText, !form.load_id && { color: C.muted }]}>{form.load_id || 'Pick a rifle'}</Text>
          <Text style={Type.caption}>{prevIds.length ? `Previously ${prevIds.join(', ')}` : isNew ? 'Next ID for this rifle' : 'Load ID'}</Text>
        </View>

        <Text style={commonStyles.sectionTitle}>Rifle</Text>
        {rifles.length === 0
          ? <Section style={{ marginTop: 0 }}><Item icon="add" tone="accent" label="Add a rifle first" onPress={onCancel} /></Section>
          : <Chips items={rifles.map(r => ({ key: r.id, label: `${r.name}  ${codes[r.id]}` }))} selected={rifle?.id ?? null} onSelect={pickRifle} />}

        <Segment
          options={STATUSES.map(s => ({ value: s, label: cap(s) }))}
          value={(STATUSES as readonly string[]).includes(form.status || '') ? (form.status as Status) : 'testing'}
          onChange={v => f('status', v)}
        />

        <Text style={commonStyles.sectionTitle}>Bullet</Text>
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
        <Section style={{ marginTop: 0 }}>
          <InputItem label="Bullet" value={form.bullet || ''} onChange={tf('bullet')} placeholder="Berger LRHT" keyboard="default" autoCapitalize="words" />
          <InputItem label="Weight" value={form.bullet_wt || ''} onChange={tf('bullet_wt')} unit="gr" />
        </Section>

        {rec && (rec.suggestions.length > 0 || rec.notes.length > 0) && (
          <View style={st.recCard}>
            <View style={st.recHead}>
              <Ionicons name="bulb-outline" size={16} color={C.orange} />
              <Text style={st.recTitle}>{rec.title}</Text>
            </View>
            {rec.detail ? <Text style={st.recDetail}>{rec.detail}</Text> : null}
            {rec.suggestions.map(s => (
              <View key={String(s.field)} style={st.recRow}>
                <Text style={st.recLabel}>{s.label}</Text>
                <Text style={st.recValue}>{s.value}{s.current ? <Text style={st.recWas}>{`  now ${s.current}`}</Text> : null}</Text>
                <TouchableOpacity onPress={() => applySuggestions([s])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={st.recUse}>Use</Text>
                </TouchableOpacity>
              </View>
            ))}
            {rec.notes.map(n => <Text key={n} style={st.recNote}>{n}</Text>)}
            {rec.suggestions.length > 1 && (
              <TouchableOpacity style={st.recAll} onPress={() => applySuggestions(rec.suggestions)}>
                <Text style={st.recAllText}>Use all {rec.suggestions.length}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ marginTop: 18 }}>
          <PowderInput value={form.powder || ''} onChange={tf('powder')} />
        </View>
        <Section style={{ marginTop: 0 }}>
          <InputItem label="Charge" value={form.charge || ''} onChange={tf('charge')} unit="gr" />
          <InputItem label="Primer" value={form.primer || ''} onChange={tf('primer')} keyboard="default" autoCapitalize="words" />
          <InputItem label="Brass" value={form.brass || ''} onChange={tf('brass')} keyboard="default" autoCapitalize="words" />
          <InputItem label="Times fired" value={form.brass_fires || ''} onChange={tf('brass_fires')} keyboard="number-pad" />
        </Section>

        <Text style={commonStyles.sectionTitle}>Seating</Text>
        <View style={st.coalRow}>
          {COAL_REFS.map(r => {
            const on = coalChecked(r.key);
            return (
              <TouchableOpacity key={r.key} style={[st.coalChip, on && st.coalChipOn]} onPress={() => toggleCoal(r.key)}>
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={on ? C.accent : C.muted} />
                <Text style={[st.coalText, on && { color: C.accent }]}>{r.label.replace(' COAL', '')}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Section style={{ marginTop: 0 }}>
          {COAL_REFS.filter(r => coalChecked(r.key)).map(r => (
            <InputItem key={r.key} label={r.label} value={String(form[r.key] || '')} onChange={v => f(r.key, v)} unit="in" />
          ))}
          <InputItem label="Headspace COAL" value={form.headspace_coal || ''} onChange={tf('headspace_coal')} unit="in" />
        </Section>

        <Disclosure title="More details" initiallyOpen={moreFilled} summary={[form.caliber, form.trim_len && `trim ${form.trim_len}`].filter(Boolean).join(', ')}>
          <InputItem label="Caliber" value={form.caliber || ''} onChange={tf('caliber')} keyboard="default" />
          <InputItem label="BC (G1)" value={form.bullet_bc || ''} onChange={tf('bullet_bc')} />
          <InputItem label="Trim length" value={form.trim_len || ''} onChange={tf('trim_len')} unit="in" />
          <InputItem label="Neck tension" value={form.neck_tension || ''} onChange={tf('neck_tension')} keyboard="default" />
          {CASE_PREP.map(([k, label]) => <ToggleItem key={k} label={label} value={!!form[k]} onChange={v => f(k, v ? 1 : 0)} />)}
        </Disclosure>

        {groups.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>Groups</Text>
            <View style={st.coalRow}>
              {groups.map(g => {
                const on = groupSel.has(g.id);
                return (
                  <TouchableOpacity key={g.id} style={[st.coalChip, on && st.coalChipOn]} onPress={() => toggleGroup(g.id)}>
                    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={on ? C.accent : C.muted} />
                    <Text style={[st.coalText, on && { color: C.accent }]}>{g.name || 'Untitled'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <Disclosure title="Results" initiallyOpen={resultsFilled}
          summary={[form.velocity && `${form.velocity} fps`, form.sd && `SD ${form.sd}`].filter(Boolean).join(', ')}>
          <InputItem label="Velocity" value={form.velocity || ''} onChange={tf('velocity')} unit="fps" />
          <InputItem label="SD" value={form.sd || ''} onChange={tf('sd')} unit="fps" />
          <InputItem label="ES" value={form.es || ''} onChange={tf('es')} unit="fps" />
          <InputItem label="Group size" value={form.group_size || ''} onChange={tf('group_size')} unit="in" />
          <InputItem label="Distance" value={form.distance || ''} onChange={tf('distance')} unit="yd" keyboard="number-pad" />
        </Disclosure>

        <Disclosure title="Ladder test" initiallyOpen={ladderOn} plain summary={ladderOn ? `${ladder.length} charges` : 'off'}>
          <View style={st.switchRow}>
            <Text style={Type.body}>Record a ladder</Text>
            <Switch value={ladderOn} onValueChange={toggleLadder} trackColor={{ true: C.accent, false: C.border }} thumbColor={C.white} />
          </View>
          {ladderOn && (
            <>
              <View style={st.planRow}>
                <Mini label="Start gr" value={plan.start} onChange={v => setPlan(p => ({ ...p, start: v }))} />
                <Mini label="Step gr" value={plan.step} onChange={v => setPlan(p => ({ ...p, step: v }))} />
                <Mini label="Charges" value={plan.count} onChange={v => setPlan(p => ({ ...p, count: v }))} />
                <TouchableOpacity style={[st.smallBtn, { marginTop: 0 }]} onPress={fillLadder}><Text style={st.smallBtnText}>Fill</Text></TouchableOpacity>
              </View>
              <View style={st.ladderHead}>
                <Text style={[st.ladderH, { width: 22 }]}>#</Text>
                <Text style={[st.ladderH, { flex: 1 }]}>Charge gr</Text>
                <Text style={[st.ladderH, { flex: 1 }]}>Velocity</Text>
                <Text style={[st.ladderH, { flex: 1 }]}>Group in</Text>
                <View style={{ width: 22 }} />
              </View>
              {ladder.map((s, i) => (
                <View key={s.id} style={st.ladderRow}>
                  <Text style={st.stepNum}>{i + 1}</Text>
                  <TextInput style={st.cell} value={s.charge} onChangeText={v => updStep(s.id, 'charge', v)} placeholder="—" placeholderTextColor={C.muted} keyboardType="decimal-pad" />
                  <TextInput style={st.cell} value={s.velocity} onChangeText={v => updStep(s.id, 'velocity', v)} placeholder="—" placeholderTextColor={C.muted} keyboardType="number-pad" />
                  <TextInput style={st.cell} value={s.group_size} onChangeText={v => updStep(s.id, 'group_size', v)} placeholder="—" placeholderTextColor={C.muted} keyboardType="decimal-pad" />
                  <TouchableOpacity style={{ width: 22, alignItems: 'center' }} onPress={() => delStep(s.id)}>
                    <Ionicons name="close" size={16} color={C.muted} />
                  </TouchableOpacity>
                </View>
              ))}
              {ladder.length < 10 && (
                <TouchableOpacity style={st.smallBtn} onPress={addStep}>
                  <Text style={st.smallBtnText}>Add charge ({ladder.length}/10)</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </Disclosure>

        <Disclosure title={`Chrono sessions${cs.length ? ` (${cs.length})` : ''}`} initiallyOpen={cs.length > 0} plain>
          <View style={st.csBtns}>
            <TouchableOpacity style={st.smallBtn} onPress={importCs}><Text style={st.smallBtnText}>Import CSV</Text></TouchableOpacity>
            <TouchableOpacity style={st.smallBtn} onPress={addCs}><Text style={st.smallBtnText}>Add session</Text></TouchableOpacity>
          </View>
          {cs.map((s, i) => (
            <View key={s.id} style={st.csCard}>
              <View style={st.csHead}>
                <Text style={st.csTitle}>Session {i + 1}</Text>
                <TouchableOpacity onPress={() => delCs(s.id)}><Text style={st.csRemove}>Remove</Text></TouchableOpacity>
              </View>
              <Row><Mini label="Date" value={s.date} onChange={v => updCs(s.id, 'date', v)} keyboard="numbers-and-punctuation" /><Mini label="Temp °F" value={s.temp} onChange={v => updCs(s.id, 'temp', v)} /></Row>
              <Row><Mini label="Velocity" value={s.velocity} onChange={v => updCs(s.id, 'velocity', v)} /><Mini label="SD" value={s.sd} onChange={v => updCs(s.id, 'sd', v)} /></Row>
              <Row><Mini label="ES" value={s.es} onChange={v => updCs(s.id, 'es', v)} /><Mini label="Shots" value={s.n || ''} onChange={v => updCs(s.id, 'n', v)} /></Row>
              <Row><Mini label="Distance yd" value={s.distance} onChange={v => updCs(s.id, 'distance', v)} /><Mini label="Group in" value={s.group_size} onChange={v => updCs(s.id, 'group_size', v)} /></Row>
            </View>
          ))}
        </Disclosure>

        <Section title="Notes">
          <NotesInput value={form.notes || ''} onChange={tf('notes')} />
        </Section>

        <Button label={saving ? 'Saving…' : isNew ? 'Save load' : 'Save changes'} onPress={save} disabled={saving} />
        {!isNew && <Button label="Delete load" kind="danger" onPress={del} />}
      </ScrollView>
    </>
  );
}

function Mini({ label, value, onChange, keyboard = 'decimal-pad' }: {
  label: string; value: string; onChange: (v: string) => void; keyboard?: 'decimal-pad' | 'numbers-and-punctuation';
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={st.miniLabel}>{label}</Text>
      <TextInput style={st.miniInput} value={value} onChangeText={onChange} placeholder="—" placeholderTextColor={C.muted} keyboardType={keyboard} />
    </View>
  );
}

const st = StyleSheet.create({
  hero:        { marginBottom: 14 },
  heroRifle:   { color: C.accent, fontSize: 15, fontFamily: F.bold },
  heroRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  hint:        { backgroundColor: C.card, borderRadius: 14, padding: 14 },
  idBox:       { backgroundColor: C.card, borderRadius: 14, padding: 16 },
  idText: { fontFamily: F.numBold, color: C.text, fontSize: 32, letterSpacing: 0.6, marginBottom: 2, fontVariant: ['tabular-nums'] },
  recCard:     { backgroundColor: C.orange + '12', borderRadius: 14, padding: 14, marginTop: 14 },
  recHead:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recTitle:    { color: C.text, fontSize: 15, fontFamily: F.bold, flex: 1 },
  recDetail:   { fontFamily: F.regular, color: C.textSoft, fontSize: 13, marginTop: 3, marginBottom: 6 },
  recRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  recLabel:    { fontFamily: F.regular, color: C.textSoft, fontSize: 13, width: 112 },
  recValue:    { color: C.text, fontSize: 15, fontFamily: F.semibold, flex: 1 },
  recWas:      { color: C.muted, fontSize: 12, fontFamily: F.regular },
  recUse:      { color: C.orange, fontFamily: F.bold, fontSize: 14 },
  recNote:     { fontFamily: F.regular, color: C.textSoft, fontSize: 13, marginTop: 6 },
  recAll:      { marginTop: 10, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: C.orange + '22' },
  recAllText:  { color: C.orange, fontFamily: F.bold, fontSize: 14 },
  coalRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  coalChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: C.surface },
  coalChipOn:  { backgroundColor: C.accent + '22' },
  coalText:    { color: C.textSoft, fontSize: 14, fontFamily: F.semibold },
  switchRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  planRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10 },
  ladderHead:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginTop: 4 },
  ladderH:     { color: C.textSoft, fontSize: 12, fontFamily: F.semibold, textAlign: 'center' },
  ladderRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  stepNum:     { width: 22, textAlign: 'center', color: C.accent, fontFamily: F.bold, fontSize: 13 },
  cell:        { fontFamily: F.regular, flex: 1, backgroundColor: C.surface, borderRadius: 8, color: C.text, fontSize: 15, paddingVertical: 9, paddingHorizontal: 6, textAlign: 'center', fontVariant: ['tabular-nums'] },
  smallBtn:    { alignSelf: 'flex-start', backgroundColor: C.accent + '22', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginTop: 4 },
  smallBtnText:{ color: C.accent, fontFamily: F.bold, fontSize: 14 },
  csBtns:      { flexDirection: 'row', gap: 10, marginBottom: 6 },
  csCard:      { backgroundColor: C.surface, borderRadius: 12, padding: 12, marginTop: 10 },
  csHead:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  csTitle:     { color: C.text, fontSize: 14, fontFamily: F.bold },
  csRemove:    { color: C.red, fontSize: 13, fontFamily: F.semibold },
  miniLabel:   { fontFamily: F.regular, color: C.textSoft, fontSize: 12, marginBottom: 4, marginTop: 4 },
  miniInput:   { fontFamily: F.regular, backgroundColor: C.bg, borderRadius: 8, color: C.text, fontSize: 15, paddingVertical: 8, paddingHorizontal: 10, fontVariant: ['tabular-nums'] },
});
