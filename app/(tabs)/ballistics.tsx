import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Switch } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { db, Load, Rifle } from '../../lib/supabase';
import { C, commonStyles } from '../../lib/theme';
import { cachedList } from '../../lib/cache';
import { Button, Chips, Field, Note, Row, Segment, Table, TableRow, useDebounced } from '../../components/Form';
import { belongsTo } from '../../lib/loadIds';
import {
  BallisticProfile, atmoFromText, effectiveMv, num, parseTwist, readProfile, rifleSetup, scopeUnit, writeProfile,
} from '../../lib/ballisticProfile';
import type { DragModelName } from '../../lib/ballistics/drag';
import { densityAltitude } from '../../lib/ballistics/atmosphere';
import { SolveInput, solve } from '../../lib/ballistics/solver';
import { AngleUnit, fromMil } from '../../lib/ballistics/truing';

type BulletText = { mv: string; bc: string; model: DragModelName; weight: string; diameter: string; length: string };
type GunText = { sight: string; zero: string; twist: string };
type EnvText = { temp: string; pressure: string; humidity: string; altitude: string; wind: string; clock: string; look: string; lat: string; az: string };

const DEFAULT_BULLET: BulletText = { mv: '2700', bc: '0.300', model: 'G7', weight: '140', diameter: '0.264', length: '' };
const DEFAULT_GUN: GunText = { sight: '1.75', zero: '100', twist: '8' };
const DEFAULT_ENV: EnvText = { temp: '59', pressure: '29.92', humidity: '50', altitude: '', wind: '10', clock: '3', look: '0', lat: '', az: '' };
const RANK: Record<string, number> = { proven: 3, promising: 2, testing: 1, retired: 0 };

const signed = (v: number, d = 0) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;

export default function Ballistics() {
  const router = useRouter();
  const [rifles,  setRifles]  = useState<Rifle[]>([]);
  const [loads,   setLoads]   = useState<Load[]>([]);
  const [rifleId, setRifleId] = useState('');
  const [loadId,  setLoadId]  = useState('');
  const [base,    setBase]    = useState<BallisticProfile | null>(null);
  const [b,       setB]       = useState<BulletText>(DEFAULT_BULLET);
  const [g,       setG]       = useState<GunText>(DEFAULT_GUN);
  const [env,     setEnv]     = useState<EnvText>(DEFAULT_ENV);
  const [rng,     setRng]     = useState({ start: '100', end: '1200', step: '100' });
  const [unit,    setUnit]    = useState<AngleUnit>('mil');
  const [useTruing, setUseTruing] = useState(true);
  const [more,    setMore]    = useState(false);
  const [saving,  setSaving]  = useState(false);

  useFocusEffect(useCallback(() => {
    Promise.all([
      cachedList<Rifle>('rifles', db.rifles.getAll()),
      cachedList<Load>('loads', db.loads.getAll()),
    ]).then(([r, l]) => { setRifles(r); setLoads(l); });
  }, []));

  const rifle = rifles.find(r => r.id === rifleId);
  const rifleLoads = rifle ? loads.filter(l => belongsTo(l, rifle)) : [];

  const pickLoad = (lid: string, r: Rifle | undefined = rifle) => {
    const l = loads.find(x => x.id === lid);
    setLoadId(lid);
    if (!l) return;
    const p = readProfile(l, r);
    setBase(p);
    setB({
      mv: p.mv ? String(p.mv) : '', bc: p.bc ? String(p.bc) : '', model: p.model,
      weight: p.weightGr ? String(p.weightGr) : '', diameter: p.diameterIn ? String(p.diameterIn) : '',
      length: p.lengthIn ? String(p.lengthIn) : '',
    });
  };

  const pickRifle = (rid: string) => {
    setRifleId(rid);
    setLoadId('');
    setBase(null);
    const r = rifles.find(x => x.id === rid);
    if (!r) return;
    const s = rifleSetup(r);
    setG({ sight: String(s.sightHeightIn), zero: String(s.zeroYd), twist: r.twist || '' });
    setUnit(scopeUnit(r));
    const best = loads.filter(l => belongsTo(l, r)).sort((x, y) => (RANK[y.status] ?? 1) - (RANK[x.status] ?? 1))[0];
    if (best && (RANK[best.status] ?? 0) >= 2) pickLoad(best.id, r);
  };

  const d = useDebounced({ b, g, env, rng, useTruing, base }, 250);

  const calc = useMemo(() => {
    const mv0 = num(d.b.mv), bc = num(d.b.bc);
    if (!mv0 || !bc) return null;
    const profile: BallisticProfile = {
      ...(d.base ?? { log: [] }),
      model: d.b.model, bc, mv: mv0,
      weightGr: num(d.b.weight) ?? undefined,
      diameterIn: num(d.b.diameter) ?? undefined,
      lengthIn: num(d.b.length) ?? undefined,
    };
    const { atmo, note } = atmoFromText(d.env);
    const tw = parseTwist(d.g.twist);
    const input: SolveInput = {
      mv: effectiveMv(profile, atmo.tempF, d.useTruing),
      projectile: {
        bc, model: d.b.model, weightGr: profile.weightGr ?? 0, diameterIn: profile.diameterIn ?? 0,
        lengthIn: profile.lengthIn, dsf: d.useTruing ? profile.dsf : undefined,
      },
      rifle: { sightHeightIn: num(d.g.sight) ?? 1.5, zeroYd: num(d.g.zero) ?? 100, twistIn: tw.twistIn ?? undefined, twistLeft: tw.left },
      conditions: {
        atmo, windMph: num(d.env.wind) ?? 0, windFromDeg: ((num(d.env.clock) ?? 12) % 12) * 30,
        lookAngleDeg: num(d.env.look) ?? 0, latitudeDeg: num(d.env.lat) ?? undefined, azimuthDeg: num(d.env.az) ?? undefined,
      },
    };
    const start = Math.max(0, num(d.rng.start) ?? 100);
    const end = Math.min(3000, num(d.rng.end) ?? 1200);
    const step = Math.max(25, num(d.rng.step) ?? 100);
    const ranges: number[] = [];
    for (let r = start; r <= end && ranges.length < 80; r += step) ranges.push(r);
    const traj = solve(input, ranges);
    const tempAdj = profile.tempSens && profile.mvTempF != null ? profile.tempSens * (atmo.tempF - profile.mvTempF) : 0;
    return { input, profile, traj, note, da: densityAltitude(atmo), tempAdj, transonic: traj.rows.find(r => r.mach < 1.2)?.rangeYd ?? null };
  }, [d]);

  const saveProfile = async () => {
    if (!loadId || !calc) return;
    setSaving(true);
    const { error } = await db.loads.update(loadId, { ballistics: writeProfile(calc.profile) });
    setSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message + (/column/i.test(error.message) ? '\n\nRun supabase-migration-ids-ballistics.sql first.' : ''));
      return;
    }
    setBase(calc.profile);
    Alert.alert('Saved', 'Bullet data saved to this load.');
  };

  const setE = (k: keyof EnvText) => (v: string) => setEnv(e => ({ ...e, [k]: v }));
  const dec = unit === 'mil' ? 2 : 1;
  const unitLabel = unit === 'mil' ? 'mil' : 'MOA';
  const hasTruing = !!(base?.mvDelta || base?.dsf?.length);

  const rows: TableRow[] = (calc?.traj.rows ?? []).map(r => {
    const e = fromMil(r.elevMil, unit), w = fromMil(r.windMil, unit);
    const wind = Math.abs(w) < 0.5 * 10 ** -dec ? '0' : `${w > 0 ? 'R' : 'L'} ${Math.abs(w).toFixed(dec)}`;
    return {
      cells: [String(r.rangeYd), e.toFixed(dec), wind, r.velocityFps.toFixed(0), r.dropIn.toFixed(1)],
      tone: r.mach < 1.0 ? 'bad' : r.mach < 1.2 ? 'warn' : undefined,
    };
  });

  const mvParts: string[] = [];
  if (calc && Math.abs(calc.tempAdj) >= 0.5) mvParts.push(`${signed(calc.tempAdj)} for ${num(env.temp) ?? 59}°F`);
  if (calc && useTruing && base?.mvDelta) mvParts.push(`${signed(base.mvDelta)} trued`);

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.sectionTitle}>Rifle and load</Text>
      <Chips items={[{ key: '', label: 'Manual' }, ...rifles.map(r => ({ key: r.id, label: r.name }))]} selected={rifleId} onSelect={pickRifle} />
      {rifle && (rifleLoads.length > 0
        ? <Chips items={rifleLoads.map(l => ({ key: l.id, label: `${l.load_id || l.bullet || 'load'}${l.status === 'proven' ? ' ★' : ''}` }))} selected={loadId} onSelect={k => pickLoad(k)} />
        : <Text style={styles.caption}>No loads for this rifle yet.</Text>)}

      <Text style={commonStyles.sectionTitle}>Bullet</Text>
      <Row>
        <Field label="Muzzle velocity (fps)" value={b.mv} onChange={v => setB(p => ({ ...p, mv: v }))} keyboard="number-pad" />
        <Field label="BC" value={b.bc} onChange={v => setB(p => ({ ...p, bc: v }))} />
      </Row>
      <Segment options={[{ value: 'G7', label: 'G7' }, { value: 'G1', label: 'G1' }]} value={b.model} onChange={m => setB(p => ({ ...p, model: m }))} />
      <Row>
        <Field label="Weight (gr)" value={b.weight} onChange={v => setB(p => ({ ...p, weight: v }))} />
        <Field label="Diameter (in)" value={b.diameter} onChange={v => setB(p => ({ ...p, diameter: v }))} />
        <Field label="Length (in)" value={b.length} onChange={v => setB(p => ({ ...p, length: v }))} placeholder="optional" />
      </Row>

      <Text style={commonStyles.sectionTitle}>Rifle</Text>
      <Row>
        <Field label="Sight height (in)" value={g.sight} onChange={v => setG(p => ({ ...p, sight: v }))} />
        <Field label="Zero (yd)" value={g.zero} onChange={v => setG(p => ({ ...p, zero: v }))} keyboard="number-pad" />
        <Field label="Twist (1:?)" value={g.twist} onChange={v => setG(p => ({ ...p, twist: v }))} keyboard="default" />
      </Row>
      {rifle && <Text style={styles.caption}>These come from the rifle. Edit them on the rifle page to keep a change.</Text>}

      <Text style={commonStyles.sectionTitle}>Conditions</Text>
      <Row>
        <Field label="Temp (°F)" value={env.temp} onChange={setE('temp')} keyboard="numbers-and-punctuation" />
        <Field label="Station pressure (inHg)" value={env.pressure} onChange={setE('pressure')} />
      </Row>
      <Row>
        <Field label="Humidity (%)" value={env.humidity} onChange={setE('humidity')} keyboard="number-pad" />
        <Field label="Altitude (ft)" value={env.altitude} onChange={setE('altitude')} placeholder="optional" keyboard="number-pad" />
      </Row>
      <Row>
        <Field label="Wind (mph)" value={env.wind} onChange={setE('wind')} />
        <Field label="From (o'clock)" value={env.clock} onChange={setE('clock')} hint="12 headwind, 3 from the right" keyboard="number-pad" />
      </Row>
      <TouchableOpacity onPress={() => setMore(m => !m)}>
        <Text style={styles.link}>{more ? 'Hide angle and Coriolis' : 'Shot angle and Coriolis'}</Text>
      </TouchableOpacity>
      {more && (
        <Row>
          <Field label="Angle (°)" value={env.look} onChange={setE('look')} hint="+ uphill" keyboard="numbers-and-punctuation" />
          <Field label="Latitude" value={env.lat} onChange={setE('lat')} keyboard="numbers-and-punctuation" />
          <Field label="Azimuth (°)" value={env.az} onChange={setE('az')} hint="0 = north" keyboard="number-pad" />
        </Row>
      )}

      <Text style={commonStyles.sectionTitle}>Table</Text>
      <Row>
        <Field label="From (yd)" value={rng.start} onChange={v => setRng(p => ({ ...p, start: v }))} keyboard="number-pad" />
        <Field label="To (yd)" value={rng.end} onChange={v => setRng(p => ({ ...p, end: v }))} keyboard="number-pad" />
        <Field label="Step (yd)" value={rng.step} onChange={v => setRng(p => ({ ...p, step: v }))} keyboard="number-pad" />
      </Row>
      <Segment options={[{ value: 'mil', label: 'MIL' }, { value: 'moa', label: 'MOA' }]} value={unit} onChange={setUnit} />
      {hasTruing && (
        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Apply this load's truing</Text>
          <Switch value={useTruing} onValueChange={setUseTruing} trackColor={{ true: C.accent }} thumbColor={C.white} />
        </View>
      )}

      {!calc ? (
        <Note tone="warn">Enter a muzzle velocity and BC to calculate.</Note>
      ) : (
        <>
          <Note>
            {`MV ${calc.input.mv.toFixed(0)} fps${mvParts.length ? ` (${mvParts.join(', ')})` : ''}. Density altitude ${calc.da.toFixed(0)} ft.`}
            {calc.transonic != null ? ` Transonic from ${calc.transonic} yd.` : ''}
            {calc.traj.sg != null ? ` Stability ${calc.traj.sg.toFixed(2)}${calc.traj.sg < 1.4 ? ' (marginal)' : ''}.` : ' Add bullet length for real spin drift; it assumes stability 1.5.'}
          </Note>
          {calc.note ? <Note tone="warn">{calc.note}</Note> : null}
          <Table head={['Yd', `Up ${unitLabel}`, `Wind ${unitLabel}`, 'fps', 'Drop in']} rows={rows} flex={[0.8, 1.1, 1.1, 0.9, 1]} />
          <Text style={styles.caption}>Orange rows are transonic (below Mach 1.2), red are subsonic. Wind is the direction to dial.</Text>
        </>
      )}

      {loadId !== '' && (
        <>
          <Button label={saving ? 'Saving…' : 'Save bullet data to this load'} kind="secondary" onPress={saveProfile} disabled={saving || !calc} />
          <Button label="True this load" onPress={() => router.push(`/truing/${loadId}` as any)} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  caption:    { color: C.muted, fontSize: 12, marginBottom: 10 },
  link:       { color: C.accent, fontWeight: '700', fontSize: 13, marginBottom: 10 },
  switchRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  switchText: { color: C.text, fontSize: 14 },
});
