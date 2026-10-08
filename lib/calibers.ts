// Cartridge names for grouping rifles: "6gt", "6.5 Creedmoor", ".22LR",
// "7mm Rem Mag" → a consistent label. Uses the caliber field first, then the
// rifle's name, then a bare bore diameter.
import type { Rifle } from './supabase';

const FAMILIES: [RegExp, string][] = [
  [/\b(rem(ington)? ultra mag(num)?|rum)\b/, 'RUM'],
  [/\b(rem(ington)? mag(num)?|rm)\b/, 'Rem Mag'],
  [/\b(win(chester)? mag(num)?|wm)\b/, 'Win Mag'],
  [/\b(creedmoor|creed|cm)\b/, 'Creedmoor'],
  [/\bprc\b/, 'PRC'],
  [/\barc\b/, 'ARC'],
  [/\bgt\b/, 'GT'],
  [/\bdasher\b/, 'Dasher'],
  [/\bbrx\b/, 'BRX'],
  [/\bbra\b/, 'BRA'],
  [/\bbr\b/, 'BR'],
  [/\bwsm\b/, 'WSM'],
  [/\bsaum\b/, 'SAUM'],
  [/\bgunwerks\b/, 'Gunwerks'],
  [/\bgrendel\b/, 'Grendel'],
  [/\b(blackout|blk)\b/, 'Blackout'],
  [/\bvalkyrie\b/, 'Valkyrie'],
  [/\bwmr\b/, 'WMR'],
  [/\b(lr|long rifle)\b/, 'LR'],
  [/\bhornet\b/, 'Hornet'],
  [/\bswift\b/, 'Swift'],
  [/\bnosler\b/, 'Nosler'],
  [/\blapua\b/, 'Lapua'],
  [/\bnorma\b/, 'Norma'],
  [/\b(winchester|win)\b/, 'Win'],
  [/\b(remington|rem)\b/, 'Rem'],
];

const normalize = (s: string) =>
  s.toLowerCase().replace(/_+/g, ' ').replace(/(\d)(?=[a-z])/g, '$1 ').replace(/\s+/g, ' ').trim();

export function parseCartridge(src?: string | null): { label: string; family: boolean } | null {
  const s = normalize(src || '');
  if (!s) return null;
  let famIdx = -1, family = '';
  for (const [re, name] of FAMILIES) {
    const m = s.match(re);
    if (m && m.index != null) { famIdx = m.index; family = name; break; }
  }
  const nums = [...s.matchAll(/(?:^|\s)(\.?\d+(?:\.\d+)?)(\s?mm)?(?=\s|$)/g)];
  const before = famIdx >= 0 ? nums.filter(m => (m.index ?? 0) < famIdx) : nums;
  const pick = before[before.length - 1] ?? nums[0];
  const num = pick ? `${pick[1]}${pick[2] ? 'mm' : ''}` : '';
  const label = [num, family].filter(Boolean).join(' ');
  return label ? { label, family: !!family } : null;
}

export function cartridgeOf(r: Pick<Rifle, 'name' | 'caliber'>): string {
  for (const src of [r.caliber, r.name]) {
    const c = parseCartridge(src);
    if (c?.family) return c.label;
  }
  for (const src of [r.name, r.caliber]) {
    const c = parseCartridge(src);
    if (c) return c.label;
  }
  return 'Other';
}

// "22 ARC - Ruger American" under the 22 ARC group reads as "Ruger American"
export function nameWithin(r: Pick<Rifle, 'name'>, cartridge: string): string {
  const name = r.name || '';
  const cart = cartridge.toLowerCase();
  const flat = name.toLowerCase().replace(/_+/g, ' ');
  if (flat.startsWith(cart)) {
    const rest = name.slice(cartridge.length).replace(/^[\s\-_:–—]+/, '').trim();
    return rest || name;
  }
  // ".22 - Carbon Giggle Gun" under ".22 LR": the part before the dash is the caliber
  const m = name.match(/^(.+?)\s+[-–—:]\s+(.+)$/);
  if (m) {
    const prefix = parseCartridge(m[1])?.label.toLowerCase();
    if (prefix && cart.startsWith(prefix)) return m[2].trim();
  }
  return name;
}

export type CaliberGroup<R> = { key: string; label: string; rifles: R[] };

export function groupByCaliber<R extends Pick<Rifle, 'name' | 'caliber'>>(rifles: R[]): CaliberGroup<R>[] {
  const map = new Map<string, CaliberGroup<R>>();
  for (const r of rifles) {
    const label = cartridgeOf(r);
    const key = label.toLowerCase();
    if (!map.has(key)) map.set(key, { key, label, rifles: [] });
    map.get(key)!.rifles.push(r);
  }
  return [...map.values()].sort((a, b) =>
    (a.key === 'other' ? 1 : 0) - (b.key === 'other' ? 1 : 0) || b.rifles.length - a.rifles.length || a.label.localeCompare(b.label));
}
