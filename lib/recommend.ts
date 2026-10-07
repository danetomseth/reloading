// Suggestions for a new or edited load, from the same rifle's history:
//   1. the best proven/promising load with the same bullet → recipe + seating
//   2. the newest same-bullet load with seating measurements (pre-measured COAL)
//   3. otherwise the best proven/promising load on the rifle → case prep only
// Charges are only suggested from a load that used the same powder.

import type { Load, Rifle } from './supabase';
import { belongsTo } from './loadIds';
import { num } from './ballisticProfile';

export type Suggestion = { field: keyof Load; label: string; value: string; current: string };
export type Recommendation = { title: string; detail: string; source?: Load; suggestions: Suggestion[]; notes: string[] };

const RANK: Record<string, number> = { proven: 3, promising: 2, testing: 1, retired: 0 };
const norm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
const dateOf = (l: Load) => Date.parse(l.date || l.created_at || '') || 0;
const score = (l: Load) => (RANK[l.status] ?? 1) * 1e13 + dateOf(l) / 10;
const isRange = (s?: string) => /\d\s*[-–]\s*\d/.test(s || '');
export const loadLabel = (l: Partial<Load>) => l.load_id || (l.lot_number ? `Lot ${l.lot_number}` : '') || l.bullet || 'load';

export const sameBullet = (a: Partial<Load>, b: Partial<Load>) => {
  if (!norm(a.bullet) || norm(a.bullet) !== norm(b.bullet)) return false;
  const wa = num(a.bullet_wt), wb = num(b.bullet_wt);
  return wa == null || wb == null || Math.abs(wa - wb) < 0.6;
};

const RECIPE: [keyof Load, string][] = [
  ['powder', 'Powder'], ['charge', 'Charge (gr)'], ['primer', 'Primer'], ['brass', 'Brass'], ['neck_tension', 'Neck tension'],
];
const SEATING: [keyof Load, string][] = [
  ['overall_coal', 'SAC'], ['max_overall_coal', 'Hornady'], ['max_headspace_coal', 'OAL'], ['headspace_coal', 'Headspace COAL'],
];
const CASE: [keyof Load, string][] = [['trim_len', 'Trim length'], ['primer', 'Primer'], ['brass', 'Brass']];

export function performance(l: Load): string {
  const parts = [
    l.velocity ? `${l.velocity} fps` : '',
    l.sd ? `SD ${l.sd}` : '',
    l.group_size ? `${l.group_size}" @ ${l.distance || '?'} yd` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

export function recommend(draft: Partial<Load>, rifle: Rifle | undefined, loads: Load[]): Recommendation | null {
  if (!rifle) return null;
  const mine = loads.filter(l => l.id !== draft.id && belongsTo(l, rifle));
  if (mine.length === 0) return null;

  const out: Suggestion[] = [];
  const notes: string[] = [];
  const add = (field: keyof Load, label: string, value: unknown) => {
    const v = String(value ?? '').trim();
    const cur = String(draft[field] ?? '').trim();
    if (!v || v === cur || out.some(s => s.field === field)) return;
    out.push({ field, label, value: v, current: cur });
  };

  const same = norm(draft.bullet) ? mine.filter(l => sameBullet(l, draft)).sort((a, b) => score(b) - score(a)) : [];
  const best = same.find(l => (RANK[l.status] ?? 0) >= 2);
  let source: Load | undefined;
  let title = '';

  if (best) {
    source = best;
    title = `From ${loadLabel(best)} (${best.status})`;
    const samePowder = !norm(draft.powder) || norm(draft.powder) === norm(best.powder);
    for (const [f, lbl] of RECIPE) {
      if (f === 'powder' && !samePowder) continue;
      if (f === 'charge') {
        if (!samePowder) { notes.push(`No charge suggested: ${loadLabel(best)} used ${best.powder}, not ${draft.powder}.`); continue; }
        if (isRange(best.charge)) continue;
      }
      add(f, lbl, best[f]);
    }
    for (const [f, lbl] of SEATING) add(f, lbl, best[f]);
    add('trim_len', 'Trim length', best.trim_len);
  }

  // pre-measured seating: newest same-bullet load with any COAL measurement
  const measured = same
    .filter(l => SEATING.some(([f]) => String(l[f] ?? '').trim()))
    .sort((a, b) => dateOf(b) - dateOf(a))[0];
  if (measured) {
    if (!source) {
      source = measured;
      title = `Seating measured on ${loadLabel(measured)}`;
    }
    if (measured !== source) {
      const newer = SEATING
        .filter(([f]) => String(measured[f] ?? '').trim() && String(measured[f]).trim() !== String(source?.[f] ?? '').trim())
        .map(([f, lbl]) => `${lbl} ${measured[f]}`);
      if (newer.length && dateOf(measured) > dateOf(source!)) {
        notes.push(`Newer measurement on ${loadLabel(measured)} (${measured.date || 'undated'}): ${newer.join(', ')}.`);
      }
    }
    for (const [f, lbl] of SEATING) add(f, lbl, measured[f]);
    add('trim_len', 'Trim length', measured.trim_len);
  }

  if (!source) {
    const rifleBest = [...mine].sort((a, b) => score(b) - score(a)).find(l => (RANK[l.status] ?? 0) >= 2);
    if (rifleBest) {
      source = rifleBest;
      title = `Case prep from ${loadLabel(rifleBest)} (${rifleBest.status})`;
      for (const [f, lbl] of CASE) add(f, lbl, rifleBest[f]);
    }
  }

  if (!source || (out.length === 0 && notes.length === 0)) return null;
  return { title, detail: performance(source), source, suggestions: out, notes };
}
