import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { db, supabase, Rifle, Load, Session, uid } from '../../lib/supabase';
import { cachedGet, cachedList } from '../../lib/cache';
import { C, Type, commonStyles, statusColor } from '../../lib/theme';
import { Button, EmptyState, HeaderButton, InputItem, Item, NotesInput, Section, Segment, Table } from '../../components/Form';
import { BarList, ChartPoint, ColumnChart, LineChart } from '../../components/Chart';
import { assignCodes, belongsTo, cleanCode, parseLoadId } from '../../lib/loadIds';
import { headline, loadMoa, monthlyTotals, recipe, shortDate } from '../../lib/metrics';
import { num } from '../../lib/ballisticProfile';

const MIGRATION_HINT = '\n\nRun supabase-migration-ids-ballistics.sql in the Supabase SQL editor, then try again.';

const empty = (): Partial<Rifle> => ({
  id: uid(), name: '', caliber: '', barrel_len: '', twist: '',
  scope_model: '', scope_height: '', scope_unit: 'moa', muzzle_device: '', notes: '',
  code: '', zero_range: '100',
});

export default function RifleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === 'new';
  const [rifle,    setRifle]    = useState<Rifle | null>(null);
  const [rifles,   setRifles]   = useState<Rifle[]>([]);
  const [loads,    setLoads]    = useState<Load[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editing,  setEditing]  = useState(isNew);
  const [loading,  setLoading]  = useState(true);
  const [draft]                 = useState(empty);

  const refresh = useCallback(async () => {
    const [rs, ls, ss] = await Promise.all([
      cachedList<Rifle>('rifles', db.rifles.getAll()),
      cachedList<Load>('loads', db.loads.getAll()),
      cachedList<Session>('sessions', db.sessions.getAll()),
    ]);
    setRifles(rs);
    setLoads(ls);
    setSessions(ss);
    if (!isNew) setRifle(await cachedGet<Rifle>('rifles', db.rifles.get(id), id));
    setLoading(false);
  }, [id, isNew]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  if (editing) {
    return (
      <RifleEditor
        initial={isNew ? draft : (rifle ?? draft)} isNew={isNew} rifles={rifles}
        onSaved={rid => { if (isNew) router.replace(`/rifle/${rid}` as any); else { setEditing(false); refresh(); } }}
        onCancel={() => setEditing(false)}
        onDeleted={() => router.back()}
      />
    );
  }
  if (!rifle) return <EmptyState icon="alert-circle-outline" title="Rifle not found" />;
  return <RifleView rifle={rifle} rifles={rifles} loads={loads} sessions={sessions} onEdit={() => setEditing(true)} />;
}

function RifleView({ rifle, rifles, loads, sessions, onEdit }: {
  rifle: Rifle; rifles: Rifle[]; loads: Load[]; sessions: Session[]; onEdit: () => void;
}) {
  const router = useRouter();
  const go = (path: string) => router.push(path as any);
  const code = assignCodes(rifles)[rifle.id] || cleanCode(rifle.code || '');

  const mine = useMemo(() => loads.filter(l => belongsTo(l, rifle))
    .sort((a, b) => (parseLoadId(b.load_id)?.seq ?? 0) - (parseLoadId(a.load_id)?.seq ?? 0)), [loads, rifle]);
  const bars = mine.map(l => ({ l, moa: loadMoa(l) }))
    .filter((x): x is { l: Load; moa: number } => x.moa != null)
    .sort((a, b) => a.moa - b.moa).slice(0, 8);
  const mySessions = sessions.filter(s => belongsTo(s, rifle)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const dope = mySessions
    .filter(s => num(s.distance) != null && (s.clicks_up || s.clicks_right))
    .sort((a, b) => (num(a.distance) ?? 0) - (num(b.distance) ?? 0));
  const dopePts: ChartPoint[] = dope
    .map(s => ({ x: num(s.distance) ?? NaN, y: num(s.clicks_up) ?? NaN }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

  const rounds = mySessions.reduce((a, s) => a + (num(s.rounds_fired) ?? 0), 0);
  const byMonth = monthlyTotals(mySessions, s => s.date, s => num(s.rounds_fired) ?? 0);
  const sdBars = mine
    .map(l => ({ l, sd: num(l.sd) }))
    .filter((x): x is { l: Load; sd: number } => x.sd != null && x.sd > 0)
    .sort((a, b) => a.sd - b.sd).slice(0, 8);

  const twist = rifle.twist ? (rifle.twist.includes(':') ? rifle.twist : `1:${rifle.twist}`) : '';
  const facts: [string, string][] = ([
    ['Caliber', rifle.caliber],
    ['Load ID code', code],
    ['Barrel', rifle.barrel_len ? `${rifle.barrel_len} in` : ''],
    ['Twist', twist],
    ['Muzzle device', rifle.muzzle_device],
    ['Scope', [rifle.scope_model, rifle.scope_unit === 'mrad' ? 'MIL' : rifle.scope_unit ? 'MOA' : ''].filter(Boolean).join(' · ')],
    ['Sight height', rifle.scope_height ? `${rifle.scope_height} in` : ''],
    ['Zero', rifle.zero_range ? `${rifle.zero_range} yd` : ''],
    ['Rounds logged', rounds > 0 ? String(rounds).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''],
  ] as [string, string | undefined][]).filter((f): f is [string, string] => !!f[1]);

  return (
    <>
      <Stack.Screen options={{ title: rifle.name, headerLeft: undefined, headerRight: () => <HeaderButton label="Edit" onPress={onEdit} /> }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
        <Section style={{ marginTop: 0 }}>
          {facts.map(([k, v]) => <Item key={k} label={k} value={v} />)}
        </Section>

        <Section title={`Loads (${mine.length})`} action="New load" onAction={() => go(`/load/new?rifle=${rifle.id}`)}>
          {mine.length === 0
            ? <Item label={`New loads are numbered ${code}-001, ${code}-002…`} />
            : mine.map(l => (
              <Item key={l.id} dot={statusColor(l.status)} label={l.load_id || 'No ID yet'} sub={recipe(l) || undefined}
                value={headline(l)} onPress={() => go(`/load/${l.id}`)} />
            ))}
        </Section>

        {bars.length >= 2 && (
          <Section title="Group size by load" plain footer="In MOA, so groups shot at different distances compare. Tap a bar to open the load.">
            <BarList
              items={bars.map(({ l, moa }) => ({ key: l.id, label: l.load_id || l.bullet || 'Load', value: moa, color: statusColor(l.status), onPress: () => go(`/load/${l.id}`) }))}
              format={v => `${v.toFixed(2)} MOA`}
            />
          </Section>
        )}

        {sdBars.length >= 2 && (
          <Section title="Velocity SD by load" plain footer="Lower is better. Trust SDs from 20 or more shots; small strings swing a lot.">
            <BarList
              items={sdBars.map(({ l, sd }) => ({ key: l.id, label: l.load_id || l.bullet || 'Load', value: sd, color: statusColor(l.status), onPress: () => go(`/load/${l.id}`) }))}
              format={v => `${v.toFixed(1)} fps`}
            />
          </Section>
        )}

        {rounds > 0 && (
          <Section title="Rounds by month" plain footer="From rounds fired in your range sessions.">
            <ColumnChart items={byMonth} />
          </Section>
        )}

        {dope.length > 0 && (
          <Section title="Dope" plain footer="From your range sessions, as logged (scope clicks).">
            {dopePts.length >= 2 && <LineChart series={[{ points: dopePts }]} height={170} />}
            <Table
              head={['Range', 'Up', 'Right', 'Temp', 'Date']}
              rows={dope.map(s => ({ cells: [`${s.distance} yd`, s.clicks_up || '—', s.clicks_right || '—', s.temp ? `${s.temp}°` : '—', shortDate(s.date)] }))}
              flex={[1.1, 0.8, 0.8, 0.8, 1]}
            />
          </Section>
        )}

        {mySessions.length > 0 && (
          <Section title="Recent range sessions">
            {mySessions.slice(0, 5).map(s => (
              <Item key={s.id} label={shortDate(s.date) || 'Undated'}
                sub={[loads.find(l => l.id === s.load_id)?.load_id, s.location].filter(Boolean).join(' · ') || undefined}
                value={[s.distance ? `${s.distance} yd` : '', s.group_size ? `${s.group_size}"` : ''].filter(Boolean).join('  ')}
                onPress={() => go(`/session/${s.id}`)} />
            ))}
          </Section>
        )}

        {rifle.notes ? (
          <Section title="Notes" plain><Text style={Type.body}>{rifle.notes}</Text></Section>
        ) : null}

        <Section>
          <Item icon="clipboard-outline" label="Log a range session" onPress={() => go(`/session/new?rifle=${rifle.id}`)} />
        </Section>
      </ScrollView>
    </>
  );
}

function RifleEditor({ initial, isNew, rifles, onSaved, onCancel, onDeleted }: {
  initial: Partial<Rifle>; isNew: boolean; rifles: Rifle[];
  onSaved: (id: string) => void; onCancel: () => void; onDeleted: () => void;
}) {
  const [form,   setForm]   = useState<Partial<Rifle>>(initial);
  const [saving, setSaving] = useState(false);
  const f = (k: keyof Rifle) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const suggested = useMemo(() => {
    const others = rifles.filter(r => r.id !== form.id);
    return assignCodes([...others, { ...(form as Rifle), code: '' }])[form.id!] || 'R';
  }, [rifles, form.id, form.name, form.caliber]);
  const code = cleanCode(form.code || '') || suggested;
  const codeChanged = !isNew && cleanCode(initial.code || '') !== '' && cleanCode(initial.code || '') !== code;

  const save = async () => {
    if (!form.name?.trim()) { Alert.alert('Name required', 'Give the rifle a name.'); return; }
    const clash = rifles.find(r => r.id !== form.id && cleanCode(r.code || '') === code);
    if (clash) { Alert.alert('Code already used', `${clash.name} already uses ${code}. Pick another so load IDs stay unique.`); return; }
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await db.rifles.upsert({ ...form, code, updated_at: now, created_at: form.created_at || now });
    if (!error && !isNew && initial.id && initial.name && initial.name !== form.name) {
      // keep loads and sessions attached after a rename
      await supabase.from('loads').update({ rifle: form.name, rifle_id: initial.id }).eq('rifle', initial.name);
      await supabase.from('loads').update({ rifle: form.name }).eq('rifle_id', initial.id);
      await supabase.from('sessions').update({ rifle: form.name, rifle_id: initial.id }).eq('rifle', initial.name);
      await supabase.from('sessions').update({ rifle: form.name }).eq('rifle_id', initial.id);
    }
    setSaving(false);
    if (error) { Alert.alert('Save failed', error.message + (/column/i.test(error.message) ? MIGRATION_HINT : '')); return; }
    onSaved(form.id!);
  };

  const del = () => Alert.alert('Delete rifle', 'Its loads and sessions stay, but lose their rifle link.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await db.rifles.delete(form.id!); onDeleted(); } },
  ]);

  return (
    <>
      <Stack.Screen options={{
        title: isNew ? 'New rifle' : 'Edit rifle',
        headerLeft: isNew ? undefined : () => <HeaderButton label="Cancel" onPress={onCancel} />,
        headerRight: () => <HeaderButton label="Save" disabled={saving} onPress={save} />,
      }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Section title="Rifle" style={{ marginTop: 0 }}
          footer={`Loads for this rifle are numbered ${code}-001, ${code}-002…${codeChanged ? ' Existing loads keep their IDs until you renumber them from Loads.' : ''}`}>
          <InputItem label="Name" value={form.name || ''} onChange={f('name')} placeholder="Required" keyboard="default" autoCapitalize="words" />
          <InputItem label="Caliber" value={form.caliber || ''} onChange={f('caliber')} placeholder="6.5 Creedmoor" keyboard="default" autoCapitalize="words" />
          <InputItem label="Load ID code" value={form.code || ''} onChange={v => setForm(p => ({ ...p, code: cleanCode(v) }))} placeholder={suggested} keyboard="default" autoCapitalize="characters" />
          <InputItem label="Barrel length" value={form.barrel_len || ''} onChange={f('barrel_len')} unit="in" />
          <InputItem label="Twist" value={form.twist || ''} onChange={f('twist')} placeholder="1:8" keyboard="numbers-and-punctuation" />
          <InputItem label="Muzzle device" value={form.muzzle_device || ''} onChange={f('muzzle_device')} keyboard="default" autoCapitalize="words" />
        </Section>

        <Section title="Scope" footer="Sight height is center of bore to center of scope. Add LH to the twist for a left-hand barrel.">
          <InputItem label="Model" value={form.scope_model || ''} onChange={f('scope_model')} keyboard="default" autoCapitalize="words" />
          <InputItem label="Sight height" value={form.scope_height || ''} onChange={f('scope_height')} unit="in" />
          <InputItem label="Zero" value={form.zero_range || ''} onChange={f('zero_range')} unit="yd" keyboard="number-pad" />
        </Section>
        <View style={st.segWrap}>
          <Segment
            options={[{ value: 'moa', label: 'MOA turrets' }, { value: 'mrad', label: 'MIL turrets' }]}
            value={form.scope_unit === 'mrad' ? 'mrad' : 'moa'}
            onChange={v => setForm(p => ({ ...p, scope_unit: v }))}
          />
        </View>

        <Section title="Notes">
          <NotesInput value={form.notes || ''} onChange={f('notes')} />
        </Section>

        <Button label={saving ? 'Saving…' : isNew ? 'Add rifle' : 'Save changes'} onPress={save} disabled={saving} />
        {!isNew && <Button label="Delete rifle" kind="danger" onPress={del} />}
      </ScrollView>
    </>
  );
}

const st = StyleSheet.create({
  segWrap: { marginTop: 12 },
});
