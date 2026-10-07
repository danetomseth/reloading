// Guided truing for one load: 1) muzzle velocity, 2) BC from two
// chronographs, 3) long-range drop. Each step saves into loads.ballistics.
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator, Switch } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { db, Load, Rifle, Session } from '../../lib/supabase';
import { C, commonStyles } from '../../lib/theme';
import { cachedGet, cachedList } from '../../lib/cache';
import { Button, Chips, Field, Note, Row, Segment, Stat, Table, TableRow, useDebounced } from '../../components/Form';
import { belongsTo, rifleOf } from '../../lib/loadIds';
import {
  AtmoText, BallisticProfile, TruingLogEntry, appendLog, atmoFromText, buildInput, chronoRows, num,
  readProfile, scopeUnit, tempPoints, writeProfile,
} from '../../lib/ballisticProfile';
import { densityAltitude } from '../../lib/ballistics/atmosphere';
import { Conditions, SolveInput, solveAt } from '../../lib/ballistics/solver';
import {
  AngleUnit, MIN_SHOTS_FOR_SD, bcRangePlan, bcUncertainty, clickMil, dropTruingPlan, fromMil, mvConfidence,
  mvErrorTable, observedElevationMil, shotsNeeded, solveBcFromVelocities, statsFromShots, tempSensitivity, trueFromDrop,
} from '../../lib/ballistics/truing';
import { parseShotView, ParsedXero, XeroShot } from '../../lib/importXero';

type StepKey = 'mv' | 'bc' | 'drop';
type EnvText = AtmoText & { wind: string; clock: string };
type SaveFn = (next: BallisticProfile, step: TruingLogEntry['step'], summary: string) => void;

const signed = (v: number, d = 0) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;
const angle = (mil: number, u: AngleUnit) => `${fromMil(mil, u).toFixed(2)} ${u === 'mil' ? 'mil' : 'MOA'}`;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

// "12:01:58 PM" → seconds since midnight
function toSec(t: string): number | null {
  const m = (t || '').match(/(\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  if (m[4]) h = (h % 12) + (m[4].toUpperCase() === 'PM' ? 12 : 0);
  return h * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
}

// Pair each muzzle shot with the downrange shot logged within 3 s of it;
// fall back to shot order when the clocks don't line up.
function pairShots(a: XeroShot[], b: XeroShot[]): [number, number][] {
  const bt = b.map(s => toSec(s.time));
  const used = new Set<number>();
  const out: [number, number][] = [];
  for (const sa of a) {
    const ta = toSec(sa.time);
    if (ta == null) continue;
    let best = -1, bestDt = 3;
    bt.forEach((t, i) => {
      if (t == null || used.has(i)) return;
      const dt = Math.abs(t - ta);
      if (dt <= bestDt) { best = i; bestDt = dt; }
    });
    if (best >= 0) { used.add(best); out.push([sa.speed, b[best].speed]); }
  }
  if (out.length < 3 && a.length === b.length) return a.map((s, i) => [s.speed, b[i].speed]);
  return out;
}

export default function Truing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [load,    setLoad]    = useState<Load | null>(null);
  const [rifle,   setRifle]   = useState<Rifle | null>(null);
  const [profile, setProfile] = useState<BallisticProfile | null>(null);
  const [step,    setStep]    = useState<StepKey>('mv');
  const [env,     setEnv]     = useState<EnvText>({ temp: '', pressure: '', humidity: '', altitude: '', wind: '0', clock: '12' });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    (async () => {
      const [ld, rs, ss] = await Promise.all([
        cachedGet<Load>('loads', db.loads.get(id), id),
        cachedList<Rifle>('rifles', db.rifles.getAll()),
        cachedList<Session>('sessions', db.sessions.getAll()),
      ]);
      if (ld) {
        const rf = rifleOf(ld, rs) ?? null;
        setLoad(ld);
        setRifle(rf);
        setProfile(readProfile(ld, rf));
        const recent = ss.find(x => x.load_id === ld.id && (x.temp || x.pressure))
          ?? (rf ? ss.find(x => belongsTo(x, rf) && (x.temp || x.pressure)) : undefined);
        if (recent) {
          setEnv(e => ({ ...e, temp: recent.temp || '', pressure: recent.pressure || '', humidity: recent.humidity || '', altitude: recent.altitude || '' }));
        }
      }
      setLoading(false);
    })();
  }, [id]);

  const unit = scopeUnit(rifle);
  const denv = useDebounced(env, 300);
  const air = useMemo(() => atmoFromText(denv), [denv]);
  const conditions: Conditions = useMemo(() => ({
    atmo: air.atmo, windMph: num(denv.wind) ?? 0, windFromDeg: ((num(denv.clock) ?? 12) % 12) * 30,
  }), [air, denv]);
  const input = useMemo(() => (profile && profile.mv > 0 && profile.bc > 0 ? buildInput(profile, rifle, conditions) : null), [profile, rifle, conditions]);

  const save: SaveFn = async (next, stepName, summary) => {
    if (!load) return;
    setSaving(true);
    const logged = appendLog(next, stepName, summary);
    const patch: Partial<Load> = { ballistics: writeProfile(logged) };
    if (stepName === 'mv') {
      patch.velocity = String(Math.round(next.mv));
      if (next.mvSd != null) patch.sd = next.mvSd.toFixed(1);
    }
    const { error } = await db.loads.update(load.id, patch);
    setSaving(false);
    if (error) {
      Alert.alert('Save failed', error.message + (/column/i.test(error.message) ? '\n\nRun supabase-migration-ids-ballistics.sql first.' : ''));
      return;
    }
    setProfile(logged);
    Alert.alert('Saved', summary);
  };

  if (loading) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;
  if (!load || !profile) return <View style={commonStyles.center}><Text style={{ color: C.muted }}>Load not found.</Text></View>;

  const summary = [
    `${profile.model} ${profile.bc ? profile.bc.toFixed(3) : '—'}${profile.bcMeasured ? ' measured' : ''}`,
    profile.mv ? `${profile.mv.toFixed(0)} fps${profile.mvTempF != null ? ` at ${profile.mvTempF}°F` : ''}` : 'no MV yet',
    profile.tempSens ? `${signed(profile.tempSens, 2)} fps/°F` : '',
    profile.mvDelta ? `MV ${signed(profile.mvDelta)} trued` : '',
    profile.dsf?.length ? `${profile.dsf.length} drag point${profile.dsf.length > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(', ');

  return (
    <>
      <Stack.Screen options={{ title: `True ${load.load_id || 'load'}` }} />
      <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.content}>
        <View style={styles.profile}>
          <Text style={styles.profileTitle}>{rifle?.name ?? load.rifle}: {load.bullet} {load.bullet_wt}gr</Text>
          <Text style={styles.profileText}>{summary}</Text>
        </View>

        <Segment
          options={[{ value: 'mv', label: '1 Velocity' }, { value: 'bc', label: '2 BC' }, { value: 'drop', label: '3 Drop' }]}
          value={step} onChange={setStep}
        />

        {!input && step !== 'mv' && (
          <Note tone="warn">This load needs a muzzle velocity (step 1) and a BC (Ballistics tab) before this step can calculate.</Note>
        )}

        {step === 'mv' && <MvStep load={load} profile={profile} input={input} unit={unit} saving={saving} onSave={save} />}
        {step !== 'mv' && (
          <ConditionsCard env={env} setEnv={setEnv} note={air.note} da={densityAltitude(air.atmo)} />
        )}
        {step === 'bc' && input && <BcStep profile={profile} input={input} saving={saving} onSave={save} />}
        {step === 'drop' && input && <DropStep profile={profile} input={input} unit={unit} saving={saving} onSave={save} />}

        {(profile.log?.length ?? 0) > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>History</Text>
            {[...(profile.log ?? [])].reverse().slice(0, 8).map((e, i) => (
              <Text key={i} style={styles.log}>{e.date}  {e.summary}</Text>
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

function ConditionsCard({ env, setEnv, note, da }: {
  env: EnvText; setEnv: (f: (e: EnvText) => EnvText) => void; note: string | null; da: number;
}) {
  const set = (k: keyof EnvText) => (v: string) => setEnv(e => ({ ...e, [k]: v }));
  return (
    <>
      <Text style={commonStyles.sectionTitle}>Conditions when you shot</Text>
      <Row>
        <Field label="Temp (°F)" value={env.temp ?? ''} onChange={set('temp')} placeholder="59" keyboard="numbers-and-punctuation" />
        <Field label="Station pressure (inHg)" value={env.pressure ?? ''} onChange={set('pressure')} placeholder="29.92" />
      </Row>
      <Row>
        <Field label="Humidity (%)" value={env.humidity ?? ''} onChange={set('humidity')} placeholder="50" keyboard="number-pad" />
        <Field label="Altitude (ft)" value={env.altitude ?? ''} onChange={set('altitude')} placeholder="optional" keyboard="number-pad" />
      </Row>
      <Row>
        <Field label="Wind (mph)" value={env.wind} onChange={set('wind')} />
        <Field label="From (o'clock)" value={env.clock} onChange={set('clock')} hint="12 headwind, 3 from the right" keyboard="number-pad" />
      </Row>
      <Text style={styles.caption}>Density altitude {da.toFixed(0)} ft</Text>
      {note ? <Note tone="warn">{note}</Note> : null}
    </>
  );
}

// ── step 1 ────────────────────────────────────────────────────────────────────
function MvStep({ load, profile, input, unit, saving, onSave }: {
  load: Load; profile: BallisticProfile; input: SolveInput | null; unit: AngleUnit; saving: boolean; onSave: SaveFn;
}) {
  const rows = chronoRows(load).filter(r => num(r.velocity) != null);
  const [src,  setSrc]  = useState('');
  const [avg,  setAvg]  = useState(profile.mv ? String(Math.round(profile.mv * 10) / 10) : '');
  const [sd,   setSd]   = useState(profile.mvSd != null ? String(profile.mvSd) : '');
  const [n,    setN]    = useState(profile.mvShots ? String(profile.mvShots) : '');
  const [temp, setTemp] = useState(profile.mvTempF != null ? String(profile.mvTempF) : '');
  const [garminSd, setGarminSd] = useState(true);
  const [planYd, setPlanYd] = useState('1000');

  const pick = (key: string) => {
    const r = rows.find(x => x.id === key);
    setSrc(key);
    if (!r) return;
    setAvg(r.velocity); setSd(r.sd || ''); setN(r.n || ''); setTemp(r.temp || '');
  };

  const d = useDebounced({ avg, sd, n, garminSd, planYd }, 300);
  const stats = useMemo(() => {
    const m = num(d.avg), s0 = num(d.sd), count = num(d.n);
    if (!m || s0 == null || !count || count < 2) return null;
    const c = Math.round(count);
    return { n: c, mean: m, sd: d.garminSd ? s0 * Math.sqrt(c / (c - 1)) : s0 };
  }, [d]);
  const conf = stats ? mvConfidence(stats) : null;
  const plan = num(d.planYd) ?? 1000;
  const table = useMemo(() => (stats && input
    ? mvErrorTable(input, stats, [...new Set([300, 600, 800, 1000, plan])].sort((a, b) => a - b))
    : []), [stats, input, plan]);
  const planRow = table.find(r => r.rangeYd === plan);
  const needed = stats && planRow ? shotsNeeded(stats.sd, planRow.milPerFps, clickMil(unit) / 2) : MIN_SHOTS_FOR_SD;
  const ts = useMemo(() => tempSensitivity(tempPoints(load)), [load]);

  const doSave = () => {
    if (!stats) return;
    const t = num(temp);
    const next: BallisticProfile = {
      ...profile,
      mv: Math.round(stats.mean * 10) / 10, mvSd: Math.round(stats.sd * 10) / 10, mvShots: stats.n,
      mvTempF: t ?? profile.mvTempF,
      tempSens: ts ? Math.round(ts.fpsPerF * 100) / 100 : profile.tempSens,
    };
    onSave(next, 'mv', `MV ${stats.mean.toFixed(0)} fps, SD ${stats.sd.toFixed(1)}, ${stats.n} shots${t != null ? ` at ${t}°F` : ''}`);
  };

  return (
    <>
      <Text style={styles.lead}>
        Shoot a string over the chronograph and enter the result. Ten shots is the minimum: an SD from fewer is mostly noise.
      </Text>
      {rows.length > 0 && (
        <>
          <Text style={commonStyles.label}>Use a chrono session</Text>
          <Chips items={rows.map(r => ({ key: r.id, label: `${r.date} · ${r.velocity}` }))} selected={src} onSelect={pick} />
        </>
      )}
      <Row>
        <Field label="Average (fps)" value={avg} onChange={setAvg} />
        <Field label="SD (fps)" value={sd} onChange={setSd} />
      </Row>
      <Row>
        <Field label="Shots" value={n} onChange={setN} keyboard="number-pad" />
        <Field label="Temp (°F)" value={temp} onChange={setTemp} keyboard="numbers-and-punctuation" />
      </Row>
      <View style={styles.switchRow}>
        <Text style={styles.switchText}>SD is from a Garmin (divides by n)</Text>
        <Switch value={garminSd} onValueChange={setGarminSd} trackColor={{ true: C.accent }} thumbColor={C.white} />
      </View>

      {stats && conf && (
        <>
          <Row>
            <Stat label="Average" value={`${stats.mean.toFixed(0)} fps`} sub={`±${conf.meanPlusMinus90.toFixed(1)} fps, 90% sure`} />
            <Stat label="True SD" value={`${conf.sdLow90.toFixed(1)}–${conf.sdHigh90.toFixed(1)}`} sub={`measured ${stats.sd.toFixed(1)} fps`} />
          </Row>
          <View style={{ height: 10 }} />
          <Text style={commonStyles.label}>Planning distance (yd)</Text>
          <Chips items={['600', '800', '1000', '1200', '1500'].map(k => ({ key: k, label: k }))} selected={planYd} onSelect={setPlanYd} />
          <Note tone={stats.n >= needed ? 'good' : 'warn'}>
            {stats.n >= needed
              ? `${stats.n} shots is enough. ${needed} keep the average's error under half a click at ${plan} yd.`
              : `Shoot ${needed - stats.n} more. ${needed} shots keep the average's error under half a click at ${plan} yd.`}
          </Note>
          {table.length > 0 ? (
            <>
              <Table
                head={['Range', 'Vertical, 1 SD', 'Dope error']}
                rows={table.map(r => ({
                  cells: [`${r.rangeYd} yd`, `${r.vertical1SdIn.toFixed(1)} in`, `±${angle(r.dopeErr90Mil, unit)}`],
                  tone: r.rangeYd === plan ? 'pick' : undefined,
                }))}
                flex={[0.9, 1.1, 1.2]}
              />
              <Text style={styles.caption}>
                Vertical is what velocity spread alone adds to your groups; about 95% of shots land within twice it.
                Dope error is how far off your elevation could be because the true average isn't known exactly.
              </Text>
            </>
          ) : (
            <Note tone="warn">Add a BC to see what this costs at distance.</Note>
          )}
        </>
      )}

      {ts ? (
        <Note tone={Math.abs(ts.fpsPerF) > 3 ? 'warn' : 'info'}>
          {`Temperature sensitivity ${signed(ts.fpsPerF, 2)} fps per °F, from ${ts.points} sessions spanning ${ts.spanF.toFixed(0)}°F.`}
          {Math.abs(ts.fpsPerF) > 3 ? ' That is unusually high; check the session temperatures.' : ' Saved with the velocity, the solver then adjusts MV for the day.'}
        </Note>
      ) : (
        <Note>Log chrono sessions at temperatures 10°F or more apart and this measures temperature sensitivity, so the solver can adjust MV for the day.</Note>
      )}

      <Button label={saving ? 'Saving…' : 'Save muzzle velocity'} onPress={doSave} disabled={saving || !stats} />
    </>
  );
}

// ── step 2 ────────────────────────────────────────────────────────────────────
function BcStep({ profile, input, saving, onSave }: { profile: BallisticProfile; input: SolveInput; saving: boolean; onSave: SaveFn }) {
  const [dist,   setDist]   = useState('');
  const [v0,     setV0]     = useState('');
  const [v1,     setV1]     = useState('');
  const [n,      setN]      = useState('10');
  const [muzzle, setMuzzle] = useState<ParsedXero | null>(null);
  const [down,   setDown]   = useState<ParsedXero | null>(null);

  const plan = useMemo(() => bcRangePlan(input), [input]);
  const rec = plan.rows.find(r => r.distYd === plan.recommendedYd);
  useEffect(() => { if (!dist && plan.recommendedYd) setDist(String(plan.recommendedYd)); }, [plan.recommendedYd]);

  const pairs = useMemo(() => (muzzle && down ? pairShots(muzzle.shots, down.shots) : []), [muzzle, down]);
  useEffect(() => {
    if (pairs.length < 2) return;
    setN(String(pairs.length));
    setV0(mean(pairs.map(p => p[0])).toFixed(1));
    setV1(mean(pairs.map(p => p[1])).toFixed(1));
  }, [pairs]);

  const pickCsv = async (which: 'muzzle' | 'down') => {
    const res = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values', '*/*'],
    });
    if (res.canceled || !res.assets?.length) return;
    try {
      const parsed = parseShotView(await new File(res.assets[0].uri).text());
      if (!parsed.shots.length) { Alert.alert('No shots found', 'Pick a Garmin ShotView CSV export.'); return; }
      const avg = mean(parsed.shots.map(s => s.speed)).toFixed(1);
      if (which === 'muzzle') { setMuzzle(parsed); setV0(avg); } else { setDown(parsed); setV1(avg); }
      setN(String(parsed.shots.length));
    } catch (e) {
      Alert.alert('Could not read file', String(e));
    }
  };

  const d = useDebounced({ dist, v0, v1, n }, 300);
  const result = useMemo(() => {
    const D = num(d.dist), a = num(d.v0), b = num(d.v1);
    if (!D || !a || !b) return null;
    let scatter: number | undefined;
    if (pairs.length >= 3) {
      const bcs = pairs.map(([p0, p1]) => solveBcFromVelocities(input, p0, p1, D)).filter((x): x is number => x != null);
      scatter = statsFromShots(bcs)?.sd;
    }
    const u = bcUncertainty(input, a, b, D, { shots: Math.max(1, Math.round(num(d.n) ?? 1)), bcScatterSd: scatter });
    if (!u) return { error: 'No BC matches these velocities. Check that the downrange velocity is lower and the distance is right.' };
    const mach = solveAt({ ...input, mv: a, projectile: { ...input.projectile, bc: u.bc } }, D)?.mach ?? 0;
    return { u, mach, D, perShot: scatter != null };
  }, [d, input, pairs]);

  const doSave = () => {
    if (!result || !('u' in result) || !result.u) return;
    const { u, D } = result;
    onSave(
      { ...profile, bc: Math.round(u.bc * 10000) / 10000, bcPublished: profile.bcPublished ?? profile.bc, bcMeasured: true },
      'bc', `BC ${profile.model} ${u.bc.toFixed(3)} ±${u.pct.toFixed(1)}% from ${D} yd`,
    );
  };

  return (
    <>
      <Text style={commonStyles.sectionTitle}>Where to put the second Garmin</Text>
      <Text style={styles.lead}>
        One Garmin at the muzzle, one downrange beside the bullet path. The velocity lost between them measures the BC directly.
      </Text>
      <Table
        head={['Distance', 'Lost', 'BC ±', 'Path']}
        rows={plan.rows.filter(r => r.distYd <= 600).map(r => ({
          cells: [`${r.distYd} yd`, `${r.dropFps.toFixed(0)} fps`, `${r.bcErrPct.toFixed(1)}%`, `${r.bulletPathIn.toFixed(0)} in`],
          tone: r.distYd === plan.recommendedYd ? 'pick' : r.mach < 1.2 ? 'warn' : undefined,
        }))}
        flex={[1.1, 1.1, 0.9, 0.9]}
      />
      {rec && (
        <Note tone="good">
          {`Use ${rec.distYd} yd: about ±${rec.bcErrPct.toFixed(1)}% with 10 shots, assuming each Garmin is good to ±0.1% and the distance to ±1 yd. Under 200 yd, chronograph error swamps the velocity loss.`}
        </Note>
      )}
      {rec && (
        <Note tone="warn">
          {`With your zero and nothing dialed, the bullet is ${Math.abs(rec.bulletPathIn).toFixed(0)} in below the line of sight at ${rec.distYd} yd. Set a target just past the unit and dial for it, keep the unit beside the bullet path behind angled steel, and confirm it registers with a test shot. A headwind or tailwind changes the result, so enter wind above.`}
        </Note>
      )}

      <Text style={commonStyles.sectionTitle}>Your data</Text>
      <Row>
        <Button label={muzzle ? `Muzzle: ${muzzle.shots.length} shots` : 'Muzzle CSV'} kind="secondary" onPress={() => pickCsv('muzzle')} />
        <Button label={down ? `Downrange: ${down.shots.length} shots` : 'Downrange CSV'} kind="secondary" onPress={() => pickCsv('down')} />
      </Row>
      {pairs.length > 0 && <Text style={styles.caption}>{pairs.length} shots paired by time. Per-shot BCs give the scatter.</Text>}
      <View style={{ height: 10 }} />
      <Row>
        <Field label="Distance to unit (yd)" value={dist} onChange={setDist} keyboard="number-pad" />
        <Field label="Shots" value={n} onChange={setN} keyboard="number-pad" />
      </Row>
      <Row>
        <Field label="Muzzle avg (fps)" value={v0} onChange={setV0} />
        <Field label="Downrange avg (fps)" value={v1} onChange={setV1} />
      </Row>

      {result && 'error' in result && <Note tone="warn">{result.error}</Note>}
      {result && 'u' in result && result.u && (
        <>
          <Row>
            <Stat label={`${profile.model} BC`} value={result.u.bc.toFixed(3)} sub={`±${result.u.sigma.toFixed(3)} (${result.u.pct.toFixed(1)}%)`} />
            <Stat label="vs current" value={`${signed((result.u.bc / profile.bc - 1) * 100, 1)}%`} sub={`current ${profile.bc.toFixed(3)}`} />
          </Row>
          <View style={{ height: 10 }} />
          <Text style={styles.caption}>
            {`Uncertainty from chronograph accuracy ±${result.u.fromChrono.toFixed(3)}, distance ±${result.u.fromDistance.toFixed(3)}`}
            {result.perShot ? `, shot-to-shot ±${result.u.fromScatter.toFixed(3)}.` : '.'}
          </Text>
          {result.mach < 1.2 && <Note tone="warn">The bullet is transonic at the downrange unit, so this BC mixes in transonic drag. Move the unit closer.</Note>}
        </>
      )}
      <Button label={saving ? 'Saving…' : 'Save BC'} onPress={doSave} disabled={saving || !result || !('u' in result)} />
    </>
  );
}

// ── step 3 ────────────────────────────────────────────────────────────────────
function DropStep({ profile, input, unit, saving, onSave }: {
  profile: BallisticProfile; input: SolveInput; unit: AngleUnit; saving: boolean; onSave: SaveFn;
}) {
  const [range,  setRange]  = useState('');
  const [dialed, setDialed] = useState('');
  const [offset, setOffset] = useState('0');
  const [shots,  setShots]  = useState('5');

  const plan = useMemo(() => dropTruingPlan(input, unit), [input, unit]);
  useEffect(() => { if (!range && plan.mvRangeYd) setRange(String(plan.mvRangeYd)); }, [plan.mvRangeYd]);
  const minUseful = plan.rows.find(r => r.fpsPerClick <= 15)?.rangeYd ?? null;
  const pickRow = plan.mvRangeYd != null ? Math.floor(plan.mvRangeYd / 100) * 100 : null;

  const d = useDebounced({ range, dialed, offset }, 300);
  const result = useMemo(() => {
    const R = num(d.range), dial = num(d.dialed);
    if (!R || dial == null) return null;
    return trueFromDrop(input, R, observedElevationMil(dial, unit, num(d.offset) ?? 0, R));
  }, [d, input, unit]);

  const doSave = () => {
    if (!result) return;
    if (result.kind === 'mv' && result.mvDelta != null) {
      const total = Math.round(((profile.mvDelta ?? 0) + result.mvDelta) * 10) / 10;
      onSave({ ...profile, mvDelta: total }, 'drop', `MV ${signed(result.mvDelta)} fps from ${result.rangeYd} yd (total ${signed(total)})`);
    } else if (result.kind === 'dsf' && result.dsf && result.node) {
      onSave({ ...profile, dsf: result.dsf }, 'drop', `Drag ×${result.node.factor.toFixed(3)} at Mach ${result.node.mach.toFixed(2)} from ${result.rangeYd} yd`);
    }
  };

  const hasCorrections = !!(profile.mvDelta || profile.dsf?.length);
  const tableRows: TableRow[] = plan.rows.map(r => ({
    cells: [`${r.rangeYd} yd`, r.mach.toFixed(2), angle(r.elevMil, unit), Number.isFinite(r.fpsPerClick) ? r.fpsPerClick.toFixed(0) : '—'],
    tone: r.rangeYd === pickRow ? 'pick' : r.mach < 1.0 ? 'bad' : r.mach < 1.2 ? 'warn' : undefined,
  }));

  return (
    <>
      <Text style={commonStyles.sectionTitle}>Where to shoot</Text>
      <Text style={styles.lead}>
        Shoot a group at long range with the predicted dope, then enter what actually centered it.
      </Text>
      <Note tone="good">
        {plan.mvRangeYd != null
          ? `True muzzle velocity at about ${plan.mvRangeYd} yd, the farthest this load stays clearly supersonic.`
          : 'This load goes transonic early; true velocity at the farthest supersonic distance you can shoot.'}
        {minUseful != null ? ` Closer than ${minUseful} yd one click is worth more than 15 fps, so a check there mostly catches scope tracking or zero errors.` : ''}
      </Note>
      {plan.transonicYd != null && (
        <Note>
          {`Transonic from ${plan.transonicYd} yd.${plan.dsfRangeYd != null ? ` After velocity is trued, true drag around ${plan.dsfRangeYd} yd (Mach 1.0).` : ''}`}
        </Note>
      )}
      <Table head={['Range', 'Mach', 'Elevation', 'fps/click']} rows={tableRows} flex={[1, 0.8, 1.3, 0.9]} />

      <Text style={commonStyles.sectionTitle}>What you shot</Text>
      <Row>
        <Field label="Range (yd)" value={range} onChange={setRange} keyboard="number-pad" />
        <Field label={`Dialed (${unit === 'mil' ? 'mil' : 'MOA'})`} value={dialed} onChange={setDialed} />
      </Row>
      <Row>
        <Field label="Group center vs aim (in)" value={offset} onChange={setOffset} hint="+ high, − low" keyboard="numbers-and-punctuation" />
        <Field label="Shots in group" value={shots} onChange={setShots} keyboard="number-pad" />
      </Row>
      {(num(shots) ?? 0) < 3 && <Note tone="warn">Use the center of at least 3 shots; 5 is better.</Note>}

      {result && (
        <>
          <Row>
            <Stat label="Calculated" value={angle(result.predictedMil, unit)} />
            <Stat label="Observed" value={angle(result.observedMil, unit)} sub={`${signed(fromMil(result.residualMil, unit), 2)} difference`} />
          </Row>
          <View style={{ height: 10 }} />
          {result.kind === 'mv' && result.mvDelta != null && (
            <Note>{`Still supersonic here (Mach ${result.mach.toFixed(2)}), so this trues muzzle velocity: ${signed(result.mvDelta)} fps.`}</Note>
          )}
          {result.kind === 'dsf' && result.node && (
            <Note>{`Transonic here (Mach ${result.mach.toFixed(2)}), so this trues drag: ×${result.node.factor.toFixed(3)} at Mach ${result.node.mach.toFixed(2)}.`}</Note>
          )}
          {result.kind === 'dsf' && !profile.mvDelta && plan.mvRangeYd != null && (
            <Note tone="warn">{`True velocity at about ${plan.mvRangeYd} yd first, or the drag factor absorbs velocity error.`}</Note>
          )}
          {result.warnings.map(w => <Note key={w} tone="warn">{w}</Note>)}
        </>
      )}
      <Button label={saving ? 'Saving…' : 'Save correction'} onPress={doSave}
        disabled={saving || !result || (result.kind === 'mv' ? result.mvDelta == null : !result.node)} />

      {hasCorrections && (
        <>
          <Note>
            {`Saved: ${[profile.mvDelta ? `MV ${signed(profile.mvDelta)} fps` : '', ...(profile.dsf ?? []).map(p => `drag ×${p.factor.toFixed(3)} at Mach ${p.mach.toFixed(2)}`)].filter(Boolean).join(', ')}.`}
          </Note>
          <Button label="Clear long-range corrections" kind="danger" disabled={saving}
            onPress={() => onSave({ ...profile, mvDelta: undefined, dsf: undefined }, 'reset', 'Cleared long-range corrections')} />
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  profile:      { backgroundColor: C.card, borderWidth: 1, borderColor: C.borderHi, borderRadius: 8, padding: 12, marginBottom: 12 },
  profileTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  profileText:  { color: C.textSoft, fontSize: 13, marginTop: 3, lineHeight: 18 },
  lead:         { color: C.textSoft, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  caption:      { color: C.muted, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  switchRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  switchText:   { color: C.text, fontSize: 13, flex: 1 },
  log:          { color: C.textSoft, fontSize: 12, marginBottom: 4 },
});
