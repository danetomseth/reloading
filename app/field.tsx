// Field mode: one screen for the range. Pick the rifle and load once; range,
// wind and air are big, quick controls, and the dope is the biggest thing on
// screen. The trajectory is solved once on a 10-yd grid (calm and 10 mph
// full-value), so changing range or wind is instant.
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, Load, Rifle, Session } from '../lib/supabase';
import { cachedList } from '../lib/cache';
import { C, F, Type, commonStyles } from '../lib/theme';
import { Chips, EmptyState, InputItem, Section, Segment, useDebounced } from '../components/Form';
import { Reticle, WindDial } from '../components/Visuals';
import { belongsTo } from '../lib/loadIds';
import { atmoFromText, bcWarning, buildInput, num, readProfile, scopeUnit } from '../lib/ballisticProfile';
import { densityAltitude } from '../lib/ballistics/atmosphere';
import { TrajectoryRow, solve } from '../lib/ballistics/solver';
import { lookup } from '../lib/ballistics/lookup';
import { AngleUnit, fromMil } from '../lib/ballistics/truing';
import { WezTarget, moverLeadMil, wezTable } from '../lib/ballistics/wez';
import { pooledPrecision, sigmaFromEs } from '../lib/groups';
import { RANK, loadMoa, shortDate } from '../lib/metrics';
import { setMode } from '../lib/mode';

type Tab = 'wind' | 'air' | 'reticle' | 'card';
type State = {
  rifleId: string; loadId: string; range: string; windLo: string; windHi: string; clock: number;
  temp: string; pressure: string; humidity: string; altitude: string; target: string; mover: string;
};
const STATE_KEY = 'lrs.field.state';
const DEFAULT: State = {
  rifleId: '', loadId: '', range: '500', windLo: '5', windHi: '5', clock: 3,
  temp: '', pressure: '', humidity: '', altitude: '', target: 'm2', mover: '0',
};
const TARGETS: { key: string; label: string; t: WezTarget }[] = [
  { key: 'm15', label: '1.5 MOA', t: { kind: 'moa', size: 1.5 } },
  { key: 'm2', label: '2 MOA', t: { kind: 'moa', size: 2 } },
  { key: 'p12', label: '12" plate', t: { kind: 'inches', width: 12, height: 12 } },
  { key: 'ipsc', label: 'IPSC', t: { kind: 'inches', width: 18, height: 30 } },
];
const QUICK = [300, 400, 500, 600, 700, 800, 1000, 1200];

const dial = (mil: number, u: AngleUnit) =>
  u === 'mil' ? (Math.round(mil * 10) / 10).toFixed(1) : (Math.round(fromMil(mil, 'moa') * 4) / 4).toFixed(2);
const withCommas = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const clockText = (h: number) => {
  const k = ((Math.round(h) % 12) + 12) % 12;
  return k === 0 ? 'Headwind' : k === 6 ? 'Tailwind' : k === 3 ? 'From the right' : k === 9 ? 'From the left' : `From ${k} o'clock`;
};
const bestLoad = (ls: Load[]) => [...ls].sort((a, b) => (RANK[b.status] ?? 1) - (RANK[a.status] ?? 1))[0];

export default function Field() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rifles,   setRifles]   = useState<Rifle[]>([]);
  const [loads,    setLoads]    = useState<Load[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [s,        setS]        = useState<State>(DEFAULT);
  const [ready,    setReady]    = useState(false);
  const [picking,  setPicking]  = useState(false);
  const [tab,      setTab]      = useState<Tab>('wind');
  const [hold,     setHold]     = useState<'dial' | 'hold'>('dial');
  const set = (patch: Partial<State>) => setS(p => ({ ...p, ...patch }));

  useEffect(() => {
    (async () => {
      const [rs, ls, ss, saved] = await Promise.all([
        cachedList<Rifle>('rifles', db.rifles.getAll()),
        cachedList<Load>('loads', db.loads.getAll()),
        cachedList<Session>('sessions', db.sessions.getAll()),
        AsyncStorage.getItem(STATE_KEY).catch(() => null),
      ]);
      setRifles(rs); setLoads(ls); setSessions(ss);
      let st: State = { ...DEFAULT };
      try { if (saved) st = { ...st, ...JSON.parse(saved) }; } catch { /* start fresh */ }
      if (!rs.some(r => r.id === st.rifleId)) {
        // first run: the rifle with the best-rated load
        const best = bestLoad(ls.filter(l => rs.some(r => belongsTo(l, r))));
        const rifle = best ? rs.find(r => belongsTo(best, r)) : rs[0];
        st = { ...st, rifleId: rifle?.id ?? '', loadId: best?.id ?? '' };
      }
      if (!st.temp && !st.pressure) {
        const last = [...ss].sort((a, b) => (b.date || '').localeCompare(a.date || '')).find(x => x.temp || x.pressure);
        if (last) st = { ...st, temp: last.temp || '', pressure: last.pressure || '', humidity: last.humidity || '', altitude: last.altitude || '' };
      }
      setS(st);
      setReady(true);
    })();
  }, []);

  // remember everything for next time
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => { AsyncStorage.setItem(STATE_KEY, JSON.stringify(s)).catch(() => {}); }, 400);
    return () => clearTimeout(t);
  }, [s, ready]);

  const rifle = rifles.find(r => r.id === s.rifleId);
  const rifleLoads = useMemo(() => (rifle ? loads.filter(l => belongsTo(l, rifle)) : []), [rifle, loads]);
  const load = rifleLoads.find(l => l.id === s.loadId) ?? bestLoad(rifleLoads);
  const profile = useMemo(() => (load ? readProfile(load, rifle) : null), [load, rifle]);
  const unit = scopeUnit(rifle);
  const unitLabel = unit === 'mil' ? 'MIL' : 'MOA';

  const envText = useDebounced({ temp: s.temp, pressure: s.pressure, humidity: s.humidity, altitude: s.altitude }, 300);
  const air = useMemo(() => atmoFromText(envText), [envText]);

  const tables = useMemo(() => {
    if (!profile || !(profile.mv > 0 && profile.bc > 0)) return null;
    const base = buildInput(profile, rifle, { atmo: air.atmo });
    const ranges = Array.from({ length: 201 }, (_, i) => i * 10);
    return {
      base,
      calm: solve(base, ranges).rows,
      w10: solve({ ...base, conditions: { ...base.conditions, windMph: 10, windFromDeg: 90 } }, ranges).rows,
      head10: solve({ ...base, conditions: { ...base.conditions, windMph: 10, windFromDeg: 0 } }, ranges).rows,
    };
  }, [profile, rifle, air]);

  const R = Math.max(25, Math.min(2000, num(s.range) ?? 500));
  const row = tables ? lookup(tables.calm, R) : null;
  const row10 = tables ? lookup(tables.w10, R) : null;
  const rowH = tables ? lookup(tables.head10, R) : null;
  const cross = Math.sin(((s.clock % 12) * Math.PI) / 6);  // +1 from the right
  const head = Math.cos(((s.clock % 12) * Math.PI) / 6);   // +1 headwind
  // crosswind adds aerodynamic jump; a head or tail component changes drop
  const elevAt = (r: TrajectoryRow | null, r10: TrajectoryRow | null, rh: TrajectoryRow | null, mph: number) =>
    r && r10 && rh ? r.elevMil + (r10.elevMil - r.elevMil) * (mph / 10) * cross + (rh.elevMil - r.elevMil) * (mph / 10) * head : (r?.elevMil ?? 0);
  const windAt = (r: TrajectoryRow | null, r10: TrajectoryRow | null, mph: number) =>
    r && r10 ? r.windMil + (r10.windMil - r.windMil) * (mph / 10) * cross : 0;
  const lo = num(s.windLo) ?? 0;
  const hi = Math.max(lo, num(s.windHi) ?? lo);
  const wLo = windAt(row, row10, lo), wHi = windAt(row, row10, hi), wMid = windAt(row, row10, (lo + hi) / 2);
  const elev = elevAt(row, row10, rowH, (lo + hi) / 2);
  const moverMph = num(s.mover) ?? 0;
  const lead = row && moverMph > 0 ? moverLeadMil(row, moverMph) : 0;

  // hit chance: the gust range is the wind-call uncertainty
  const precision = useMemo(() => {
    const pooled = pooledPrecision(profile?.groups);
    if (pooled) return pooled.sigmaMoa;
    const moa = load ? loadMoa(load) : null;
    return moa != null ? sigmaFromEs(moa, 5) : 0.25;
  }, [profile, load]);
  const wezKey = useDebounced({ R, lo, hi, target: s.target, clock: s.clock }, 350);
  const hit = useMemo(() => {
    if (!tables || !profile) return null;
    const target = TARGETS.find(t => t.key === wezKey.target) ?? TARGETS[1];
    const input = { ...tables.base, conditions: { ...tables.base.conditions, windMph: (wezKey.lo + wezKey.hi) / 2, windFromDeg: (wezKey.clock % 12) * 30 } };
    const res = wezTable(input, {
      mvSd: profile.mvSd ?? num(load?.sd) ?? 10,
      bcPct95: profile.bcMeasured ? 1.5 : 3,
      windMph95: Math.max(1, (wezKey.hi - wezKey.lo) / 2 || 2),
      rangeYd95: 2,
      precisionMoa: precision,
    }, [wezKey.R], target.t)[0];
    return res ? { pct: Math.round(res.hit * 100), label: target.label } : null;
  }, [tables, profile, wezKey, precision, load]);

  const bcWarn = profile ? bcWarning(profile.model, profile.bc, profile.weightGr, profile.diameterIn) : null;
  const lastSession = useMemo(() => [...sessions].sort((a, b) => (b.date || '').localeCompare(a.date || '')).find(x => x.temp || x.pressure), [sessions]);

  const toFull = () => { setMode('full'); router.replace('/' as any); };
  const bump = (d: number) => set({ range: String(Math.max(25, Math.min(2000, R + d))) });
  const cycleTarget = () => {
    const i = TARGETS.findIndex(t => t.key === s.target);
    set({ target: TARGETS[(i + 1) % TARGETS.length].key });
  };
  const pickRifle = (id: string) => {
    const r = rifles.find(x => x.id === id);
    if (!r) return;
    set({ rifleId: id, loadId: bestLoad(loads.filter(l => belongsTo(l, r)))?.id ?? '' });
  };
  const fixBc = async () => {
    if (!load || !profile) return;
    let raw: Record<string, unknown> = {};
    try { raw = load.ballistics ? JSON.parse(load.ballistics) : {}; } catch { raw = {}; }
    const ballistics = JSON.stringify({ ...raw, model: 'G1', bc: profile.bc });
    const { error } = await db.loads.update(load.id, { ballistics });
    if (error) { Alert.alert('Could not save', error.message); return; }
    setLoads(ls => ls.map(l => (l.id === load.id ? { ...l, ballistics } : l)));
  };

  if (!ready) return <View style={commonStyles.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  const windText = Math.abs(wHi - wLo) < 0.05 || lo === hi
    ? dial(Math.abs(wMid), unit)
    : `${dial(Math.min(Math.abs(wLo), Math.abs(wHi)), unit)}–${dial(Math.max(Math.abs(wLo), Math.abs(wHi)), unit)}`;
  const cardRows = tables ? tables.calm.filter(r => r.rangeYd >= 100 && r.rangeYd % 100 === 0 && r.rangeYd <= 1500) : [];

  return (
    <View style={[commonStyles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={st.top}>
        <TouchableOpacity style={st.who} activeOpacity={0.7} onPress={() => setPicking(p => !p)}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.whoRifle} numberOfLines={1}>{rifle?.name ?? 'Pick a rifle'}</Text>
            <Text style={st.whoLoad} numberOfLines={1}>
              {load ? [load.load_id || 'Load', load.bullet ? `${load.bullet} ${load.bullet_wt}gr` : ''].filter(Boolean).join(', ') : 'No load'}
            </Text>
          </View>
          <Ionicons name={picking ? 'chevron-up' : 'chevron-down'} size={18} color={C.textSoft} />
        </TouchableOpacity>
        <TouchableOpacity style={st.fullBtn} onPress={toFull} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="grid-outline" size={17} color={C.accent} />
          <Text style={st.fullText}>Full app</Text>
        </TouchableOpacity>
      </View>
      {picking && (
        <View style={st.picker}>
          <Chips items={rifles.map(r => ({ key: r.id, label: r.name }))} selected={s.rifleId} onSelect={pickRifle} />
          {rifleLoads.length > 0 && (
            <Chips
              items={rifleLoads.map(l => ({ key: l.id, label: `${l.load_id || l.bullet || 'Load'}${l.status === 'proven' ? ' ★' : ''}` }))}
              selected={load?.id ?? null}
              onSelect={id => { set({ loadId: id }); setPicking(false); }}
            />
          )}
        </View>
      )}

      <ScrollView contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {!rifle || !load ? (
          <EmptyState icon="locate-outline" title={rifles.length ? 'This rifle has no loads yet' : 'No rifles yet'}
            body="Add a rifle and a load with its velocity and BC in the full app." action="Open the full app" onAction={toFull} />
        ) : !tables || !row ? (
          <EmptyState icon="alert-circle-outline" title="This load needs velocity and BC"
            body={`Add a muzzle velocity and BC to ${load.load_id || 'this load'} to get dope.`}
            action="Open the load" onAction={() => router.push(`/load/${load.id}` as any)} />
        ) : (
          <>
            <View style={st.dope}>
              <View style={st.cols}>
                <View style={st.col}>
                  <Text style={st.colLabel}>Elevation</Text>
                  <View style={st.bigRow}>
                    <Text style={st.big} adjustsFontSizeToFit numberOfLines={1}>{dial(Math.abs(elev), unit)}</Text>
                    <Ionicons name={elev >= 0 ? 'arrow-up' : 'arrow-down'} size={30} color={C.accent} />
                  </View>
                  <Text style={st.colUnit}>{`${unitLabel} ${elev >= 0 ? 'up' : 'down'}`}</Text>
                </View>
                <View style={st.colRule} />
                <View style={st.col}>
                  <Text style={st.colLabel}>Wind</Text>
                  <View style={st.bigRow}>
                    <Text style={st.big} adjustsFontSizeToFit numberOfLines={1}>{windText}</Text>
                    {Math.abs(wMid) >= 0.05 && <Ionicons name={wMid > 0 ? 'arrow-forward' : 'arrow-back'} size={30} color={C.accent} />}
                  </View>
                  <Text style={st.colUnit}>{`${unitLabel}${Math.abs(wMid) >= 0.05 ? (wMid > 0 ? ' right' : ' left') : ''}, ${lo === hi ? `${lo}` : `${lo}–${hi}`} mph`}</Text>
                </View>
              </View>
              {hit && (
                <TouchableOpacity onPress={cycleTarget} activeOpacity={0.6}>
                  <Text style={[st.hit, { color: hit.pct >= 70 ? C.green : hit.pct >= 40 ? C.orange : C.red }]}>
                    {`${hit.pct}% hit chance on ${hit.label}`}
                  </Text>
                </TouchableOpacity>
              )}
              {lead > 0 && <Text style={st.lead}>{`Lead ${dial(lead, unit)} ${unitLabel} for a ${moverMph} mph mover`}</Text>}
              <View style={st.strip}>
                <Stat value={row.tofS.toFixed(2)} label="sec" />
                <Stat value={row.velocityFps.toFixed(0)} label="fps" />
                <Stat value={withCommas(row.energyFtLb)} label="ft-lb" />
                <Stat value={row.mach.toFixed(2)} label="Mach" color={row.mach < 1.0 ? C.red : row.mach < 1.2 ? C.orange : undefined} />
              </View>
            </View>

            <View style={st.rangeRow}>
              <TouchableOpacity style={st.step} onPress={() => bump(-25)} activeOpacity={0.6}><Ionicons name="remove" size={32} color={C.text} /></TouchableOpacity>
              <View style={st.rangeBox}>
                <TextInput style={st.rangeInput} value={s.range} onChangeText={v => set({ range: v.replace(/[^0-9]/g, '') })}
                  keyboardType="number-pad" selectTextOnFocus maxLength={4} />
                <Text style={st.rangeUnit}>yd</Text>
              </View>
              <TouchableOpacity style={st.step} onPress={() => bump(25)} activeOpacity={0.6}><Ionicons name="add" size={32} color={C.text} /></TouchableOpacity>
            </View>
            <Chips items={QUICK.map(q => ({ key: String(q), label: String(q) }))} selected={String(R)} onSelect={k => set({ range: k })} />

            {bcWarn && (
              <TouchableOpacity style={st.warn} onPress={fixBc} activeOpacity={0.7}>
                <Text style={st.warnText}>{bcWarn} <Text style={{ fontFamily: F.semibold, color: C.accent }}>Switch to G1</Text></Text>
              </TouchableOpacity>
            )}

            <View style={{ marginTop: 8 }}>
              <Segment
                options={[{ value: 'wind', label: 'Wind' }, { value: 'air', label: 'Air' }, { value: 'reticle', label: 'Reticle' }, { value: 'card', label: 'Card' }]}
                value={tab} onChange={setTab}
              />
            </View>

            {tab === 'wind' && (
              <>
                <View style={st.panel}>
                  <WindDial clock={s.clock} onChange={h => set({ clock: h })} />
                  <View style={st.windSide}>
                    <Text style={commonStyles.label}>Speed, mph</Text>
                    <View style={st.windInputs}>
                      <TextInput style={st.windInput} value={s.windLo} onChangeText={v => set({ windLo: v })} keyboardType="decimal-pad" selectTextOnFocus />
                      <Text style={st.to}>to</Text>
                      <TextInput style={st.windInput} value={s.windHi} onChangeText={v => set({ windHi: v })} keyboardType="decimal-pad" selectTextOnFocus />
                    </View>
                    <Text style={st.windDir}>{clockText(s.clock)}</Text>
                    <Text style={Type.caption}>Tap where it comes from; 12 is the target. Give a range for gusts.</Text>
                  </View>
                </View>
                <Text style={[commonStyles.label, { marginTop: 14 }]}>Moving target</Text>
                <Chips items={['0', '2', '3', '4', '5'].map(k => ({ key: k, label: k === '0' ? 'None' : `${k} mph` }))} selected={s.mover} onSelect={k => set({ mover: k })} />
              </>
            )}

            {tab === 'air' && (
              <>
                <Section style={{ marginTop: 4 }} footer={`Density altitude ${withCommas(densityAltitude(air.atmo))} ft.${air.note ? ` ${air.note}` : ''}`}>
                  <InputItem label="Temperature" value={s.temp} onChange={v => set({ temp: v })} unit="°F" placeholder="59" keyboard="numbers-and-punctuation" />
                  <InputItem label="Station pressure" value={s.pressure} onChange={v => set({ pressure: v })} unit="inHg" placeholder="29.92" />
                  <InputItem label="Humidity" value={s.humidity} onChange={v => set({ humidity: v })} unit="%" placeholder="50" keyboard="number-pad" />
                  <InputItem label="Altitude" value={s.altitude} onChange={v => set({ altitude: v })} unit="ft" placeholder="optional" keyboard="number-pad" />
                </Section>
                {lastSession && (
                  <TouchableOpacity style={st.linkBtn} activeOpacity={0.6}
                    onPress={() => set({ temp: lastSession.temp || '', pressure: lastSession.pressure || '', humidity: lastSession.humidity || '', altitude: lastSession.altitude || '' })}>
                    <Text style={st.linkText}>{`Use conditions from ${shortDate(lastSession.date) || 'your last session'}`}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {tab === 'reticle' && (
              <>
                <Segment options={[{ value: 'dial', label: 'Dial elevation' }, { value: 'hold', label: 'Hold both' }]} value={hold} onChange={setHold} />
                <Reticle unit={unit} elev={fromMil(elev, unit)} wind={fromMil(wMid, unit)} mode={hold} size={300} />
                <Text style={st.reticleText}>
                  {hold === 'dial' ? `Dial ${dial(elev, unit)} ${unitLabel} up, then put the target on the red dot.` : 'Put the target on the red dot.'}
                </Text>
              </>
            )}

            {tab === 'card' && (
              <View style={st.table}>
                <View style={st.thead}>
                  {['Yd', `Up ${unitLabel}`, `Wind ${unitLabel}`, 'fps'].map((h, i) => <Text key={h} style={[st.th, i === 0 && st.first]}>{h}</Text>)}
                </View>
                {cardRows.map((r, i) => {
                  const r10 = lookup(tables!.w10, r.rangeYd);
                  const w = windAt(r, r10, (lo + hi) / 2);
                  const e = elevAt(r, r10, lookup(tables!.head10, r.rangeYd), (lo + hi) / 2);
                  const on = r.rangeYd === R;
                  return (
                    <TouchableOpacity key={r.rangeYd} activeOpacity={0.6} onPress={() => set({ range: String(r.rangeYd) })}
                      style={[st.tr, i > 0 && st.trLine, on && st.trOn]}>
                      <Text style={[st.td, st.first, { color: r.mach < 1.0 ? C.red : r.mach < 1.2 ? C.orange : C.text }]}>{r.rangeYd}</Text>
                      <Text style={st.td}>{dial(e, unit)}</Text>
                      <Text style={st.td}>{Math.abs(w) < 0.05 ? '0' : `${w > 0 ? 'R' : 'L'} ${dial(Math.abs(w), unit)}`}</Text>
                      <Text style={st.td}>{r.velocityFps.toFixed(0)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={st.stat}>
      <Text style={[st.statValue, color ? { color } : null]} numberOfLines={1}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  top:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  who:        { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  whoRifle:   { fontFamily: F.semibold, fontSize: 17, color: C.text },
  whoLoad:    { fontFamily: F.numMedium, fontSize: 14, color: C.textSoft, marginTop: 1 },
  fullBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6 },
  fullText:   { fontFamily: F.semibold, fontSize: 15, color: C.accent },
  picker:     { paddingHorizontal: 16 },
  content:    { paddingHorizontal: 16, paddingTop: 4 },
  dope:       { backgroundColor: C.card, borderRadius: 18, paddingTop: 18, paddingBottom: 12, paddingHorizontal: 14 },
  cols:       { flexDirection: 'row' },
  col:        { flex: 1, alignItems: 'center' },
  colRule:    { width: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: 6 },
  colLabel:   { fontFamily: F.medium, fontSize: 15, color: C.textSoft },
  bigRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  big:        { fontFamily: F.numBold, fontSize: 54, color: C.text, fontVariant: ['tabular-nums'], maxWidth: 150 },
  colUnit:    { fontFamily: F.medium, fontSize: 13, color: C.muted, marginTop: -2 },
  hit:        { fontFamily: F.semibold, fontSize: 17, textAlign: 'center', marginTop: 14 },
  lead:       { fontFamily: F.medium, fontSize: 15, color: C.textSoft, textAlign: 'center', marginTop: 4 },
  strip:      { flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  stat:       { flex: 1, alignItems: 'center' },
  statValue:  { fontFamily: F.num, fontSize: 19, color: C.text, fontVariant: ['tabular-nums'] },
  statLabel:  { fontFamily: F.regular, fontSize: 12, color: C.muted, marginTop: 1 },
  rangeRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, marginBottom: 12 },
  step:       { width: 64, height: 64, borderRadius: 32, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  rangeBox:   { flex: 1, height: 64, borderRadius: 14, backgroundColor: C.card, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', paddingTop: 8 },
  rangeInput: { fontFamily: F.numBold, fontSize: 40, color: C.text, minWidth: 90, textAlign: 'right', padding: 0, fontVariant: ['tabular-nums'] },
  rangeUnit:  { fontFamily: F.medium, fontSize: 17, color: C.muted, marginLeft: 6 },
  warn:       { backgroundColor: C.orange + '1a', borderRadius: 12, padding: 12, marginBottom: 10 },
  warnText:   { fontFamily: F.regular, fontSize: 14, color: C.text, lineHeight: 19 },
  panel:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, padding: 12 },
  windSide:   { flex: 1, marginLeft: 12 },
  windInputs: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  windInput:  { flex: 1, fontFamily: F.numBold, fontSize: 28, color: C.text, backgroundColor: C.surface, borderRadius: 10, paddingVertical: 6, textAlign: 'center', fontVariant: ['tabular-nums'] },
  to:         { fontFamily: F.regular, fontSize: 15, color: C.muted },
  windDir:    { fontFamily: F.semibold, fontSize: 16, color: C.text, marginTop: 10, marginBottom: 2 },
  linkBtn:    { paddingVertical: 12, alignItems: 'center' },
  linkText:   { fontFamily: F.semibold, fontSize: 15, color: C.accent },
  reticleText:{ fontFamily: F.semibold, fontSize: 17, color: C.text, textAlign: 'center', marginTop: 10 },
  table:      { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden' },
  thead:      { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  th:         { flex: 1, fontFamily: F.medium, fontSize: 13, color: C.textSoft, textAlign: 'right' },
  tr:         { flexDirection: 'row', paddingVertical: 11, paddingHorizontal: 14 },
  trLine:     { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  trOn:       { backgroundColor: C.accent + '1c' },
  td:         { flex: 1, fontFamily: F.numMedium, fontSize: 18, color: C.text, textAlign: 'right', fontVariant: ['tabular-nums'] },
  first:      { textAlign: 'left', flex: 0.8 },
});
