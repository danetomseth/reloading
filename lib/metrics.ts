// Small display helpers shared by the list and detail screens.
import type { Load } from './supabase';
import { num } from './ballisticProfile';

export const RANK: Record<string, number> = { proven: 3, promising: 2, testing: 1, retired: 0 };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s);
  return isNaN(d.getTime()) ? null : d;
}
export const shortDate = (s?: string | null) => { const d = parseDate(s); return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : (s || ''); };
export const longDate = (s?: string | null) => { const d = parseDate(s); return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : (s || ''); };
export const monthLabel = (s?: string | null) => { const d = parseDate(s); return d ? `${FULL[d.getMonth()]} ${d.getFullYear()}` : 'Undated'; };

// group size normalized by distance, so loads shot at different ranges compare
export const groupMoa = (groupIn?: string | null, distYd?: string | null): number | null => {
  const g = num(groupIn), d = num(distYd);
  return g != null && g > 0 && d != null && d > 0 ? g / ((d / 100) * 1.047) : null;
};
export const loadMoa = (l: Partial<Load>) => groupMoa(l.group_size, l.distance);

// the single most useful number for a list row
export function headline(l: Partial<Load>): string {
  const moa = loadMoa(l);
  if (moa != null) return `${moa.toFixed(2)} MOA`;
  if (num(l.sd) != null) return `SD ${l.sd}`;
  if (num(l.velocity) != null) return `${l.velocity} fps`;
  return '';
}

export const recipe = (l: Partial<Load>) => [
  l.bullet ? `${l.bullet}${l.bullet_wt ? ` ${l.bullet_wt}gr` : ''}` : '',
  l.powder ? `${l.powder}${l.charge ? ` ${l.charge}gr` : ''}` : '',
].filter(Boolean).join(' · ');

// best load: status first, then tightest group, then lowest SD
export function pickBest(loads: Load[]): Load | null {
  const key = (l: Load) => [RANK[l.status] ?? 1, -(loadMoa(l) ?? 99), -(num(l.sd) ?? 99)];
  const sorted = [...loads].sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return 0;
  });
  return sorted[0] ?? null;
}

export type LadderStep = { id: string; charge: string; velocity: string; group_size: string };
export function ladderSteps(l: Partial<Load>): LadderStep[] {
  try {
    const v = l.ladder ? JSON.parse(l.ladder) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

// totals per calendar month for the last `months` months (oldest first)
export function monthlyTotals<T>(items: T[], date: (t: T) => string | undefined, value: (t: T) => number, months = 6) {
  const now = new Date();
  const out: { key: string; label: string; value: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], value: 0 });
  }
  for (const it of items) {
    const d = parseDate(date(it));
    if (!d) continue;
    const o = out.find(x => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (o) o.value += value(it);
  }
  return out;
}

export const CASE_PREP: [keyof Load, string][] = [
  ['tumbled', 'Tumbled'], ['ultrasonic', 'Ultrasonic'], ['fl_sized', 'Full-length sized'],
  ['neck_sized', 'Neck sized'], ['case_trimmed', 'Trimmed'],
];
