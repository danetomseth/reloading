// Hit probability (in the spirit of Applied Ballistics' WEZ): how likely a
// first-round hit is once real uncertainties are included — wind call,
// velocity spread, BC error, ranging error and rifle precision. Uses linear
// error propagation from a handful of trajectory solves, so it's fast enough
// to recompute live on a phone. ± inputs are 95% ranges (2 standard deviations).

import { SolveInput, TrajectoryRow, solve } from './solver';

export type WezInputs = {
  mvSd: number;          // fps, 1 SD (from the chronograph)
  bcPct95: number;       // ± %, 95%
  windMph95: number;     // ± mph, 95%, full-value wind call
  rangeYd95: number;     // ± yd, 95%
  precisionMoa: number;  // rifle + ammo dispersion, 1 SD per axis, MOA
};
export type WezTarget = { kind: 'inches'; width: number; height: number } | { kind: 'moa'; size: number };
export type WezPart = { key: 'wind' | 'mv' | 'precision' | 'bc' | 'range'; label: string; vIn: number; hIn: number };
export type WezRow = { rangeYd: number; sigmaV: number; sigmaH: number; hit: number; mach: number; widthIn: number; heightIn: number; parts: WezPart[] };

// Abramowitz & Stegun 7.1.26, |error| < 1.5e-7
export function erf(x: number): number {
  const s = Math.sign(x), a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
// probability a normal miss with SD sigma lands within ±half
export const withinHalf = (half: number, sigma: number) => (sigma <= 0 ? 1 : erf(half / (sigma * Math.SQRT2)));

const at = (rows: TrajectoryRow[], r: number) => rows.find(x => x.rangeYd === r);

export function wezTable(input: SolveInput, w: WezInputs, rangesYd: number[], target: WezTarget): WezRow[] {
  const rs = [...new Set(rangesYd.filter(r => r > 1))].sort((a, b) => a - b);
  if (rs.length === 0) return [];
  const calm = { ...input, conditions: { ...input.conditions, windMph: 0 } };
  const base = solve(calm, [...new Set(rs.flatMap(r => [r - 1, r, r + 1]))]).rows;
  const windy = solve({ ...input, conditions: { ...input.conditions, windMph: 10, windFromDeg: 90 } }, rs).rows;
  const mvHi = solve({ ...calm, mv: input.mv + 5 }, rs).rows;
  const mvLo = solve({ ...calm, mv: input.mv - 5 }, rs).rows;
  const bc = input.projectile.bc;
  const bcHi = solve({ ...calm, projectile: { ...input.projectile, bc: bc * 1.01 } }, rs).rows;
  const bcLo = solve({ ...calm, projectile: { ...input.projectile, bc: bc * 0.99 } }, rs).rows;

  const out: WezRow[] = [];
  for (const r of rs) {
    const b = at(base, r), bp = at(base, r + 1), bm = at(base, r - 1), wi = at(windy, r);
    const mh = at(mvHi, r), ml = at(mvLo, r), bh = at(bcHi, r), bl = at(bcLo, r);
    if (!b || !bp || !bm || !wi || !mh || !ml || !bh || !bl) continue;
    const inPerMil = r * 0.036;
    const mvV = w.mvSd * Math.abs(ml.dropIn - mh.dropIn) / 10;
    const bcV = (w.bcPct95 / 2) * Math.abs(bl.dropIn - bh.dropIn) / 2;
    const rangeV = (w.rangeYd95 / 2) * (Math.abs(bp.elevMil - bm.elevMil) / 2) * inPerMil;
    const precIn = w.precisionMoa * 1.047 * (r / 100);
    const windH = (w.windMph95 / 2) * Math.abs(wi.windIn - b.windIn) / 10;
    const sigmaV = Math.hypot(mvV, bcV, rangeV, precIn);
    const sigmaH = Math.hypot(windH, precIn);
    const widthIn = target.kind === 'moa' ? target.size * 1.047 * (r / 100) : target.width;
    const heightIn = target.kind === 'moa' ? target.size * 1.047 * (r / 100) : target.height;
    out.push({
      rangeYd: r, sigmaV, sigmaH, mach: b.mach, widthIn, heightIn,
      hit: withinHalf(widthIn / 2, sigmaH) * withinHalf(heightIn / 2, sigmaV),
      parts: [
        { key: 'wind', label: `Wind call ±${w.windMph95} mph`, vIn: 0, hIn: windH },
        { key: 'mv', label: `Velocity SD ${w.mvSd.toFixed(0)} fps`, vIn: mvV, hIn: 0 },
        { key: 'precision', label: `Rifle precision ${w.precisionMoa.toFixed(2)} MOA`, vIn: precIn, hIn: precIn },
        { key: 'bc', label: `BC ±${w.bcPct95}%`, vIn: bcV, hIn: 0 },
        { key: 'range', label: `Ranging ±${w.rangeYd95} yd`, vIn: rangeV, hIn: 0 },
      ],
    });
  }
  return out;
}

// Mover lead: how far ahead of a target crossing at `mph` to hold, in mils.
export const moverLeadMil = (row: TrajectoryRow, mph: number) =>
  row.rangeYd > 0 ? ((mph * 17.6) * row.tofS) / (row.rangeYd * 0.036) : 0; // 17.6 in/s per mph
