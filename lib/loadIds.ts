// Load IDs: one short code per rifle + a sequence number, e.g. "25CM-007".
// Readable at the bench, sortable, and short enough to type as a Garmin Xero
// session name so imported velocities land on the right load automatically.
// Earlier IDs (the old date-random IDs and lot numbers) are kept in
// `legacy_ids` and still match in search and imports.

import type { Load, Rifle } from './supabase';

export const LAST_RIFLE_KEY = 'lrs.lastRifleId';
export const LOAD_ID_RE = /^([A-Z0-9]{1,8})-(\d{3,})$/;

// ── rifle codes ───────────────────────────────────────────────────────────────

// Order matters: more specific phrases first.
const FAMILIES: [RegExp, string][] = [
  [/\b(rem(ington)?\s*ultra\s*mag(num)?|rum)\b/, 'RUM'],
  [/\b(rem(ington)?\s*mag(num)?|rm)\b/, 'RM'],
  [/\b(win(chester)?\s*mag(num)?|wm)\b/, 'WM'],
  [/\bwsm\b/, 'WSM'],
  [/\bsaum\b/, 'SAUM'],
  [/\bprc\b/, 'PRC'],
  [/\b(creed(moor)?|cm)\b/, 'CM'],
  [/\barc\b/, 'ARC'],
  [/\bgrendel\b/, 'GRN'],
  [/\bdasher\b/, 'DSH'],
  [/\bgt\b/, 'GT'],
  [/\bbrx\b/, 'BRX'],
  [/\bbra\b/, 'BRA'],
  [/\bbr\b/, 'BR'],
  [/\blapua\b/, 'LAP'],
  [/\bnorma\b/, 'NM'],
  [/\b(weatherby|wby)\b/, 'WBY'],
  [/\bgunwerks\b/, 'GW'],
  [/\b(ackley|ai)\b/, 'AI'],
  [/\b(blackout|blk)\b/, 'BLK'],
  [/\bvalkyrie\b/, 'VAL'],
  [/\bswift\b/, 'SWF'],
  [/\bhornet\b/, 'HOR'],
  [/\bnosler\b/, 'NOS'],
  [/\b(sherman|shr)\b/, 'SHR'],
];

export const cleanCode = (s: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

function numberPart(s: string): { num: string; mm: boolean } {
  const dash = s.match(/(?:^|[^a-z0-9])(\d{2,3})-(\d{2})(?![0-9])/); // 25-06
  if (dash) return { num: dash[1] + dash[2], mm: false };
  // a cartridge number starts a word: "6.5 PRC", ".257", "7mm" — not the 3 in "T3x"
  const m = s.match(/(?:^|[^a-z0-9.])\.?(\d+(?:\.\d+)?)\s*(mm)?(?:\s*[x×]\s*(\d+))?/);
  if (!m) return { num: '', mm: false };
  let num = m[1].replace('.', '');
  if (m[3]) num += 'X' + m[3];
  return { num, mm: !!m[2] };
}

function codeFrom(src: string): string {
  const s = (src || '').toLowerCase();
  const { num, mm } = numberPart(s);
  if (!num) return '';
  const fam = FAMILIES.find(([re]) => re.test(s))?.[1] ?? (mm ? 'MM' : '');
  // a lone single digit with no cartridge family ("Model 7") isn't a caliber
  if (!fam && num.length < 2) return '';
  return cleanCode(num + fam);
}

// "25 Creedmoor" → 25CM, "7mm Rem Mag" → 7RM, "6.5 PRC" → 65PRC, "6mm" → 6MM
export function deriveRifleCode(name = '', caliber = ''): string {
  const fromName = codeFrom(name);
  if (fromName) return fromName;
  const fromCal = codeFrom(caliber);
  if (fromCal) return fromCal;
  const initials = (name || '').split(/\s+/).filter(Boolean).map(w => w[0]).join('');
  return cleanCode(initials) || 'R';
}

export const rifleCode = (r: Rifle) => cleanCode(r.code || '') || deriveRifleCode(r.name, r.caliber);

// One code per rifle. Saved codes win; derived codes that collide get a
// suffix (65CM, 65CM2, …) in the order the rifles were created.
export function assignCodes(rifles: Rifle[]): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  const ordered = [...rifles].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  for (const r of ordered) {
    const saved = cleanCode(r.code || '');
    if (saved) { out[r.id] = saved; used.add(saved); }
  }
  for (const r of ordered) {
    if (out[r.id]) continue;
    const base = deriveRifleCode(r.name, r.caliber);
    let code = base, k = 2;
    while (used.has(code)) code = cleanCode(base.slice(0, 7) + k++);
    out[r.id] = code;
    used.add(code);
  }
  return out;
}

// ── IDs ──────────────────────────────────────────────────────────────────────

export const normId = (s: string) => (s || '').toUpperCase().replace(/[\s_]+/g, '').replace(/[–—]/g, '-');

export function parseLoadId(id?: string | null): { code: string; seq: number } | null {
  const m = normId(id || '').match(LOAD_ID_RE);
  return m ? { code: m[1], seq: parseInt(m[2], 10) } : null;
}

export function legacyIds(l: Partial<Load>): string[] {
  if (!l.legacy_ids) return [];
  try {
    const v = JSON.parse(l.legacy_ids);
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch { return []; }
}

// every ID this load has ever had, current first
export function allIds(l: Partial<Load>): string[] {
  const ids = [l.load_id || '', ...legacyIds(l), l.lot_number || ''].map(s => s.trim()).filter(Boolean);
  return [...new Set(ids)];
}

// previous IDs only (for "Previously: …" display)
export const previousIds = (l: Partial<Load>) => allIds(l).filter(id => id !== (l.load_id || '').trim());

export function maxSeq(code: string, loads: Partial<Load>[]): number {
  let max = 0;
  for (const l of loads) for (const id of allIds(l)) {
    const p = parseLoadId(id);
    if (p && p.code === code && p.seq > max) max = p.seq;
  }
  return max;
}

export const formatId = (code: string, seq: number) => `${code}-${String(seq).padStart(3, '0')}`;
export const nextLoadId = (code: string, loads: Partial<Load>[]) => formatId(code, maxSeq(code, loads) + 1);

// ── rifle links ──────────────────────────────────────────────────────────────

const sameName = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function rifleOf(row: { rifle?: string; rifle_id?: string }, rifles: Rifle[]): Rifle | undefined {
  if (row.rifle_id) {
    const byId = rifles.find(r => r.id === row.rifle_id);
    if (byId) return byId;
  }
  return rifles.find(r => sameName(r.name, row.rifle));
}

export const belongsTo = (row: { rifle?: string; rifle_id?: string }, rifle: Rifle) =>
  row.rifle_id ? row.rifle_id === rifle.id : sameName(row.rifle, rifle.name);

// ── one-time upgrade of existing loads ───────────────────────────────────────

export type UpgradeItem = { load: Load; newId: string; keep: boolean; oldIds: string[] };
export type UpgradeGroup = { rifle: Rifle; code: string; items: UpgradeItem[] };
export type UpgradePlan = { groups: UpgradeGroup[]; unlinked: Load[]; pending: number };

const sortKey = (l: Load) => (l.date || (l.created_at || '').slice(0, 10) || '9999') + (l.created_at || '');

export function planUpgrade(rifles: Rifle[], loads: Load[], codes: Record<string, string>): UpgradePlan {
  const groups: UpgradeGroup[] = [];
  let pending = 0;
  for (const rifle of rifles) {
    const code = cleanCode(codes[rifle.id] || rifleCode(rifle));
    const mine = loads.filter(l => rifleOf(l, rifles)?.id === rifle.id).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    if (mine.length === 0) continue;
    let next = maxSeq(code, loads) + 1;
    const items = mine.map(load => {
      const cur = parseLoadId(load.load_id);
      if (cur && cur.code === code) return { load, newId: normId(load.load_id || ''), keep: true, oldIds: previousIds(load) };
      pending++;
      return { load, newId: formatId(code, next++), keep: false, oldIds: allIds(load) };
    });
    groups.push({ rifle, code, items });
  }
  const unlinked = loads.filter(l => !rifleOf(l, rifles));
  return { groups, unlinked, pending };
}

export const needsUpgrade = (rifles: Rifle[], loads: Load[]) => {
  const plan = planUpgrade(rifles, loads, assignCodes(rifles));
  return plan.pending + plan.unlinked.length;
};

// ── matching a typed or imported reference ("25CM-007", "25CM - 8905") ─────

export function splitRef(name: string): { riflePart: string; rest: string } {
  const n = normId(name);
  const i = n.indexOf('-');
  return i > 0 ? { riflePart: n.slice(0, i), rest: n.slice(i + 1) } : { riflePart: n, rest: '' };
}

export function findLoadByRef(ref: string, loads: Load[], rifle?: Rifle | null): Load | null {
  const n = normId(ref);
  if (!n) return null;
  const pool = rifle ? loads.filter(l => belongsTo(l, rifle)) : loads;
  const exact = (ls: Load[]) => ls.find(l => allIds(l).some(id => normId(id) === n));
  const hit = exact(pool) || exact(loads);
  if (hit) return hit;
  // legacy Xero naming: "<rifle> - <lot>" where lot is stored by itself
  const { rest } = splitRef(ref);
  if (!rest || !rifle) return null;
  const byLot = (ls: Load[]) => ls.find(l => allIds(l).some(id => normId(id) === rest));
  return byLot(pool) || null;
}
