// Standard drag functions + interpolation.
//
// G1 and G7 are the standard reference projectiles (US Army BRL tables, as
// published by JBM and used by every mainstream solver). A bullet's BC says how
// much more or less drag it has than the reference at the same Mach number.
// Cd(Mach) is interpolated with a monotone cubic (PCHIP / Fritsch–Carlson) so
// the curve stays smooth through transonic without overshooting.

export type DragModelName = 'G1' | 'G7';

// Drag scale factor (DSF) node from long-range truing: multiply drag by
// `factor` at `mach`. Nodes are interpolated linearly in Mach.
export type DsfPoint = { mach: number; factor: number };

// Above this Mach the scale factor is always 1.0. Supersonic error is handled
// by MV truing; DSF only reshapes the transonic part of the curve.
export const DSF_ANCHOR_MACH = 1.2;

const G1_MACH = [0,0.05,0.1,0.15,0.2,0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.7,0.725,0.75,0.775,0.8,0.825,0.85,0.875,0.9,0.925,0.95,0.975,1,1.025,1.05,1.075,1.1,1.125,1.15,1.2,1.25,1.3,1.35,1.4,1.45,1.5,1.55,1.6,1.65,1.7,1.75,1.8,1.85,1.9,1.95,2,2.05,2.1,2.15,2.2,2.25,2.3,2.35,2.4,2.45,2.5,2.6,2.7,2.8,2.9,3,3.1,3.2,3.3,3.4,3.5,3.6,3.7,3.8,3.9,4,4.2,4.4,4.6,4.8,5];
const G1_CD = [0.2629,0.2558,0.2487,0.2413,0.2344,0.2278,0.2214,0.2155,0.2104,0.2061,0.2032,0.202,0.2034,0.2165,0.223,0.2313,0.2417,0.2546,0.2706,0.2901,0.3136,0.3415,0.3734,0.4084,0.4448,0.4805,0.5136,0.5427,0.5677,0.5883,0.6053,0.6191,0.6393,0.6518,0.6589,0.6621,0.6625,0.6607,0.6573,0.6528,0.6474,0.6413,0.6347,0.628,0.621,0.6141,0.6072,0.6003,0.5934,0.5867,0.5804,0.5743,0.5685,0.563,0.5577,0.5527,0.5481,0.5438,0.5397,0.5325,0.5264,0.5211,0.5168,0.5133,0.5105,0.5084,0.5067,0.5054,0.504,0.503,0.5022,0.5016,0.501,0.5006,0.4998,0.4995,0.4992,0.499,0.4988];

const G7_MACH = [0,0.05,0.1,0.15,0.2,0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.725,0.75,0.775,0.8,0.825,0.85,0.875,0.9,0.925,0.95,0.975,1,1.025,1.05,1.075,1.1,1.125,1.15,1.2,1.25,1.3,1.35,1.4,1.5,1.55,1.6,1.65,1.7,1.75,1.8,1.85,1.9,1.95,2,2.05,2.1,2.15,2.2,2.25,2.3,2.35,2.4,2.45,2.5,2.55,2.6,2.65,2.7,2.75,2.8,2.85,2.9,2.95,3,3.1,3.2,3.3,3.4,3.5,3.6,3.7,3.8,3.9,4,4.2,4.4,4.6,4.8,5];
const G7_CD = [0.1198,0.1197,0.1196,0.1194,0.1193,0.1194,0.1194,0.1194,0.1193,0.1193,0.1194,0.1193,0.1194,0.1197,0.1202,0.1207,0.1215,0.1226,0.1242,0.1266,0.1306,0.1368,0.1464,0.166,0.2054,0.2993,0.3803,0.4015,0.4043,0.4034,0.4014,0.3987,0.3955,0.3884,0.381,0.3732,0.3657,0.358,0.344,0.3376,0.3315,0.326,0.3209,0.316,0.3117,0.3078,0.3042,0.301,0.298,0.2951,0.2922,0.2892,0.2864,0.2835,0.2807,0.2779,0.2752,0.2725,0.2697,0.267,0.2643,0.2615,0.2588,0.2561,0.2533,0.2506,0.2479,0.2451,0.2424,0.2368,0.2313,0.2258,0.2205,0.2154,0.2106,0.206,0.2017,0.1975,0.1935,0.1861,0.1793,0.173,0.1672,0.1618];

// ── PCHIP (Fritsch–Carlson) ───────────────────────────────────────────────────
export type Curve = { x: number[]; y: number[]; m: number[] };

export function prepareCurve(x: number[], y: number[]): Curve {
  const n = x.length;
  const h: number[] = [], d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(x[i + 1] - x[i]);
    d.push((y[i + 1] - y[i]) / h[i]);
  }
  const m = new Array<number>(n).fill(0);
  if (n === 2) { m[0] = m[1] = d[0]; return { x, y, m }; }
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  // shape-preserving end slopes
  const end = (h0: number, h1: number, d0: number, d1: number) => {
    let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(s) !== Math.sign(d0)) s = 0;
    else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > Math.abs(3 * d0)) s = 3 * d0;
    return s;
  };
  m[0] = end(h[0], h[1], d[0], d[1]);
  m[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
  return { x, y, m };
}

export function evalCurve(c: Curve, xq: number): number {
  const { x, y, m } = c;
  const n = x.length;
  if (xq <= x[0]) return y[0];
  if (xq >= x[n - 1]) return y[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (x[mid] <= xq) lo = mid; else hi = mid;
  }
  const h = x[hi] - x[lo];
  const t = (xq - x[lo]) / h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y[lo] + (t3 - 2 * t2 + t) * h * m[lo]
       + (-2 * t3 + 3 * t2) * y[hi] + (t3 - t2) * h * m[hi];
}

const CURVES: Record<DragModelName, Curve> = {
  G1: prepareCurve(G1_MACH, G1_CD),
  G7: prepareCurve(G7_MACH, G7_CD),
};

export const standardCd = (model: DragModelName, mach: number) => evalCurve(CURVES[model], mach);

// Piecewise-linear DSF: 1.0 at/above the anchor, nodes in between, last node's
// factor held below the slowest node.
export function dsfAt(nodes: DsfPoint[] | undefined, mach: number): number {
  if (!nodes || nodes.length === 0 || mach >= DSF_ANCHOR_MACH) return 1;
  const pts = [...nodes].filter(p => p.mach < DSF_ANCHOR_MACH).sort((a, b) => b.mach - a.mach);
  if (pts.length === 0) return 1;
  let hiM = DSF_ANCHOR_MACH, hiF = 1;
  for (const p of pts) {
    if (mach >= p.mach) {
      const t = (mach - p.mach) / (hiM - p.mach);
      return p.factor + t * (hiF - p.factor);
    }
    hiM = p.mach; hiF = p.factor;
  }
  return pts[pts.length - 1].factor;
}

// Cd used by the integrator: standard curve × DSF.
export function makeCdFn(model: DragModelName, dsf?: DsfPoint[]): (mach: number) => number {
  const curve = CURVES[model];
  if (!dsf || dsf.length === 0) return mach => evalCurve(curve, mach);
  return mach => evalCurve(curve, mach) * dsfAt(dsf, mach);
}
