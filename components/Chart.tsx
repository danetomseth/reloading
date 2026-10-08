// Lightweight charts drawn with plain Views (no native modules), so they ship
// with an over-the-air update. Line segments are rotated thin Views.
import { Fragment, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C } from '../lib/theme';

export type ChartPoint = { x: number; y: number; err?: number };
export type ChartSeries = { points: ChartPoint[]; color?: string; line?: boolean; dots?: boolean; thickness?: number };

const PAD = { l: 46, r: 14, t: 12, b: 26 };

function niceStep(span: number, count: number) {
  const raw = span / Math.max(1, count);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!(hi > lo)) { const d = Math.abs(lo) * 0.05 || 1; lo -= d; hi += d; }
  const step = niceStep(hi - lo, count);
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; ticks.length < 12; v += step) {
    ticks.push(Number(v.toFixed(10)));
    if (v >= hi) break;
  }
  return ticks;
}

function Seg({ x1, y1, x2, y2, color, th }: { x1: number; y1: number; x2: number; y2: number; color: string; th: number }) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return null;
  return (
    <View style={{
      position: 'absolute', left: (x1 + x2) / 2 - len / 2, top: (y1 + y2) / 2 - th / 2,
      width: len, height: th, borderRadius: th / 2, backgroundColor: color,
      transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
    }} />
  );
}

export function LineChart({ series, height = 180, xFormat = v => String(Math.round(v)), yFormat = v => String(Math.round(v)), xTicks, band }: {
  series: ChartSeries[];
  height?: number;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  xTicks?: { value: number; label: string }[];
  band?: { from: number; to: number; color: string };
}) {
  const [w, setW] = useState(0);
  const pts = series.flatMap(s => s.points).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length === 0) return null;
  let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
  if (x1 === x0) { x0 -= 1; x1 += 1; }
  const ys = pts.flatMap(p => [p.y - (p.err ?? 0), p.y + (p.err ?? 0)]);
  const yt = niceTicks(Math.min(...ys), Math.max(...ys), 4);
  const y0 = yt[0], y1 = yt[yt.length - 1];
  const pw = Math.max(1, w - PAD.l - PAD.r), ph = height - PAD.t - PAD.b;
  const X = (v: number) => PAD.l + ((v - x0) / (x1 - x0)) * pw;
  const Y = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0)) * ph;
  const xt = xTicks ?? [x0, (x0 + x1) / 2, x1].map(v => ({ value: v, label: xFormat(v) }));

  return (
    <View style={{ height }} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <>
          {band && band.to > band.from && (
            <View style={{
              position: 'absolute', top: PAD.t, height: ph, backgroundColor: band.color,
              left: X(Math.max(band.from, x0)), width: Math.max(0, X(Math.min(band.to, x1)) - X(Math.max(band.from, x0))),
            }} />
          )}
          {yt.map(v => (
            <Fragment key={`y${v}`}>
              <View style={[st.grid, { top: Y(v), left: PAD.l, right: PAD.r }]} />
              <Text style={[st.yTick, { top: Y(v) - 7, width: PAD.l - 8 }]}>{yFormat(v)}</Text>
            </Fragment>
          ))}
          {xt.map((t, i) => (
            <Text key={`x${i}`} style={[st.xTick, { top: PAD.t + ph + 7, left: X(t.value) - 32 }]} numberOfLines={1}>{t.label}</Text>
          ))}
          {series.map((s, si) => {
            const color = s.color ?? C.accent;
            const th = s.thickness ?? 2;
            const sorted = [...s.points].filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
            return (
              <Fragment key={`s${si}`}>
                {s.line !== false && sorted.slice(1).map((p, i) => (
                  <Seg key={`l${i}`} x1={X(sorted[i].x)} y1={Y(sorted[i].y)} x2={X(p.x)} y2={Y(p.y)} color={color} th={th} />
                ))}
                {sorted.map((p, i) => p.err ? (
                  <View key={`e${i}`} style={{ position: 'absolute', left: X(p.x) - 1, width: 2, top: Y(p.y + p.err), height: Math.max(1, Y(p.y - p.err) - Y(p.y + p.err)), backgroundColor: color + '77', borderRadius: 1 }} />
                ) : null)}
                {s.dots !== false && sorted.map((p, i) => (
                  <View key={`d${i}`} style={{ position: 'absolute', left: X(p.x) - 4, top: Y(p.y) - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: color, borderWidth: 2, borderColor: C.card }} />
                ))}
              </Fragment>
            );
          })}
        </>
      )}
    </View>
  );
}

export type BarItem = { key: string; label: string; value: number; color?: string; onPress?: () => void };

export function BarList({ items, format }: { items: BarItem[]; format: (v: number) => string }) {
  const max = Math.max(0, ...items.map(i => i.value)) || 1;
  return (
    <View>
      {items.map(it => {
        const pct = Math.max(3, (it.value / max) * 100);
        const row = (
          <View style={st.barRow}>
            <Text style={st.barLabel} numberOfLines={1}>{it.label}</Text>
            <View style={st.barTrack}>
              <View style={[st.barFill, { width: `${pct.toFixed(1)}%` as `${number}%`, backgroundColor: it.color ?? C.accent }]} />
            </View>
            <Text style={st.barValue}>{format(it.value)}</Text>
          </View>
        );
        return it.onPress
          ? <TouchableOpacity key={it.key} activeOpacity={0.6} onPress={it.onPress}>{row}</TouchableOpacity>
          : <View key={it.key}>{row}</View>;
      })}
    </View>
  );
}

export function ColumnChart({ items, height = 110, color = C.accent, format }: {
  items: { key: string; label: string; value: number }[]; height?: number; color?: string; format?: (v: number) => string;
}) {
  const max = Math.max(1, ...items.map(i => i.value));
  return (
    <View style={st.cols}>
      {items.map(it => (
        <View key={it.key} style={st.col}>
          <Text style={st.colValue} numberOfLines={1}>{it.value ? (format ? format(it.value) : String(it.value)) : ''}</Text>
          <View style={{ width: '64%', height: Math.max(3, (it.value / max) * height), borderRadius: 4, backgroundColor: it.value ? color : C.surface }} />
          <Text style={st.colLabel} numberOfLines={1}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  cols:     { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  col:      { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  colValue: { fontSize: 11, color: C.textSoft, marginBottom: 4, fontVariant: ['tabular-nums'] },
  colLabel: { fontSize: 11, color: C.muted, marginTop: 6 },
  grid:     { position: 'absolute', height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  yTick:    { position: 'absolute', left: 0, textAlign: 'right', fontSize: 10, color: C.muted, fontVariant: ['tabular-nums'] },
  xTick:    { position: 'absolute', width: 64, textAlign: 'center', fontSize: 10, color: C.muted, fontVariant: ['tabular-nums'] },
  barRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  barLabel: { width: 92, color: C.text, fontSize: 13, fontWeight: '600' },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: C.surface, overflow: 'hidden', marginHorizontal: 10 },
  barFill:  { height: 10, borderRadius: 5 },
  barValue: { width: 74, textAlign: 'right', color: C.textSoft, fontSize: 13, fontVariant: ['tabular-nums'] },
});
