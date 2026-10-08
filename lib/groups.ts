// Group statistics for plotted shots (x/y in inches, + right / + up).
// Mean radius uses every shot, so it resolves precision differences with
// fewer shots than extreme spread; both are reported.

export type Shot = { x: number; y: number };
export type PlottedGroup = { id: string; date: string; distanceYd: number; shots: Shot[]; note?: string };
export type GroupStats = {
  n: number; cx: number; cy: number;
  es: number; mr: number; sdx: number; sdy: number;
  esPair: [number, number] | null;
};

// Expected extreme spread and mean radius (measured from the group's own
// center) in units of the per-axis standard deviation, for n-shot groups of a
// circular normal. Monte Carlo, 60,000 groups per n.
const ES_PER_SIGMA: Record<number, number> = { 2: 1.772, 3: 2.406, 4: 2.794, 5: 3.069, 6: 3.276, 7: 3.449, 8: 3.581, 9: 3.708, 10: 3.819, 12: 3.988, 15: 4.195, 20: 4.453, 25: 4.638, 30: 4.789 };
const MR_PER_SIGMA: Record<number, number> = { 2: 0.886, 3: 1.022, 4: 1.085, 5: 1.122, 6: 1.145, 7: 1.161, 8: 1.171, 9: 1.182, 10: 1.190, 12: 1.199, 15: 1.210, 20: 1.222, 25: 1.228, 30: 1.232 };

function factor(table: Record<number, number>, n: number): number {
  if (table[n]) return table[n];
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (n <= keys[0]) return table[keys[0]];
  if (n >= keys[keys.length - 1]) return table[keys[keys.length - 1]];
  const hi = keys.find(k => k > n)!, lo = keys[keys.indexOf(hi) - 1];
  return table[lo] + ((n - lo) / (hi - lo)) * (table[hi] - table[lo]);
}
export const esPerSigma = (n: number) => factor(ES_PER_SIGMA, n);
export const mrPerSigma = (n: number) => factor(MR_PER_SIGMA, n);

export const inchesToMoa = (inches: number, yd: number) => inches / ((yd / 100) * 1.047);
export const moaToInches = (moa: number, yd: number) => moa * (yd / 100) * 1.047;

export function groupStats(shots: Shot[]): GroupStats | null {
  const n = shots.length;
  if (n === 0) return null;
  const cx = shots.reduce((a, s) => a + s.x, 0) / n;
  const cy = shots.reduce((a, s) => a + s.y, 0) / n;
  const mr = shots.reduce((a, s) => a + Math.hypot(s.x - cx, s.y - cy), 0) / n;
  let es = 0;
  let esPair: [number, number] | null = null;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const d = Math.hypot(shots[i].x - shots[j].x, shots[i].y - shots[j].y);
    if (d > es) { es = d; esPair = [i, j]; }
  }
  const sd = (vals: number[], m: number) => n > 1 ? Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / (n - 1)) : 0;
  return { n, cx, cy, es, mr, sdx: sd(shots.map(s => s.x), cx), sdy: sd(shots.map(s => s.y), cy), esPair };
}

// Rifle precision as a per-axis standard deviation (MOA), pooled over plotted
// groups by shot count, correcting each group's mean radius for its size.
export function pooledPrecision(groups: PlottedGroup[] | undefined): { sigmaMoa: number; mrMoa: number; shots: number; groups: number } | null {
  let w = 0, sig = 0, mr = 0, count = 0;
  for (const g of groups ?? []) {
    const s = groupStats(g.shots);
    if (!s || s.n < 2 || !(g.distanceYd > 0)) continue;
    const mrMoa = inchesToMoa(s.mr, g.distanceYd);
    sig += (mrMoa / mrPerSigma(s.n)) * s.n;
    mr += mrMoa * s.n;
    w += s.n;
    count++;
  }
  return w ? { sigmaMoa: sig / w, mrMoa: mr / w, shots: w, groups: count } : null;
}

// Per-axis sigma (MOA) from a measured extreme spread of an n-shot group.
export const sigmaFromEs = (esMoa: number, n = 5) => esMoa / esPerSigma(n);

// How much an n-shot group can be trusted, in plain words.
export function sampleNote(n: number): { tone: 'warn' | 'info' | 'good'; text: string } {
  if (n < 5) return { tone: 'warn', text: `${n} shot${n === 1 ? '' : 's'} says very little about precision. Mean radius settles at around 9 to 10 shots.` };
  if (n < 10) return { tone: 'info', text: `A fair start. Shoot 10 or more for a mean radius you can compare between loads.` };
  return { tone: 'good', text: `Good sample. At ${n} shots, mean radius is a dependable measure of precision.` };
}
