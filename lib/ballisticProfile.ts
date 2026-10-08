// Glue between database rows (all text) and the ballistics engine.
// A load's ballistic profile lives as JSON in loads.ballistics; anything not
// saved there falls back to the load's own fields and the bullet library.

import type { Load, Rifle } from './supabase';
import { BULLETS, Bullet } from './reloadData';
import type { DragModelName, DsfPoint } from './ballistics/drag';
import { Atmosphere, pressureAtAltitude } from './ballistics/atmosphere';
import type { Conditions, RifleSetup, SolveInput } from './ballistics/solver';
import type { AngleUnit, TempPoint } from './ballistics/truing';
import type { PlottedGroup } from './groups';

export type TruingLogEntry = { date: string; step: 'mv' | 'bc' | 'drop' | 'reset'; summary: string };

export type BallisticProfile = {
  model: DragModelName;
  bc: number;
  bcPublished?: number;   // BC before a two-chronograph measurement replaced it
  bcMeasured?: boolean;
  mv: number;             // chronograph average at mvTempF, fps
  mvSd?: number;
  mvShots?: number;
  mvTempF?: number;
  tempSens?: number;      // fps per °F (+ = faster when warmer)
  mvDelta?: number;       // correction from long-range drop truing, fps
  dsf?: DsfPoint[];       // transonic drag scale factors from truing
  weightGr?: number;
  diameterIn?: number;
  lengthIn?: number;
  log?: TruingLogEntry[];
  groups?: PlottedGroup[]; // shots plotted on the target screen
};

export function num(s: unknown): number | null {
  if (s == null) return null;
  const m = String(s).replace(/,/g, '').match(/-?\d*\.?\d+/);
  if (!m) return null;
  const v = parseFloat(m[0]);
  return Number.isFinite(v) ? v : null;
}

// "1:8", "8", "1:7.5 LH", "8L" → inches per turn + direction
export function parseTwist(s?: string | null): { twistIn: number | null; left: boolean } {
  const str = (s || '').trim();
  if (!str) return { twistIn: null, left: false };
  const left = /\b(lh|left)\b/i.test(str) || /\d\s*l$/i.test(str);
  const m = str.match(/1\s*[:/-]\s*(\d*\.?\d+)/) || str.match(/(\d*\.?\d+)/);
  const t = m ? parseFloat(m[1]) : NaN;
  return { twistIn: Number.isFinite(t) && t > 1 ? t : null, left };
}

const CART_DIA: Record<string, number> = {
  '17': 0.172, '20': 0.204, '22': 0.224, '223': 0.224, '224': 0.224, '6': 0.243, '243': 0.243,
  '25': 0.257, '257': 0.257, '6.5': 0.264, '65': 0.264, '260': 0.264, '264': 0.264, '270': 0.277,
  '27': 0.277, '7': 0.284, '28': 0.284, '280': 0.284, '284': 0.284, '30': 0.308, '300': 0.308,
  '308': 0.308, '338': 0.338, '375': 0.375,
};

export function matchBullet(l: Partial<Load>): Bullet | undefined {
  const name = (l.bullet || '').toLowerCase();
  if (!name) return undefined;
  const wt = num(l.bullet_wt);
  return BULLETS.find(b =>
    name.includes(b.mfr.toLowerCase()) && name.includes(b.model.toLowerCase()) &&
    (wt == null || Math.abs(b.weight - wt) < 0.6));
}

export function bulletDiameter(l: Partial<Load>, rifle?: Rifle | null): number | null {
  const b = matchBullet(l);
  if (b) return b.diameter;
  for (const src of [l.caliber, rifle?.caliber, rifle?.name]) {
    const s = String(src || '').toLowerCase();
    const dec = s.match(/(?:^|[^0-9.])0?\.(\d{3})(?![0-9])/);
    if (dec) return parseFloat('0.' + dec[1]);
    const n = s.match(/(\d+(?:\.\d+)?)/);
    if (n && CART_DIA[n[1]]) return CART_DIA[n[1]];
  }
  return null;
}

export function rifleSetup(rifle?: Rifle | null): RifleSetup {
  const t = parseTwist(rifle?.twist);
  return {
    sightHeightIn: num(rifle?.scope_height) ?? 1.5,
    zeroYd: num(rifle?.zero_range) ?? 100,
    twistIn: t.twistIn ?? undefined,
    twistLeft: t.left,
  };
}

export const scopeUnit = (rifle?: Rifle | null): AngleUnit =>
  /mil|mrad/i.test(rifle?.scope_unit || '') ? 'mil' : 'moa';

// Station pressure from what was typed. A sea-level-corrected (barometric)
// reading at altitude is converted: treating 30.0 inHg as station pressure at
// 4,500 ft would overstate air density by ~17%.
export function stationPressure(pressureInHg: number | null, altitudeFt: number | null) {
  if (pressureInHg == null) {
    return { inHg: altitudeFt != null ? pressureAtAltitude(altitudeFt) : 29.92, converted: false, assumed: true };
  }
  if (altitudeFt != null && altitudeFt > 1000) {
    const std = pressureAtAltitude(altitudeFt);
    if (Math.abs(pressureInHg - 29.92) < Math.abs(pressureInHg - std)) {
      return { inHg: pressureInHg * (std / 29.92126), converted: true, assumed: false };
    }
  }
  return { inHg: pressureInHg, converted: false, assumed: false };
}

export type AtmoText = { temp?: string; pressure?: string; humidity?: string; altitude?: string };

export function atmoFromText(t: AtmoText): { atmo: Atmosphere; note: string | null } {
  const alt = num(t.altitude);
  const sp = stationPressure(num(t.pressure), alt);
  const atmo: Atmosphere = { tempF: num(t.temp) ?? 59, pressureInHg: sp.inHg, humidity: num(t.humidity) ?? 50 };
  let note: string | null = null;
  if (sp.converted) note = `That pressure looks sea-level corrected, so it's converted to ${sp.inHg.toFixed(2)} inHg station pressure for ${alt} ft.`;
  else if (sp.assumed) note = alt != null ? 'No pressure entered, so it is estimated from altitude.' : 'No pressure or altitude entered, so sea-level standard air is used.';
  return { atmo, note };
}

export type ChronoRow = {
  id: string; date: string; temp: string; distance: string; velocity: string;
  sd: string; es: string; group_size: string; n?: string;
};

export function chronoRows(l: Partial<Load>): ChronoRow[] {
  try {
    const v = l.chrono_sessions ? JSON.parse(l.chrono_sessions) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export const tempPoints = (l: Partial<Load>): TempPoint[] =>
  chronoRows(l)
    .map(r => ({ tempF: num(r.temp), velocity: num(r.velocity), n: num(r.n) }))
    .filter((p): p is { tempF: number; velocity: number; n: number | null } => p.tempF != null && p.velocity != null)
    .map(p => ({ tempF: p.tempF, velocity: p.velocity, n: p.n ?? undefined }));

export function readProfile(l: Partial<Load>, rifle?: Rifle | null): BallisticProfile {
  let saved: Partial<BallisticProfile> = {};
  try {
    const v = l.ballistics ? JSON.parse(l.ballistics) : null;
    if (v && typeof v === 'object') saved = v;
  } catch { /* unreadable profile: rebuild from the load */ }
  const lib = matchBullet(l);
  const latest = [...chronoRows(l)].reverse().find(r => num(r.velocity) != null);
  const typedBc = num(l.bullet_bc);
  let model: DragModelName = saved.model ?? (lib?.bcG7 ? 'G7' : 'G1');
  let bc = saved.bc || (model === 'G7' ? lib?.bcG7 : (typedBc ?? lib?.bcG1)) || 0;
  if (!(bc > 0) && typedBc) { model = 'G1'; bc = typedBc; }
  return {
    ...saved,
    model,
    bc,
    mv: saved.mv || num(l.velocity) || num(latest?.velocity) || 0,
    mvSd: saved.mvSd ?? num(l.sd) ?? undefined,
    mvTempF: saved.mvTempF ?? num(latest?.temp) ?? undefined,
    weightGr: saved.weightGr ?? num(l.bullet_wt) ?? lib?.weight,
    diameterIn: saved.diameterIn ?? bulletDiameter(l, rifle) ?? undefined,
    log: saved.log ?? [],
  };
}

export const writeProfile = (p: BallisticProfile) => JSON.stringify(p);

export const appendLog = (p: BallisticProfile, step: TruingLogEntry['step'], summary: string): BallisticProfile => ({
  ...p,
  log: [...(p.log ?? []), { date: new Date().toISOString().slice(0, 10), step, summary }].slice(-30),
});

// MV for today's powder temperature, plus any long-range correction.
export function effectiveMv(p: BallisticProfile, tempF?: number | null, useTruing = true): number {
  let mv = p.mv;
  if (p.tempSens && p.mvTempF != null && tempF != null) mv += p.tempSens * (tempF - p.mvTempF);
  if (useTruing && p.mvDelta) mv += p.mvDelta;
  return mv;
}

export function buildInput(p: BallisticProfile, rifle: Rifle | null | undefined, conditions: Conditions, useTruing = true): SolveInput {
  return {
    mv: effectiveMv(p, conditions.atmo.tempF, useTruing),
    projectile: {
      bc: p.bc, model: p.model,
      weightGr: p.weightGr ?? 0, diameterIn: p.diameterIn ?? 0, lengthIn: p.lengthIn,
      dsf: useTruing ? p.dsf : undefined,
    },
    rifle: rifleSetup(rifle),
    conditions,
  };
}

// what's missing before the solver can run
export function profileGaps(p: BallisticProfile): string[] {
  const gaps: string[] = [];
  if (!(p.mv > 0)) gaps.push('muzzle velocity');
  if (!(p.bc > 0)) gaps.push('BC');
  return gaps;
}
