// Visual instruments: scope reticle with the aim point, a tap-to-set wind
// clock, and a tap-to-plot target for group analysis. Plain Views only, so
// they ship over the air.
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';
import { Shot, groupStats } from '../lib/groups';

function Line({ x1, y1, x2, y2, color, th = 1.5 }: { x1: number; y1: number; x2: number; y2: number; color: string; th?: number }) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 0.5) return null;
  return (
    <View style={{
      position: 'absolute', left: (x1 + x2) / 2 - len / 2, top: (y1 + y2) / 2 - th / 2, width: len, height: th,
      backgroundColor: color, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
    }} />
  );
}

// ── reticle ─────────────────────────────────────────────────────────────────
// elev / wind are the corrections to dial (+ up, + right). The red dot is where
// the target goes: hold both, or dial elevation and hold wind on the stadia.
export function Reticle({ unit, elev, wind, mode, size = 280 }: {
  unit: 'mil' | 'moa'; elev: number; wind: number; mode: 'hold' | 'dial'; size?: number;
}) {
  const holdX = -wind;
  const holdY = mode === 'hold' ? -elev : 0;
  const step = unit === 'mil' ? 1 : 2;
  const labelEvery = unit === 'mil' ? 2 : 4;
  const base = unit === 'mil' ? 5 : 16;
  const reach = Math.max(Math.abs(holdX), Math.abs(holdY));
  const span = Math.max(base, Math.ceil(reach / step) * step + step);
  const c = size / 2;
  const px = (c * 0.86) / span;
  const marks: React.ReactElement[] = [];
  for (let v = step; v <= span + 1e-9; v += step) {
    const major = Math.round(v / step) % Math.round(labelEvery / step) === 0;
    const len = major ? 12 : 7;
    for (const s of [1, -1]) {
      marks.push(<View key={`x${s}${v}`} style={[st.tick, { left: c + s * v * px - 0.75, top: c - len / 2, width: 1.5, height: len }]} />);
      marks.push(<View key={`y${s}${v}`} style={[st.tick, { top: c + s * v * px - 0.75, left: c - len / 2, height: 1.5, width: len }]} />);
      if (major) marks.push(<Text key={`lx${s}${v}`} style={[st.rLabel, { left: c + s * v * px - 14, top: c + 8 }]}>{v}</Text>);
    }
    if (major) marks.push(<Text key={`ly${v}`} style={[st.rLabel, { left: c + 8, top: c + v * px - 7, textAlign: 'left' }]}>{v}</Text>);
  }
  const mx = c + holdX * px, my = c - holdY * px;
  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      <View style={[st.lens, { width: size, height: size, borderRadius: c }]} />
      <View style={[st.tick, { top: c - 0.75, left: size * 0.04, width: size * 0.92, height: 1.5 }]} />
      <View style={[st.tick, { left: c - 0.75, top: size * 0.04, height: size * 0.92, width: 1.5 }]} />
      {marks}
      <View style={[st.holdRing, { left: mx - 13, top: my - 13 }]} />
      <View style={[st.holdDot, { left: mx - 5, top: my - 5 }]} />
    </View>
  );
}

// ── wind clock ──────────────────────────────────────────────────────────────
export function WindDial({ clock, onChange, size = 156 }: { clock: number; onChange: (h: number) => void; size?: number }) {
  const c = size / 2, r = c - 18;
  const sel = ((Math.round(clock) % 12) + 12) % 12;
  return (
    <View style={{ width: size, height: size }}>
      <View style={[st.dialRing, { left: 14, top: 14, width: size - 28, height: size - 28, borderRadius: (size - 28) / 2 }]} />
      {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => {
        const a = ((h % 12) * 30 * Math.PI) / 180;
        const on = sel === h % 12;
        return (
          <TouchableOpacity key={h} onPress={() => onChange(h)} hitSlop={4}
            style={[st.hour, on && st.hourOn, { left: c + r * Math.sin(a) - 15, top: c - r * Math.cos(a) - 15 }]}>
            <Text style={[st.hourText, on && st.hourTextOn]}>{h}</Text>
          </TouchableOpacity>
        );
      })}
      <View style={[st.dialCenter, { left: c - 24, top: c - 24 }]}>
        <Ionicons name="arrow-up" size={26} color={C.accent} style={{ transform: [{ rotate: `${sel * 30 + 180}deg` }] }} />
      </View>
    </View>
  );
}

// ── target plot ─────────────────────────────────────────────────────────────
// Tap to add a shot. Coordinates are inches from the aim point (+ right, + up).
export function TargetPlot({ shots, halfIn, onAdd }: { shots: Shot[]; halfIn: number; onAdd?: (s: Shot) => void }) {
  const [w, setW] = useState(0);
  const stats = groupStats(shots);
  const scale = w > 0 ? w / (2 * halfIn) : 1;
  const X = (x: number) => w / 2 + x * scale;
  const Y = (y: number) => w / 2 - y * scale;
  const grid = halfIn <= 1 ? 0.25 : halfIn <= 2 ? 0.5 : halfIn <= 4 ? 1 : 2;
  const lines: number[] = [];
  for (let v = grid; v < halfIn - 1e-9; v += grid) lines.push(v);
  const onPress = (e: GestureResponderEvent) => {
    if (!onAdd || !w) return;
    const { locationX, locationY } = e.nativeEvent;
    onAdd({ x: Math.round(((locationX - w / 2) / scale) * 1000) / 1000, y: Math.round(((w / 2 - locationY) / scale) * 1000) / 1000 });
  };
  return (
    <Pressable onPress={onPress} onLayout={e => setW(e.nativeEvent.layout.width)} style={st.paper}>
      {w > 0 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {lines.map(v => (
            <View key={`g${v}`}>
              {[1, -1].map(s => (
                <View key={s}>
                  <View style={[st.grid, { left: X(s * v), top: 0, width: StyleSheet.hairlineWidth, height: w }]} />
                  <View style={[st.grid, { top: Y(s * v), left: 0, height: StyleSheet.hairlineWidth, width: w }]} />
                </View>
              ))}
            </View>
          ))}
          <View style={[st.aim, { left: w / 2 - 0.75, top: w / 2 - 12, width: 1.5, height: 24 }]} />
          <View style={[st.aim, { top: w / 2 - 0.75, left: w / 2 - 12, height: 1.5, width: 24 }]} />
          {stats && stats.n >= 2 && (
            <View style={[st.mrRing, {
              left: X(stats.cx) - stats.mr * scale, top: Y(stats.cy) - stats.mr * scale,
              width: 2 * stats.mr * scale, height: 2 * stats.mr * scale, borderRadius: stats.mr * scale,
            }]} />
          )}
          {stats?.esPair && (
            <Line x1={X(shots[stats.esPair[0]].x)} y1={Y(shots[stats.esPair[0]].y)} x2={X(shots[stats.esPair[1]].x)} y2={Y(shots[stats.esPair[1]].y)} color={C.red + 'aa'} th={1.5} />
          )}
          {shots.map((s, i) => (
            <View key={i} style={[st.hole, { left: X(s.x) - 8, top: Y(s.y) - 8 }]}>
              <Text style={st.holeText}>{i + 1}</Text>
            </View>
          ))}
          {stats && stats.n >= 2 && (
            <>
              <View style={[st.center, { left: X(stats.cx) - 7, top: Y(stats.cy) - 0.75, width: 14, height: 1.5 }]} />
              <View style={[st.center, { left: X(stats.cx) - 0.75, top: Y(stats.cy) - 7, width: 1.5, height: 14 }]} />
            </>
          )}
          <Text style={st.scaleText}>{`${grid}" grid`}</Text>
        </View>
      )}
    </Pressable>
  );
}

const st = StyleSheet.create({
  lens:       { position: 'absolute', backgroundColor: '#e9edf2', borderWidth: 6, borderColor: '#05070b' },
  tick:       { position: 'absolute', backgroundColor: '#161b24' },
  rLabel:     { position: 'absolute', width: 28, textAlign: 'center', fontSize: 10, color: '#3b4556', fontVariant: ['tabular-nums'] },
  holdRing:   { position: 'absolute', width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#e5484d' },
  holdDot:    { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#e5484d' },
  dialRing:   { position: 'absolute', borderWidth: 1, borderColor: C.border },
  hour:       { position: 'absolute', width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  hourOn:     { backgroundColor: C.accent },
  hourText:   { color: C.textSoft, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  hourTextOn: { color: C.white },
  dialCenter: { position: 'absolute', width: 48, height: 48, borderRadius: 24, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  paper:      { width: '100%', aspectRatio: 1, backgroundColor: '#f2efe8', borderRadius: 14, overflow: 'hidden' },
  grid:       { position: 'absolute', backgroundColor: '#c9c3b5' },
  aim:        { position: 'absolute', backgroundColor: C.orange },
  mrRing:     { position: 'absolute', borderWidth: 1.5, borderColor: C.accent, borderStyle: 'dashed' },
  hole:       { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: '#1b1f27', alignItems: 'center', justifyContent: 'center' },
  holeText:   { color: '#fff', fontSize: 9, fontWeight: '700' },
  center:     { position: 'absolute', backgroundColor: C.accent },
  scaleText:  { position: 'absolute', right: 8, bottom: 6, fontSize: 11, color: '#7b7466' },
});
