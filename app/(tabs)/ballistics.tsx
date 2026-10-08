import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Switch, Share, TextInput } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { db, Load, Rifle } from '../../lib/supabase';
import { cachedList } from '../../lib/cache';
import { C, Type, commonStyles, F } from '../../lib/theme';
import { Button, Chips, Disclosure, InputItem, Note, Section, Segment, useDebounced } from '../../components/Form';
import { BarList, LineChart } from '../../components/Chart';
import { Reticle, WindDial } from '../../components/Visuals';
import { belongsTo } from '../../lib/loadIds';
import {
  BallisticProfile, atmoFromText, effectiveMv, num, parseTwist, readProfile, rifleSetup, scopeUnit, writeProfile,
} from '../../lib/ballisticProfile';
import type { DragModelName } from '../../lib/ballistics/drag';
import { densityAltitude } from '../../lib/ballistics/atmosphere';
import { SolveInput, TrajectoryRow, solve } from '../../lib/ballistics/solver';
import { AngleUnit, fromMil } from '../../lib/ballistics/truing';
import { WezTarget, moverLeadMil, wezTable } from '../../lib/ballistics/wez';
import { pooledPrecision, sigmaFromEs } from '../../lib/groups';
import { loadMoa } from '../../lib/metrics';

type BulletText = { mv: string; bc: string; model: DragModelName; weight: string; diameter: string; length: string };
type GunText = { sight: string; zero: string; twist: string };
type EnvText = { temp: string; pressure: string; humidity: string; altitude: string; wind: string; clock: string; look: string; lat: string; az: string };
type Mode = 'dope' | 'hit' | 'reticle';

const DEFAULT_BULLET: BulletText = { mv: '2700', bc: '0.300', model: 'G7', weight: '140', diameter: '0.264', length: '' };
const DEFAULT_GUN: GunText = { sight: '1.75', zero: '100', twist: '8' };
const DEFAULT_ENV: EnvText = { temp: '59', pressure: '29.92', humidity: '50', altitude: '', wind: '10', clock: '3', look: '0', lat: '', az: '' };
const RANK: Record<string, number> = { proven: 3, promising: 2, testing: 1, retired: 0 };

const TARGETS: { key: string; label: string; t: WezTarget }[] = [
  { key: 'm15', label: '1.5 MOA', t: { kind: 'moa', size: 1.5 } },
  { key: 'm2', label: '2 MOA', t: { kind: 'moa', size: 2 } },
  { key: 'm3', label: '3 MOA', t: { kind: 'moa', size: 3 } },
  { key: 'p8', label: '8" plate', t: { kind: 'inches', width: 8, height: 8 } },
  { key: 'p12', label: '12" plate', t: { kind: 'inches', width: 12, height: 12 } },
  { key: 'ipsc', label: 'IPSC 18×30', t: { kind: 'inches', width: 18, height: 30 } },
];
const PART_LABEL: Record<string, string> = { wind: 'Wind call', mv: 'Velocity SD', precision: 'Precision', bc: 'BC', range: 'Ranging' };
const PART_COLOR: Record<string, string> = { wind: C.accent, mv: C.orange, precision: C.purple, bc: C.green, range: C.textSoft };

const signed = (v: number, d = 0) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;
const withCommas = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// dial-able values: 0.1 mil, or quarter MOA
const dial = (mil: number, u: AngleUnit) =>
  u === 'mil' ? (Math.round(mil * 10) / 10).toFixed(1) : (Math.round(fromMil(mil, 'moa') * 4) / 4).toFixed(2);
const windText = (mil: number, u: AngleUnit) => {
  const v = dial(Math.abs(mil), u);
  return Number(v) === 0 ? '0' : `${mil > 0 ? 'R' : 'L'} ${v}`;
};
const clockText = (h: number) => {
  const k = ((Math.round(h) % 12) + 12) % 12;
  return k === 0 ? 'Headwind' : k === 6 ? 'Tailwind' : k === 3 ? 'From the right' : k === 9 ? 'From the left' : `From ${k} o'clock`;
};

// range-card columns: wind holds for 5 and 10 mph full value, 3 mph mover lead
function cardRows(input: SolveInput, ranges: number[]) {
  const calm = solve({ ...input, conditions: { ...input.conditions, windMph: 0 } }, ranges).rows;
  const w5 = solve({ ...input, conditions: { ...input.conditions, windMph: 5, windFromDeg: 90 } }, ranges).rows;
  const w10 = solve({ ...input, conditions: { ...input.conditions, windMph: 10, windFromDeg: 90 } }, ranges).rows;
  return calm.filter(r => r.rangeYd > 0).map(r => ({
    row: r,
    w5: Math.abs((w5.find(x => x.rangeYd === r.rangeYd)?.windMil ?? r.windMil) - r.windMil),
    w10: Math.abs((w10.find(x => x.rangeYd === r.rangeYd)?.windMil ?? r.windMil) - r.windMil),
    lead: moverLeadMil(r, 3),
  }));
}

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
  const [mode,    setMode]    = useState<Mode>('dope');
  const [card,    setCard]    = useState(false);
  const [sel,     setSel]     = useState<number | null>(null);
  const [targetKey, setTargetKey] = useState('p12');
  const [windCall, setWindCall] = useState('2');
  const [hold,    setHold]    = useState<'dial' | 'hold'>('dial');
  const [saving,  setSaving]  = useState(false);

  useFocusEffect(useCallback(() => {
    Promise.all([
      cachedList<Rifle>('rifles', db.rifles.getAll()),
      cachedList<Load>('loads', db.loads.getAll()),
    ]).then(([r, l]) => { setRifles(r); setLoads(l); });
  }, []));

  const rifle = rifles.find(r => r.id === rifleId);
  const rifleLoads = rifle ? loads.filter(l => belongsTo(l, rifle)) : [];
  const load = loads.find(l => l.id === loadId);

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
    const start = Math.max(25, num(d.rng.start) ?? 100);
    const end = Math.min(3000, num(d.rng.end) ?? 1200);
    const step = Math.max(25, num(d.rng.step) ?? 100);
    const ranges: number[] = [];
    for (let r = start; r <= end && ranges.length < 80; r += step) ranges.push(r);
    const traj = solve(input, ranges);
    const tempAdj = profile.tempSens && profile.mvTempF != null ? profile.tempSens * (atmo.tempF - profile.mvTempF) : 0;
    return { input, profile, traj, ranges, note, da: densityAltitude(atmo), tempAdj, transonic: traj.rows.find(r => r.mach < 1.2)?.rangeYd ?? null };
  }, [d]);

  const rows = calc?.traj.rows ?? [];
  const selRow: TrajectoryRow | undefined = rows.find(r => r.rangeYd === sel) ?? rows[Math.min(rows.length - 1, Math.floor(rows.length * 0.6))];
  const cardData = useMemo(() => (calc && mode === 'dope' && card ? cardRows(calc.input, calc.ranges) : null), [calc, mode, card]);

  const precision = useMemo(() => {
    const pooled = pooledPrecision(base?.groups);
    if (pooled) return { sigma: pooled.sigmaMoa, note: `measured from ${pooled.shots} plotted shots` };
    const moa = load ? loadMoa(load) : null;
    if (moa != null) return { sigma: sigmaFromEs(moa, 5), note: `estimated from a ${moa.toFixed(2)} MOA group, assuming 5 shots` };
    return { sigma: 0.25, note: 'assumed; plot a group on the load to measure it' };
  }, [base, load]);
  const mvSd = base?.mvSd ?? num(load?.sd) ?? 10;
  const bcPct = base?.bcMeasured ? 1.5 : 3;
  const target = (TARGETS.find(t => t.key === targetKey) ?? TARGETS[4]).t;
  const wez = useMemo(() => (calc && mode === 'hit'
    ? wezTable(calc.input, { mvSd, bcPct95: bcPct, windMph95: num(windCall) ?? 2, rangeYd95: 2, precisionMoa: precision.sigma }, calc.ranges, target)
    : []), [calc, mode, mvSd, bcPct, windCall, precision, target]);
  const selWez = wez.find(r => r.rangeYd === selRow?.rangeYd) ?? wez[wez.length - 1];

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

  const shareCard = async () => {
    if (!calc) return;
    const u = unit === 'mil' ? 'MIL' : 'MOA';
    const data = cardData ?? cardRows(calc.input, calc.ranges);
    const pad = (s: string, n: number) => s.padStart(n);
    const lines = [
      `${load?.load_id ? `${load.load_id} · ` : ''}${rifle?.name ?? 'Manual profile'}`,
      `MV ${calc.input.mv.toFixed(0)} fps · ${calc.input.projectile.model} ${calc.input.projectile.bc} · zero ${calc.input.rifle.zeroYd} yd`,
      `${calc.input.conditions.atmo.tempF}°F · ${calc.input.conditions.atmo.pressureInHg.toFixed(2)} inHg · DA ${withCommas(calc.da)} ft`,
      '',
      `${pad('Yd', 5)}${pad(`Up ${u}`, 10)}${pad('5 mph', 8)}${pad('10 mph', 8)}${pad('Mover', 8)}`,
      ...data.map(c => `${pad(String(c.row.rangeYd), 5)}${pad(dial(c.row.elevMil, unit), 10)}${pad(dial(c.w5, unit), 8)}${pad(dial(c.w10, unit), 8)}${pad(dial(c.lead, unit), 8)}`),
      '',
      'Wind columns are full-value holds. Mover is a 3 mph lead. From LRS Tracker.',
    ];
    await Share.share({ message: lines.join('\n') });
  };

  const setE = (k: keyof EnvText) => (v: string) => setEnv(e => ({ ...e, [k]: v }));
  const unitLabel = unit === 'mil' ? 'MIL' : 'MOA';
  const hasTruing = !!(base?.mvDelta || base?.dsf?.length);
  const clock = num(env.clock) ?? 12;

  const mvParts: string[] = [];
  if (calc && Math.abs(calc.tempAdj) >= 0.5) mvParts.push(`${signed(calc.tempAdj)} for ${num(env.temp) ?? 59}°F`);
  if (calc && useTruing && base?.mvDelta) mvParts.push(`${signed(base.mvDelta)} trued`);

  const head = card ? ['Yd', `Up ${unitLabel}`, '5 mph', '10 mph', 'Mover'] : ['Yd', `Up ${unitLabel}`, `Wind ${unitLabel}`, 'fps', 'Drop"'];
  const tableRows = card && cardData
    ? cardData.map(c => ({ r: c.row, cells: [String(c.row.rangeYd), dial(c.row.elevMil, unit), dial(c.w5, unit), dial(c.w10, unit), dial(c.lead, unit)] }))
    : rows.map(r => ({ r, cells: [String(r.rangeYd), dial(r.elevMil, unit), windText(r.windMil, unit), r.velocityFps.toFixed(0), r.dropIn.toFixed(1)] }));

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Chips items={[{ key: '', label: 'Manual' }, ...rifles.map(r => ({ key: r.id, label: r.name }))]} selected={rifleId} onSelect={pickRifle} />
      {rifle && (rifleLoads.length > 0
        ? <Chips items={rifleLoads.map(l => ({ key: l.id, label: `${l.load_id || l.bullet || 'load'}${l.status === 'proven' ? ' ★' : ''}` }))} selected={loadId} onSelect={k => pickLoad(k)} />
        : <Text style={st.caption}>No loads for this rifle yet.</Text>)}

      {calc && (
        <View style={st.summary}>
          <Text style={st.summaryMain}>{`${calc.input.mv.toFixed(0)} fps · ${b.model} ${b.bc} · ${calc.input.rifle.zeroYd} yd zero`}</Text>
          <Text style={st.summarySub}>
            {[mvParts.length ? `MV ${mvParts.join(', ')}` : '', `DA ${withCommas(calc.da)} ft`,
              calc.traj.sg != null ? `stability ${calc.traj.sg.toFixed(2)}${calc.traj.sg < 1.4 ? ' (marginal)' : ''}` : '',
              calc.transonic != null ? `transonic ${calc.transonic} yd` : ''].filter(Boolean).join(' · ')}
          </Text>
        </View>
      )}

      <Disclosure title={loadId ? 'Bullet and rifle (from this load)' : 'Bullet and rifle'} initiallyOpen={!loadId}>
        <InputItem label="Muzzle velocity" value={b.mv} onChange={v => setB(p => ({ ...p, mv: v }))} unit="fps" keyboard="number-pad" />
        <InputItem label="BC" value={b.bc} onChange={v => setB(p => ({ ...p, bc: v }))} />
        <View style={st.segPad}>
          <Segment options={[{ value: 'G7', label: 'G7' }, { value: 'G1', label: 'G1' }]} value={b.model} onChange={m => setB(p => ({ ...p, model: m }))} />
        </View>
        <InputItem label="Weight" value={b.weight} onChange={v => setB(p => ({ ...p, weight: v }))} unit="gr" />
        <InputItem label="Diameter" value={b.diameter} onChange={v => setB(p => ({ ...p, diameter: v }))} unit="in" />
        <InputItem label="Length" value={b.length} onChange={v => setB(p => ({ ...p, length: v }))} unit="in" placeholder="for spin drift" />
        <InputItem label="Sight height" value={g.sight} onChange={v => setG(p => ({ ...p, sight: v }))} unit="in" />
        <InputItem label="Zero" value={g.zero} onChange={v => setG(p => ({ ...p, zero: v }))} unit="yd" keyboard="number-pad" />
        <InputItem label="Twist" value={g.twist} onChange={v => setG(p => ({ ...p, twist: v }))} placeholder="1:8" keyboard="numbers-and-punctuation" />
      </Disclosure>

      <Section title="Conditions" footer={calc?.note ?? 'Station pressure is the Kestrel "station" reading, not barometric.'}>
        <InputItem label="Temperature" value={env.temp} onChange={setE('temp')} unit="°F" keyboard="numbers-and-punctuation" />
        <InputItem label="Station pressure" value={env.pressure} onChange={setE('pressure')} unit="inHg" />
        <InputItem label="Humidity" value={env.humidity} onChange={setE('humidity')} unit="%" keyboard="number-pad" />
        <InputItem label="Altitude" value={env.altitude} onChange={setE('altitude')} unit="ft" placeholder="optional" keyboard="number-pad" />
      </Section>

      <Section title="Wind" plain>
        <View style={st.windRow}>
          <WindDial clock={clock} onChange={h => setE('clock')(String(h))} />
          <View style={st.windSide}>
            <Text style={commonStyles.label}>Speed</Text>
            <View style={st.speedBox}>
              <TextInput style={st.speedInput} value={env.wind} onChangeText={setE('wind')} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.muted} />
              <Text style={st.speedUnit}>mph</Text>
            </View>
            <Text style={st.windDir}>{clockText(clock)}</Text>
            <Text style={Type.caption}>Tap where the wind comes from. 12 is your target.</Text>
          </View>
        </View>
      </Section>

      <Disclosure title="Shot angle and Coriolis" summary={num(env.look) ? `${env.look}°` : undefined}>
        <InputItem label="Shot angle" value={env.look} onChange={setE('look')} unit="° up" keyboard="numbers-and-punctuation" />
        <InputItem label="Latitude" value={env.lat} onChange={setE('lat')} unit="°" placeholder="optional" keyboard="numbers-and-punctuation" />
        <InputItem label="Direction of fire" value={env.az} onChange={setE('az')} unit="° from N" placeholder="optional" keyboard="number-pad" />
      </Disclosure>

      <View style={{ marginTop: 22 }}>
        <Segment options={[{ value: 'dope', label: 'Dope' }, { value: 'hit', label: 'Hit %' }, { value: 'reticle', label: 'Reticle' }]} value={mode} onChange={setMode} />
      </View>

      {!calc ? (
        <Note tone="warn">Enter a muzzle velocity and BC to calculate.</Note>
      ) : mode === 'dope' ? (
        <>
          <View style={st.chartCard}>
            <LineChart
              series={[{ points: rows.map(r => ({ x: r.rangeYd, y: fromMil(r.elevMil, unit) })), dots: false, thickness: 2.5 }]}
              band={calc.transonic != null ? { from: calc.transonic, to: rows[rows.length - 1]?.rangeYd ?? calc.transonic, color: C.orange + '1f' } : undefined}
              yFormat={v => (Math.abs(v) < 10 && v % 1 !== 0 ? v.toFixed(1) : v.toFixed(0))}
            />
            <Text style={st.caption}>Elevation ({unitLabel}) by range. Shaded where the bullet is transonic.</Text>
          </View>
          <Segment options={[{ value: 'now', label: 'Current wind' }, { value: 'card', label: 'Range card' }]} value={card ? 'card' : 'now'} onChange={v => setCard(v === 'card')} />
          <View style={st.table}>
            <View style={st.thead}>{head.map((h, i) => <Text key={h} style={[st.th, i === 0 && st.first]}>{h}</Text>)}</View>
            {tableRows.map(({ r, cells }, i) => {
              const tone = r.mach < 1.0 ? C.red : r.mach < 1.2 ? C.orange : C.text;
              const on = r.rangeYd === selRow?.rangeYd;
              return (
                <TouchableOpacity key={r.rangeYd} activeOpacity={0.6} onPress={() => setSel(r.rangeYd)} style={[st.tr, i > 0 && st.trLine, on && st.trOn]}>
                  {cells.map((c, ci) => <Text key={ci} style={[st.td, ci === 0 && st.first, { color: ci === 0 ? tone : C.text }]}>{c}</Text>)}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={st.caption}>
            {card
              ? 'Full-value wind holds for 5 and 10 mph, and the lead for a 3 mph mover. Orange is transonic, red subsonic.'
              : 'Wind is the direction to dial. Orange rows are transonic, red subsonic. Tap a row for the reticle and hit odds at that range.'}
          </Text>
          <Button label="Share range card" kind="secondary" onPress={shareCard} />
        </>
      ) : mode === 'hit' ? (
        <>
          <Text style={commonStyles.label}>Target</Text>
          <Chips items={TARGETS.map(t => ({ key: t.key, label: t.label }))} selected={targetKey} onSelect={setTargetKey} />
          <Text style={commonStyles.label}>Wind call accuracy</Text>
          <Chips items={['1', '2', '3', '4'].map(k => ({ key: k, label: `±${k} mph` }))} selected={windCall} onSelect={setWindCall} />
          {wez.length > 1 && (
            <View style={st.chartCard}>
              <LineChart series={[{ points: wez.map(r => ({ x: r.rangeYd, y: r.hit * 100 })), color: C.green, dots: false, thickness: 2.5 }]} yFormat={v => `${Math.round(v)}%`} />
              <Text style={st.caption}>First-round hit probability by range.</Text>
            </View>
          )}
          {selWez && (
            <Section title={`At ${selWez.rangeYd} yd: ${Math.round(selWez.hit * 100)}% hits`} plain
              footer={`Each bar is that factor's 1-SD miss in inches. Velocity SD ${mvSd.toFixed(0)} fps, BC ±${bcPct}%, ranging ±2 yd, rifle precision ${precision.sigma.toFixed(2)} MOA (${precision.note}). ± values cover about 95% of cases.`}>
              <BarList
                items={[...selWez.parts]
                  .map(p => ({ key: p.key, label: PART_LABEL[p.key], value: Math.max(p.vIn, p.hIn), color: PART_COLOR[p.key] }))
                  .sort((x, y) => y.value - x.value)}
                format={v => `${v.toFixed(1)}"`}
              />
              <Text style={[st.caption, { marginTop: 8, marginBottom: 0 }]}>
                {`Misses spread ${selWez.sigmaH.toFixed(1)}" sideways and ${selWez.sigmaV.toFixed(1)}" up and down (1 SD) on a ${selWez.widthIn.toFixed(0)}×${selWez.heightIn.toFixed(0)}" target.`}
              </Text>
            </Section>
          )}
          <Text style={st.caption}>Tap a range in the Dope view to change it. This assumes your dope is right; it shows how much luck the uncertainties leave.</Text>
        </>
      ) : (
        <>
          <Chips items={rows.map(r => ({ key: String(r.rangeYd), label: `${r.rangeYd} yd` }))} selected={selRow ? String(selRow.rangeYd) : null} onSelect={k => setSel(Number(k))} />
          <Segment options={[{ value: 'dial', label: 'Dial elevation' }, { value: 'hold', label: 'Hold both' }]} value={hold} onChange={setHold} />
          {selRow && (
            <>
              <View style={st.reticleWrap}>
                <Reticle unit={unit} elev={fromMil(selRow.elevMil, unit)} wind={fromMil(selRow.windMil, unit)} mode={hold} />
              </View>
              <Text style={st.reticleText}>
                {hold === 'dial'
                  ? `Dial ${dial(selRow.elevMil, unit)} ${unitLabel} up, then put the target on the red dot.`
                  : 'Put the target on the red dot.'}
              </Text>
              <Text style={st.caption}>{`${selRow.rangeYd} yd · wind ${windText(selRow.windMil, unit)} ${unitLabel} · ${selRow.velocityFps.toFixed(0)} fps · ${selRow.tofS.toFixed(2)} s flight`}</Text>
            </>
          )}
        </>
      )}

      <Section title="Table" style={{ marginTop: 22 }}>
        <InputItem label="From" value={rng.start} onChange={v => setRng(p => ({ ...p, start: v }))} unit="yd" keyboard="number-pad" />
        <InputItem label="To" value={rng.end} onChange={v => setRng(p => ({ ...p, end: v }))} unit="yd" keyboard="number-pad" />
        <InputItem label="Step" value={rng.step} onChange={v => setRng(p => ({ ...p, step: v }))} unit="yd" keyboard="number-pad" />
      </Section>
      <View style={{ marginTop: 12 }}>
        <Segment options={[{ value: 'mil', label: 'MIL' }, { value: 'moa', label: 'MOA' }]} value={unit} onChange={setUnit} />
      </View>
      {hasTruing && (
        <View style={st.switchRow}>
          <Text style={Type.body}>Apply this load's truing</Text>
          <Switch value={useTruing} onValueChange={setUseTruing} trackColor={{ true: C.accent, false: C.border }} thumbColor={C.white} />
        </View>
      )}

      {loadId !== '' && (
        <>
          <Button label="True this load" onPress={() => router.push(`/truing/${loadId}` as any)} />
          <Button label={saving ? 'Saving…' : 'Save bullet data to this load'} kind="secondary" onPress={saveProfile} disabled={saving || !calc} />
        </>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  caption:     { fontFamily: F.regular, color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 6, marginBottom: 10 },
  summary:     { backgroundColor: C.card, borderRadius: 14, padding: 14, marginTop: 4 },
  summaryMain: { fontFamily: F.num, color: C.text, fontSize: 20, fontVariant: ['tabular-nums'] },
  summarySub:  { fontFamily: F.regular, color: C.textSoft, fontSize: 13, marginTop: 4, lineHeight: 18 },
  segPad:      { paddingHorizontal: 12, paddingTop: 10 },
  windRow:     { flexDirection: 'row', alignItems: 'center' },
  windSide:    { flex: 1, marginLeft: 14 },
  speedBox:    { flexDirection: 'row', alignItems: 'baseline', backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  speedInput: { fontFamily: F.numBold, flex: 1, color: C.text, fontSize: 32, fontVariant: ['tabular-nums'], padding: 0 },
  speedUnit:   { fontFamily: F.regular, color: C.muted, fontSize: 14 },
  windDir:     { color: C.text, fontSize: 15, fontFamily: F.semibold, marginTop: 10, marginBottom: 4 },
  chartCard:   { backgroundColor: C.card, borderRadius: 14, padding: 12, marginBottom: 12 },
  table:       { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden' },
  thead:       { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  th: { fontFamily: F.medium, flex: 1, fontSize: 13, color: C.textSoft, textAlign: 'right' },
  tr:          { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12 },
  trLine:      { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  trOn:        { backgroundColor: C.accent + '1c' },
  td: { fontFamily: F.numMedium, flex: 1, fontSize: 17, textAlign: 'right', fontVariant: ['tabular-nums'] },
  first:       { textAlign: 'left', flex: 0.8 },
  reticleWrap: { alignItems: 'center', marginVertical: 8 },
  reticleText: { fontFamily: F.semibold, color: C.text, fontSize: 17, textAlign: 'center', marginTop: 8 },
  switchRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
});
