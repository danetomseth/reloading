import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { db, Session, Rifle, Load, uid } from '../../lib/supabase';
import { cachedList, cachedGet } from '../../lib/cache';
import { C, Type, commonStyles, F } from '../../lib/theme';
import { belongsTo, rifleOf } from '../../lib/loadIds';
import { atmoFromText, buildInput, num, readProfile, scopeUnit } from '../../lib/ballisticProfile';
import { densityAltitude } from '../../lib/ballistics/atmosphere';
import { solve } from '../../lib/ballistics/solver';
import { fromMil } from '../../lib/ballistics/truing';
import { Button, Chips, HeaderButton, InputItem, NotesInput, Row, Section } from '../../components/Form';
import { LineChart } from '../../components/Chart';
import { shortDate } from '../../lib/metrics';

type RangeRow = { id: string; range: string; calc_drop: string; obs_drop: string; wind: string; windage_hold: string };

const MIGRATION_HINT = '\n\nRun supabase-migration-ids-ballistics.sql in the Supabase SQL editor, then try again.';
const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const emptySession = (): Partial<Session> => ({
  id: uid(), date: new Date().toISOString().slice(0, 10), rifle: '', rifle_id: '', load_id: '',
  location: '', distance: '', temp: '', humidity: '', pressure: '', density_alt: '',
  wind_speed: '', wind_dir: '', altitude: '', scope_adj: '', clicks_up: '',
  clicks_right: '', group_size: '', rounds_fired: '', ranges: '', notes: '',
});

export default function SessionScreen() {
  const params = useLocalSearchParams<{ id: string; rifle?: string; load?: string }>();
  const id = params.id;
  const isNew = id === 'new';
  const router = useRouter();
  const [form,    setForm]    = useState<Partial<Session>>(emptySession);
  const [rifles,  setRifles]  = useState<Rifle[]>([]);
  const [loads,   setLoads]   = useState<Load[]>([]);
  const [ranges,  setRanges]  = useState<RangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const f = (k: keyof Session) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    let alive = true;
    (async () => {
      const [rs, ls] = await Promise.all([
        cachedList<Rifle>('rifles', db.rifles.getAll()),
        cachedList<Load>('loads', db.loads.getAll()),
      ]);
      if (!alive) return;
      setRifles(rs);
      setLoads(ls);
      if (isNew) {
        // started from a load or rifle page: prefill both
        const load = ls.find(l => l.id === params.load);
        const rifle = rs.find(r => r.id === params.rifle) ?? (load ? rifleOf(load, rs) : undefined);
        setForm(p => ({ ...p, rifle: rifle?.name ?? p.rifle, rifle_id: rifle?.id ?? p.rifle_id, load_id: load?.id ?? p.load_id }));
      } else {
        const data = await cachedGet<Session>('sessions', db.sessions.get(id), id);
        if (data && alive) {
          setForm(data);
          try { setRanges(data.ranges ? JSON.parse(data.ranges) : []); } catch { /* keep empty */ }
        }
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [id, isNew, params.rifle, params.load]);

  const curRifle = rifles.find(r => r.id === form.rifle_id) ?? rifleOf(form, rifles);
  const rifleLoads = curRifle ? loads.filter(l => belongsTo(l, curRifle)) : [];
  const unit = scopeUnit(curRifle);

  const air = useMemo(() => (form.temp || form.pressure || form.altitude)
    ? atmoFromText({ temp: form.temp, pressure: form.pressure, humidity: form.humidity, altitude: form.altitude })
    : null, [form.temp, form.pressure, form.humidity, form.altitude]);
  const da = air ? Math.round(densityAltitude(air.atmo)) : null;

  const addRange = () => setRanges(p => [...p, { id: uid(), range: '', calc_drop: '', obs_drop: '', wind: '', windage_hold: '' }]);
  const updRange = (rid: string, k: keyof RangeRow, v: string) => setRanges(p => p.map(r => r.id === rid ? { ...r, [k]: v } : r));
  const delRange = (rid: string) => setRanges(p => p.filter(r => r.id !== rid));

  // fill each range's calculated elevation from the load's ballistic profile
  const fillCalc = () => {
    const load = loads.find(l => l.id === form.load_id);
    if (!load) { Alert.alert('Pick a load', "Calculated drops come from the load's ballistic profile."); return; }
    const prof = readProfile(load, curRifle);
    if (!(prof.mv > 0 && prof.bc > 0)) { Alert.alert('Missing data', 'This load needs a muzzle velocity and BC first (Ballistics tab).'); return; }
    if (ranges.length === 0) { Alert.alert('Add a range', 'Add the distances you shot, then fill in calculated elevations.'); return; }
    const { atmo } = atmoFromText({ temp: form.temp, pressure: form.pressure, humidity: form.humidity, altitude: form.altitude });
    const rows = solve(buildInput(prof, curRifle, { atmo }), ranges.map(r => num(r.range) ?? 0).filter(x => x > 0)).rows;
    setRanges(p => p.map(r => {
      const row = rows.find(x => x.rangeYd === num(r.range));
      return row ? { ...r, calc_drop: fromMil(row.elevMil, unit).toFixed(unit === 'mil' ? 2 : 1) } : r;
    }));
  };

  const save = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await db.sessions.upsert({
      ...form,
      density_alt: da != null ? String(da) : form.density_alt || '',
      ranges: JSON.stringify(ranges),
      updated_at: now, created_at: form.created_at || now,
    });
    setSaving(false);
    if (error) { Alert.alert('Save failed', error.message + (/column/i.test(error.message) ? MIGRATION_HINT : '')); return; }
    router.back();
  };

  const del = () => Alert.alert('Delete session', 'This deletes the session and its dope.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await db.sessions.delete(form.id!); router.back(); } },
  ]);

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  const unitLabel = unit === 'mil' ? 'MIL' : 'MOA';
  const both = ranges
    .map(r => ({ x: num(r.range), calc: num(r.calc_drop), obs: num(r.obs_drop) }))
    .filter((p): p is { x: number; calc: number; obs: number } => p.x != null && p.calc != null && p.obs != null);
  const condFooter = da != null
    ? `Density altitude ${withCommas(da)} ft, calculated.${air?.note ? ` ${air.note}` : ''}`
    : 'Use station pressure (the Kestrel "station" reading), not barometric.';

  return (
    <>
      <Stack.Screen options={{
        title: isNew ? 'New session' : (shortDate(form.date) || 'Session'),
        headerRight: () => <HeaderButton label="Save" disabled={saving} onPress={save} />,
      }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Text style={[commonStyles.sectionTitle, { marginTop: 0 }]}>Rifle</Text>
        <Chips
          items={rifles.map(r => ({ key: r.id, label: r.name }))}
          selected={curRifle?.id ?? null}
          onSelect={rid => {
            const r = rifles.find(x => x.id === rid);
            if (r) setForm(p => ({ ...p, rifle: r.name, rifle_id: r.id, load_id: p.rifle_id === r.id ? p.load_id : '' }));
          }}
        />
        {rifleLoads.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>Load</Text>
            <Chips
              items={rifleLoads.map(l => ({ key: l.id, label: l.load_id || (l.lot_number ? `Lot ${l.lot_number}` : `${l.bullet} ${l.bullet_wt}gr`) }))}
              selected={form.load_id || null}
              onSelect={lid => setForm(p => ({ ...p, load_id: p.load_id === lid ? '' : lid }))}
            />
          </>
        )}

        <Section title="Session">
          <InputItem label="Date" value={form.date || ''} onChange={f('date')} placeholder="YYYY-MM-DD" keyboard="numbers-and-punctuation" />
          <InputItem label="Location" value={form.location || ''} onChange={f('location')} keyboard="default" autoCapitalize="words" />
          <InputItem label="Distance" value={form.distance || ''} onChange={f('distance')} unit="yd" keyboard="number-pad" />
          <InputItem label="Rounds fired" value={form.rounds_fired || ''} onChange={f('rounds_fired')} keyboard="number-pad" />
        </Section>

        <Section title="Conditions" footer={condFooter}>
          <InputItem label="Temperature" value={form.temp || ''} onChange={f('temp')} unit="°F" keyboard="numbers-and-punctuation" />
          <InputItem label="Humidity" value={form.humidity || ''} onChange={f('humidity')} unit="%" keyboard="number-pad" />
          <InputItem label="Station pressure" value={form.pressure || ''} onChange={f('pressure')} unit="inHg" />
          <InputItem label="Altitude" value={form.altitude || ''} onChange={f('altitude')} unit="ft" keyboard="number-pad" />
          <InputItem label="Wind" value={form.wind_speed || ''} onChange={f('wind_speed')} unit="mph" />
          <InputItem label="Wind from" value={form.wind_dir || ''} onChange={f('wind_dir')} placeholder="3 o'clock" keyboard="default" />
        </Section>

        <Section title="Scope">
          <InputItem label="Elevation" value={form.clicks_up || ''} onChange={f('clicks_up')} unit="clicks" keyboard="numbers-and-punctuation" />
          <InputItem label="Windage" value={form.clicks_right || ''} onChange={f('clicks_right')} unit="clicks R" keyboard="numbers-and-punctuation" />
          <InputItem label="Scope notes" value={form.scope_adj || ''} onChange={f('scope_adj')} keyboard="default" />
        </Section>

        <Section title="Dope by range" plain
          actions={[{ label: 'Fill calc', onPress: fillCalc }, { label: 'Add', onPress: addRange }]}
          footer={`Calc is the elevation the solver predicts for this load in these conditions (${unitLabel}). Observed is what actually centered your shots.`}>
          {both.length >= 2 && (
            <View style={{ marginBottom: 12 }}>
              <LineChart series={[
                { points: both.map(p => ({ x: p.x, y: p.calc })), color: C.accent, dots: false },
                { points: both.map(p => ({ x: p.x, y: p.obs })), color: C.orange },
              ]} yFormat={v => (Math.abs(v) < 10 && v % 1 !== 0 ? v.toFixed(1) : v.toFixed(0))} />
              <Text style={st.legend}>Blue line is calculated, orange dots are observed. A gap that grows with distance means it's time to true.</Text>
            </View>
          )}
          {ranges.length === 0
            ? <Text style={Type.sub}>Add each distance you shot to compare calculated and observed dope.</Text>
            : ranges.map((r, i) => (
              <View key={r.id} style={[st.rangeCard, i > 0 && { marginTop: 10 }]}>
                <View style={st.rangeHead}>
                  <Text style={st.rangeTitle}>{r.range ? `${r.range} yd` : `Range ${i + 1}`}</Text>
                  <TouchableOpacity onPress={() => delRange(r.id)}><Text style={st.remove}>Remove</Text></TouchableOpacity>
                </View>
                <Row>
                  <Mini label="Range yd" value={r.range} onChange={v => updRange(r.id, 'range', v)} />
                  <Mini label={`Calc ${unitLabel}`} value={r.calc_drop} onChange={v => updRange(r.id, 'calc_drop', v)} />
                  <Mini label="Observed" value={r.obs_drop} onChange={v => updRange(r.id, 'obs_drop', v)} />
                </Row>
                <Row>
                  <Mini label="Wind" value={r.wind} onChange={v => updRange(r.id, 'wind', v)} />
                  <Mini label="Windage hold" value={r.windage_hold} onChange={v => updRange(r.id, 'windage_hold', v)} />
                </Row>
              </View>
            ))}
        </Section>

        <Section title="Results">
          <InputItem label="Group size" value={form.group_size || ''} onChange={f('group_size')} unit="in" />
        </Section>

        <Section title="Notes">
          <NotesInput value={form.notes || ''} onChange={f('notes')} />
        </Section>

        <Button label={saving ? 'Saving…' : isNew ? 'Save session' : 'Save changes'} onPress={save} disabled={saving} />
        {!isNew && <Button label="Delete session" kind="danger" onPress={del} />}
      </ScrollView>
    </>
  );
}

function Mini({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={st.miniLabel} numberOfLines={1}>{label}</Text>
      <TextInput style={st.miniInput} value={value} onChangeText={onChange} placeholder="—" placeholderTextColor={C.muted} keyboardType="numbers-and-punctuation" />
    </View>
  );
}

const st = StyleSheet.create({
  rangeCard:  { backgroundColor: C.surface, borderRadius: 12, padding: 12 },
  rangeHead:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  rangeTitle: { color: C.text, fontSize: 14, fontFamily: F.bold },
  remove:     { color: C.red, fontSize: 13, fontFamily: F.semibold },
  legend:     { fontFamily: F.regular, color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  miniLabel:  { fontFamily: F.regular, color: C.textSoft, fontSize: 12, marginBottom: 4, marginTop: 6 },
  miniInput:  { fontFamily: F.regular, backgroundColor: C.bg, borderRadius: 8, color: C.text, fontSize: 15, paddingVertical: 8, paddingHorizontal: 10, fontVariant: ['tabular-nums'] },
});
