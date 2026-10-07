// Truing: turning range data into a better ballistic profile.
//
//   1. Muzzle velocity  — how good is the average and SD, how many shots you
//                         need, and what the uncertainty costs at distance.
//   2. BC (2 chronos)   — muzzle + downrange velocity → BC from velocity loss.
//   3. Long-range drop  — observed vs calculated elevation:
//                           supersonic (≥ Mach 1.2) → MV correction
//                           transonic  (< Mach 1.2) → drag scale factor (DSF)

import { DSF_ANCHOR_MACH, DsfPoint } from './drag';
import { SolveInput, solve, solveAt, zeroAngle } from './solver';

export const MOA_PER_MIL = 3.437747;
export type AngleUnit = 'mil' | 'moa';
export const toMil = (v: number, u: AngleUnit) => (u === 'mil' ? v : v / MOA_PER_MIL);
export const fromMil = (mil: number, u: AngleUnit) => (u === 'mil' ? mil : mil * MOA_PER_MIL);
export const clickMil = (u: AngleUnit) => (u === 'mil' ? 0.1 : 0.25 / MOA_PER_MIL);
export const inchesPerMil = (rangeYd: number) => rangeYd * 0.036;

// ── statistics ───────────────────────────────────────────────────────────────

export type VelocityStats = { n: number; mean: number; sd: number; es?: number };

export function statsFromShots(shots: number[]): VelocityStats | null {
  const v = shots.filter(x => Number.isFinite(x) && x > 0);
  if (v.length < 2) return null;
  const n = v.length;
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)); // sample SD
  return { n, mean, sd, es: Math.max(...v) - Math.min(...v) };
}

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

function lnGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = LANCZOS[0];
  for (let i = 1; i < 9; i++) x += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// regularized lower incomplete gamma P(a, x)
function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  const front = Math.exp(-x + a * Math.log(x) - lnGamma(a));
  if (x < a + 1) {
    let ap = a, sum = 1 / a, term = sum;
    for (let i = 0; i < 1000; i++) {
      ap += 1; term *= x / ap; sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return sum * front;
  }
  const tiny = 1e-300;
  let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - front * h;
}

export function chi2Quantile(p: number, df: number): number {
  let lo = 0, hi = Math.max(1, df);
  while (gammaP(df / 2, hi / 2) < p) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (gammaP(df / 2, mid / 2) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// inverse standard normal (Acklam)
export function normQuantile(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) return -normQuantile(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Student-t quantile (exact for df 1–2, Cornish–Fisher expansion beyond)
export function tQuantile(p: number, df: number): number {
  if (df <= 1) return Math.tan(Math.PI * (p - 0.5));
  if (df === 2) return (2 * p - 1) / Math.sqrt(2 * p * (1 - p));
  const z = normQuantile(p);
  const z3 = z ** 3, z5 = z ** 5, z7 = z ** 7, z9 = z ** 9;
  const g1 = (z3 + z) / 4;
  const g2 = (5 * z5 + 16 * z3 + 3 * z) / 96;
  const g3 = (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / 384;
  const g4 = (79 * z9 + 776 * z7 + 1482 * z5 - 1920 * z3 - 945 * z) / 92160;
  return z + g1 / df + g2 / df ** 2 + g3 / df ** 3 + g4 / df ** 4;
}

export type MvConfidence = {
  se: number;              // standard error of the average, fps
  meanPlusMinus90: number; // the true average is within ± this, 90% confidence
  sdLow90: number;         // true SD is between these, 90% confidence
  sdHigh90: number;
};

export function mvConfidence(s: VelocityStats): MvConfidence | null {
  if (s.n < 2 || !(s.sd >= 0)) return null;
  const df = s.n - 1;
  const se = s.sd / Math.sqrt(s.n);
  return {
    se,
    meanPlusMinus90: tQuantile(0.95, df) * se,
    sdLow90: s.sd * Math.sqrt(df / chi2Quantile(0.95, df)),
    sdHigh90: s.sd * Math.sqrt(df / chi2Quantile(0.05, df)),
  };
}

// ── step 1: what the MV data costs you at distance ───────────────────────────

export type MvErrorRow = {
  rangeYd: number;
  mach: number;
  milPerFps: number;       // elevation change per 1 fps of MV
  inPerFps: number;
  vertical1SdIn: number;   // shot-to-shot vertical from velocity SD (1 SD; ~95% of shots within ±2×)
  vertical1SdMil: number;
  dopeErr90Mil: number;    // error in your dope from not knowing the true average (90%)
  dopeErr90In: number;
};

export function mvErrorTable(input: SolveInput, s: VelocityStats, rangesYd: number[]): MvErrorRow[] {
  const conf = mvConfidence(s);
  const mid = solve({ ...input, mv: s.mean }, rangesYd).rows;
  const hi = solve({ ...input, mv: s.mean + 5 }, rangesYd).rows;
  const lo = solve({ ...input, mv: s.mean - 5 }, rangesYd).rows;
  const out: MvErrorRow[] = [];
  for (const m of mid) {
    const h = hi.find(r => r.rangeYd === m.rangeYd), l = lo.find(r => r.rangeYd === m.rangeYd);
    if (!h || !l || m.rangeYd <= 0) continue;
    const milPerFps = (l.elevMil - h.elevMil) / 10;
    const inPerFps = milPerFps * inchesPerMil(m.rangeYd);
    const pm = conf ? conf.meanPlusMinus90 : 0;
    out.push({
      rangeYd: m.rangeYd, mach: m.mach, milPerFps, inPerFps,
      vertical1SdIn: s.sd * inPerFps, vertical1SdMil: s.sd * milPerFps,
      dopeErr90Mil: pm * milPerFps, dopeErr90In: pm * inPerFps,
    });
  }
  return out;
}

export const MIN_SHOTS_FOR_SD = 10;

// Shots needed so the average's 90% uncertainty costs less than `toleranceMil`
// at the planning distance (the screen uses half a click: under that, you'd
// still dial the right click). Never fewer than 10 — below that the SD itself
// is noise.
export function shotsNeeded(sd: number, milPerFps: number, toleranceMil: number): number {
  if (!(sd > 0) || !(milPerFps > 0) || !(toleranceMil > 0)) return MIN_SHOTS_FOR_SD;
  for (let n = 3; n <= 500; n++) {
    if (tQuantile(0.95, n - 1) * (sd / Math.sqrt(n)) * milPerFps <= toleranceMil) return Math.max(n, MIN_SHOTS_FOR_SD);
  }
  return 500;
}

export type TempPoint = { tempF: number; velocity: number; n?: number };
export type TempSensitivity = { fpsPerF: number; refTempF: number; refVelocity: number; spanF: number; points: number; r2: number };

// Weighted least squares through chrono sessions at different temperatures.
export function tempSensitivity(points: TempPoint[]): TempSensitivity | null {
  const p = points.filter(q => Number.isFinite(q.tempF) && Number.isFinite(q.velocity) && q.velocity > 0);
  if (p.length < 2) return null;
  const temps = p.map(q => q.tempF);
  const span = Math.max(...temps) - Math.min(...temps);
  if (span < 10) return null;
  const w = p.map(q => (q.n && q.n > 0 ? q.n : 1));
  const W = w.reduce((a, b) => a + b, 0);
  const xm = p.reduce((a, q, i) => a + w[i] * q.tempF, 0) / W;
  const ym = p.reduce((a, q, i) => a + w[i] * q.velocity, 0) / W;
  let sxx = 0, sxy = 0, syy = 0;
  p.forEach((q, i) => {
    sxx += w[i] * (q.tempF - xm) ** 2;
    sxy += w[i] * (q.tempF - xm) * (q.velocity - ym);
    syy += w[i] * (q.velocity - ym) ** 2;
  });
  const slope = sxy / sxx;
  return { fpsPerF: slope, refTempF: xm, refVelocity: ym, spanF: span, points: p.length, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1 };
}

// ── step 2: BC from a muzzle and a downrange chronograph ─────────────────────

// Velocity doesn't depend on the tiny bore angle, so skip the zero search.
const FAST = { zeroAngleRad: 0, dt: 0.003 };
export const velocityAt = (input: SolveInput, rangeYd: number) =>
  solveAt({ ...input, options: { ...input.options, ...FAST } }, rangeYd)?.velocityFps ?? null;
const velocitiesAt = (input: SolveInput, rangesYd: number[]) =>
  solve({ ...input, options: { ...input.options, ...FAST } }, rangesYd).rows;

// Illinois (modified regula falsi): bracketed like bisection, converges like secant.
export function findRoot(f: (x: number) => number, a: number, b: number, xtol: number, maxIter = 40): number | null {
  let fa = f(a), fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa * fb > 0) return null;
  if (fa === 0) return a;
  if (fb === 0) return b;
  let side = 0, c = a;
  for (let i = 0; i < maxIter; i++) {
    c = (a * fb - b * fa) / (fb - fa);
    const fc = f(c);
    if (!Number.isFinite(fc)) return null;
    if (fc === 0 || Math.abs(b - a) < xtol) return c;
    if (fc * fb > 0) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; }
    else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
    if (Math.abs(b - a) < xtol) return c;
  }
  return c;
}

export function solveBcFromVelocities(input: SolveInput, v0: number, v1: number, distYd: number): number | null {
  if (!(v0 > 0) || !(v1 > 0) || !(v1 < v0) || !(distYd > 0)) return null;
  const f = (bc: number) => {
    const v = velocityAt({ ...input, mv: v0, projectile: { ...input.projectile, bc } }, distYd);
    return v == null ? NaN : v - v1;
  };
  return findRoot(f, 0.02, 2.0, 1e-5);
}

export type BcUncertainty = { bc: number; sigma: number; pct: number; fromChrono: number; fromDistance: number; fromScatter: number };

// Sensitivities of the downrange velocity V(bc, v0, D), from 5 cheap
// integrations; error propagation then uses the implicit-function rule
// dBC/dx = −(∂V/∂x)/(∂V/∂BC).
function velocitySensitivities(input: SolveInput, bc: number, v0: number, distsYd: number[]) {
  const withBc = (b: number, mv: number) => ({ ...input, mv, projectile: { ...input.projectile, bc: b } });
  const ranges = distsYd.flatMap(d => [d - 1, d, d + 1]);
  const base = velocitiesAt(withBc(bc, v0), ranges);
  const bHi = velocitiesAt(withBc(bc * 1.01, v0), distsYd);
  const bLo = velocitiesAt(withBc(bc * 0.99, v0), distsYd);
  const vHi = velocitiesAt(withBc(bc, v0 + 5), distsYd);
  const vLo = velocitiesAt(withBc(bc, v0 - 5), distsYd);
  const at = (rows: { rangeYd: number; velocityFps: number; mach: number }[], d: number) => rows.find(r => r.rangeYd === d);
  return distsYd.map(d => {
    const v = at(base, d), vp = at(base, d + 1), vm = at(base, d - 1);
    const bh = at(bHi, d), bl = at(bLo, d), mh = at(vHi, d), ml = at(vLo, d);
    if (!v || !vp || !vm || !bh || !bl || !mh || !ml) return null;
    return {
      distYd: d, v1: v.velocityFps, mach: v.mach,
      dVdBc: (bh.velocityFps - bl.velocityFps) / (0.02 * bc),
      dVdV0: (mh.velocityFps - ml.velocityFps) / 10,
      dVdD: (vp.velocityFps - vm.velocityFps) / 2,
    };
  });
}

function propagateBc(
  bc: number, v0: number, v1: number,
  s: { dVdBc: number; dVdV0: number; dVdD: number },
  opts: { shots: number; accuracyPct?: number; distErrYd?: number; bcScatterSd?: number },
): BcUncertainty {
  const acc = (opts.accuracyPct ?? 0.1) / 100;
  const dBcdV1 = 1 / s.dVdBc;
  const dBcdV0 = -s.dVdV0 / s.dVdBc;
  const dBcdD = -s.dVdD / s.dVdBc;
  // chronograph accuracy is treated as a fixed bias per unit: it does not average out
  const fromChrono = Math.hypot(dBcdV0 * acc * v0, dBcdV1 * acc * v1);
  const fromDistance = Math.abs(dBcdD) * (opts.distErrYd ?? 1);
  const fromScatter = opts.bcScatterSd != null && opts.shots > 1 ? opts.bcScatterSd / Math.sqrt(opts.shots) : 0;
  const sigma = Math.sqrt(fromChrono ** 2 + fromDistance ** 2 + fromScatter ** 2);
  return { bc, sigma, pct: (sigma / bc) * 100, fromChrono, fromDistance, fromScatter };
}

export function bcUncertainty(
  input: SolveInput, v0: number, v1: number, distYd: number,
  opts: { shots: number; accuracyPct?: number; distErrYd?: number; bcScatterSd?: number },
): BcUncertainty | null {
  const bc = solveBcFromVelocities(input, v0, v1, distYd);
  if (bc == null) return null;
  const s = velocitySensitivities(input, bc, v0, [distYd])[0];
  return s ? propagateBc(bc, v0, v1, s, opts) : null;
}

export type BcPlanRow = { distYd: number; v1Fps: number; dropFps: number; mach: number; bcErrPct: number; bulletPathIn: number };
export type BcPlan = { rows: BcPlanRow[]; recommendedYd: number | null };

// Where to put the downrange chronograph: far enough that the velocity loss
// swamps chronograph error, close enough to stay supersonic and practical.
export function bcRangePlan(input: SolveInput, candidatesYd = [100, 150, 200, 250, 300, 400, 500, 600, 700, 800]): BcPlan {
  const bc = input.projectile.bc;
  const sens = velocitySensitivities(input, bc, input.mv, candidatesYd);
  const path = solve(input, candidatesYd).rows;
  const rows: BcPlanRow[] = [];
  for (const s of sens) {
    if (!s) continue;
    const u = propagateBc(bc, input.mv, s.v1, s, { shots: 10 });
    rows.push({
      distYd: s.distYd, v1Fps: s.v1, dropFps: input.mv - s.v1, mach: s.mach, bcErrPct: u.pct,
      bulletPathIn: path.find(r => r.rangeYd === s.distYd)?.dropIn ?? 0,
    });
  }
  const ok = rows.filter(r => r.mach >= DSF_ANCHOR_MACH);
  const good = ok.find(r => r.bcErrPct <= 1.0);
  const best = ok.reduce<BcPlanRow | null>((m, r) => (!m || r.bcErrPct < m.bcErrPct ? r : m), null);
  return { rows, recommendedYd: good?.distYd ?? best?.distYd ?? null };
}

// ── step 3: observed vs calculated elevation at long range ───────────────────

// Elevation that would have centered the group: what you dialed, minus how far
// the group center sat above (+) or below (−) the aim point.
export function observedElevationMil(dialed: number, unit: AngleUnit, groupOffsetIn: number, rangeYd: number): number {
  return toMil(dialed, unit) - Math.atan(groupOffsetIn / (rangeYd * 36)) * 1000;
}

export type DropTruingResult = {
  kind: 'mv' | 'dsf';
  rangeYd: number;
  mach: number;
  predictedMil: number;
  observedMil: number;
  residualMil: number;     // observed − predicted (+ = needed more elevation than calculated)
  mv?: number;             // kind 'mv': muzzle velocity that matches
  mvDelta?: number;
  node?: DsfPoint;         // kind 'dsf'
  dsf?: DsfPoint[];        // kind 'dsf': full table to save
  warnings: string[];
};

export function trueFromDrop(input: SolveInput, rangeYd: number, observedMil: number): DropTruingResult | null {
  const row = solveAt(input, rangeYd);
  if (!row) return null;
  const base = { rangeYd, mach: row.mach, predictedMil: row.elevMil, observedMil, residualMil: observedMil - row.elevMil };
  const warnings: string[] = [];
  const check = 'Check scope tracking (tall-target test), zero, and sight height before saving.';

  if (row.mach >= DSF_ANCHOR_MACH) {
    // MV changes the zero angle too (you zeroed with the real MV), so re-zero each try
    const elev = (mv: number) => solveAt({ ...input, mv }, rangeYd)?.elevMil ?? NaN;
    const mv = findRoot(v => elev(v) - observedMil, input.mv * 0.8, input.mv * 1.2, 0.02);
    if (mv == null) return { ...base, kind: 'mv', warnings: ['No muzzle velocity within ±20% matches this drop. ' + check] };
    const mvDelta = mv - input.mv;
    if (Math.abs(mvDelta) > input.mv * 0.025) {
      warnings.push(`That's a ${Math.abs(mvDelta).toFixed(0)} fps correction — more than chronograph error explains. ${check}`);
    }
    return { ...base, kind: 'mv', mv, mvDelta, warnings };
  }

  // DSF only changes drag below Mach 1.2, so the zero (at ~Mach 2+) is unchanged
  const fixed = { ...input, options: { ...input.options, zeroAngleRad: zeroAngle(input) } };
  const existing = input.projectile.dsf ?? [];
  let nodeMach = row.mach, factor = 1;
  let table: DsfPoint[] = existing;
  for (let pass = 0; pass < 3; pass++) {
    const others = existing.filter(p => Math.abs(p.mach - nodeMach) > 0.03);
    const withNode = (f: number) => [...others, { mach: nodeMach, factor: f }];
    const elev = (f: number) =>
      solveAt({ ...fixed, projectile: { ...input.projectile, dsf: withNode(f) } }, rangeYd)?.elevMil ?? NaN;
    const f = findRoot(x => elev(x) - observedMil, 0.5, 2.0, 1e-5);
    if (f == null) return { ...base, kind: 'dsf', warnings: ['No drag scale factor between 0.5 and 2.0 matches this drop. ' + check] };
    factor = f;
    table = withNode(f);
    const again = solveAt({ ...fixed, projectile: { ...input.projectile, dsf: table } }, rangeYd);
    if (!again || Math.abs(again.mach - nodeMach) < 0.002) break;
    nodeMach = again.mach;
  }
  if (factor < 0.85 || factor > 1.15) {
    warnings.push(`A drag factor of ${factor.toFixed(3)} is a big change. ${check}`);
  }
  const node = { mach: Math.round(nodeMach * 1000) / 1000, factor: Math.round(factor * 10000) / 10000 };
  return { ...base, kind: 'dsf', node, dsf: table.map(p => (p.mach === nodeMach ? node : p)), warnings };
}

export type DropPlanRow = { rangeYd: number; mach: number; elevMil: number; fpsPerClick: number };
export type DropPlan = {
  mvRangeYd: number | null;     // MV truing: farthest distance still clearly supersonic (~Mach 1.25)
  transonicYd: number | null;   // where the bullet drops below Mach 1.2
  dsfRangeYd: number | null;    // DSF truing: about Mach 1.0
  rows: DropPlanRow[];
};

export function dropTruingPlan(input: SolveInput, unit: AngleUnit, maxYd = 2000): DropPlan {
  const ranges: number[] = [];
  for (let r = 100; r <= maxYd; r += 25) ranges.push(r);
  const mid = solve(input, ranges).rows;
  const hi = solve({ ...input, mv: input.mv + 5 }, ranges).rows;
  const lo = solve({ ...input, mv: input.mv - 5 }, ranges).rows;
  const click = clickMil(unit);

  let mvRangeYd: number | null = null, transonicYd: number | null = null, dsfRangeYd: number | null = null;
  for (const r of mid) {
    if (r.mach >= 1.25) mvRangeYd = r.rangeYd;
    if (transonicYd == null && r.mach < DSF_ANCHOR_MACH) transonicYd = r.rangeYd;
    if (dsfRangeYd == null && r.mach <= 1.0) dsfRangeYd = r.rangeYd;
  }
  const rows: DropPlanRow[] = [];
  for (const r of mid) {
    if (r.rangeYd < 300 || r.rangeYd % 100 !== 0) continue;
    const h = hi.find(x => x.rangeYd === r.rangeYd), l = lo.find(x => x.rangeYd === r.rangeYd);
    if (!h || !l) continue;
    const milPerFps = (l.elevMil - h.elevMil) / 10;
    rows.push({ rangeYd: r.rangeYd, mach: r.mach, elevMil: r.elevMil, fpsPerClick: milPerFps > 0 ? click / milPerFps : Infinity });
    if (r.mach < 0.9) break;
  }
  return { mvRangeYd, transonicYd, dsfRangeYd, rows };
}
