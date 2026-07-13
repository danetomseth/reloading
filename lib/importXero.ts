import { Rifle, Load, uid } from './supabase';

// ── Parsed shape of a Garmin Xero / ShotView CSV export ───────────────────────
export type XeroShot = { n: number; speed: number; time: string };
export type ParsedXero = {
  name: string;       // raw profile/session name, e.g. "25CM - 8905"
  riflePart: string;  // portion before " - ", e.g. "25CM"
  lotPart: string;    // portion after " - ", e.g. "8905"
  rawDate: string;    // e.g. "May 24, 2026 at 11:55 AM"
  isoDate: string;    // e.g. "2026-05-24"
  avg: string;        // average speed (fps)
  sd: string;         // standard deviation
  es: string;         // extreme spread
  note: string;       // session note
  shots: XeroShot[];
  count: number;
};

// chrono-session object shape used by app/load/[id].tsx
export type ChronoSession = {
  id: string; date: string; temp: string; distance: string;
  velocity: string; sd: string; es: string; group_size: string;
};

// ── CSV helpers ───────────────────────────────────────────────────────────────
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function toIsoDate(raw: string): string {
  // "May 24, 2026 at 11:55 AM" -> "2026-05-24"
  const m = raw.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${m[2].padStart(2, '0')}`;
  }
  // fallback: try to find an ISO date already present
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return new Date().toISOString().slice(0, 10);
}

// ── Parser ────────────────────────────────────────────────────────────────────
export function parseShotView(text: string): ParsedXero {
  const lines = text.split(/\r?\n/);
  const r: ParsedXero = {
    name: '', riflePart: '', lotPart: '', rawDate: '', isoDate: '',
    avg: '', sd: '', es: '', note: '', shots: [], count: 0,
  };

  r.name = (lines[0] || '').replace(/^﻿/, '').replace(/^"|"$/g, '').trim();

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const cols = splitCsv(raw);
    const first = (cols[0] || '').trim();
    const key = first.toUpperCase();

    if (/^\d+$/.test(first)) {
      const speed = parseFloat(cols[1]);
      if (!isNaN(speed)) r.shots.push({ n: parseInt(first, 10), speed, time: (cols[5] || '').trim() });
    } else if (key === 'AVERAGE SPEED') { r.avg = (cols[1] || '').trim(); }
    else if (key === 'STD DEV')        { r.sd = (cols[1] || '').trim(); }
    else if (key === 'SPREAD')         { r.es = (cols[1] || '').trim(); }
    else if (key === 'SESSION NOTE')   { r.note = (cols[1] || '').trim(); }
    else if (key === 'DATE')           { r.rawDate = (cols[1] || '').trim(); }
  }

  r.count = r.shots.length;
  r.isoDate = r.rawDate ? toIsoDate(r.rawDate) : new Date().toISOString().slice(0, 10);

  // split "25CM - 8905" into rifle/lot parts
  const dash = r.name.split(/\s+-\s+/);
  r.riflePart = (dash[0] || r.name).trim();
  r.lotPart = dash.length > 1 ? dash.slice(1).join(' - ').trim() : '';

  // compute avg/sd/es from shots if the summary rows were missing
  if (!r.avg && r.shots.length) {
    const sp = r.shots.map(s => s.speed);
    const mean = sp.reduce((a, b) => a + b, 0) / sp.length;
    const variance = sp.reduce((a, b) => a + (b - mean) ** 2, 0) / sp.length;
    r.avg = mean.toFixed(1);
    r.es = (Math.max(...sp) - Math.min(...sp)).toFixed(1);
    r.sd = Math.sqrt(variance).toFixed(1);
  }
  return r;
}

// ── Fuzzy caliber/rifle matching ──────────────────────────────────────────────
const CAL_ALIASES: Record<string, string> = {
  cm: 'creedmoor', crd: 'creedmoor', creed: 'creedmoor',
  prc: 'prc', win: 'winchester', wm: 'winmag', wsm: 'wsm',
  lapua: 'lapua', nm: 'norma', ackley: 'ackley', ai: 'ackley', grendel: 'grendel',
};

// find the cartridge-designation number (25, 22, 6.5, 308), skipping bullet
// diameters written as leading-dot decimals like .224 / .257 / .264
function firstCartridgeNum(lower: string): number | null {
  const re = /(\d+\.?\d*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower)) !== null) {
    if (m.index > 0 && lower[m.index - 1] === '.') continue; // it's a diameter, not a cartridge #
    return parseFloat(m[1]);
  }
  return null;
}

// returns { num, family } — num is the cartridge number, family the cartridge word(s)
export function calKey(s: string): { num: number | null; family: string } {
  const lower = (s || '').toLowerCase();
  const num = firstCartridgeNum(lower);
  // words: strip digits/punctuation, expand aliases
  const words = lower
    .replace(/[0-9._-]+/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(Boolean)
    .map(w => CAL_ALIASES[w] || w);
  return { num, family: words.join(' ') };
}

export type RifleMatch = { rifle: Rifle | null; score: number };

// score how well a Xero rifle-part matches an existing rifle (0-100). higher = stronger.
function scoreRifle(riflePart: string, rifle: Rifle): number {
  const a = calKey(riflePart);
  const b = calKey(`${rifle.caliber || ''} ${rifle.name || ''}`);
  const famHit = !!a.family && !!b.family && (b.family.includes(a.family) || a.family.includes(b.family));
  const numHit = a.num != null && b.num != null && Math.abs(a.num - b.num) < 0.01;

  let score = 0;
  if (numHit) score += 60;   // same cartridge number (25 == 25)
  if (famHit) score += 40;   // same cartridge family (creedmoor == creedmoor)

  // name similarity is an independent signal
  const rp = riflePart.toLowerCase().replace(/\s+/g, '');
  const rn = (rifle.name || '').toLowerCase().replace(/\s+/g, '');
  if (rp && rn && rp === rn) score = 100;
  else if (rp.length >= 2 && rn.length >= 2 && (rn.includes(rp) || rp.includes(rn))) score += 25;

  return Math.min(100, score);
}

// pick the best existing rifle for a Xero profile; MATCH_THRESHOLD decides auto-select.
// 85 = at least a cartridge-number match plus one corroborating signal (family or name).
export const MATCH_THRESHOLD = 85;
export function matchRifle(riflePart: string, rifles: Rifle[]): RifleMatch {
  let best: RifleMatch = { rifle: null, score: 0 };
  for (const r of rifles) {
    const score = scoreRifle(riflePart, r);
    if (score > best.score) best = { rifle: r, score };
  }
  return best;
}

// ── Load matching + building ──────────────────────────────────────────────────
// find an existing load to merge into: same lot number (and same rifle if known)
export function matchLoad(p: ParsedXero, rifleName: string, loads: Load[]): Load | null {
  if (!p.lotPart) return null;
  const lot = p.lotPart.toLowerCase();
  const candidates = loads.filter(l => (l.lot_number || '').trim().toLowerCase() === lot);
  if (!candidates.length) return null;
  // prefer one already tied to the same rifle
  const sameRifle = candidates.find(l => (l.rifle || '').toLowerCase() === rifleName.toLowerCase());
  return sameRifle || candidates[0];
}

export function toChronoSession(p: ParsedXero): ChronoSession {
  return { id: uid(), date: p.isoDate, temp: '', distance: '', velocity: p.avg, sd: p.sd, es: p.es, group_size: '' };
}

function parseChrono(json?: string): ChronoSession[] {
  if (!json) return [];
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; }
}

// true if this session (same date + same avg velocity) is already recorded on the load
export function alreadyImported(load: Load, p: ParsedXero): boolean {
  return parseChrono(load.chrono_sessions).some(s => s.date === p.isoDate && s.velocity === p.avg);
}

const shotNote = (p: ParsedXero) => {
  const speeds = p.shots.map(s => s.speed).join(', ');
  const base = `Imported from Garmin Xero (${p.count} shots). Avg ${p.avg} / SD ${p.sd} / ES ${p.es}.` +
    (speeds ? `\nShots: ${speeds}` : '');
  return p.note ? `${p.note}\n${base}` : base;
};

// build a brand-new Load from a parsed Xero session
export function buildNewLoad(p: ParsedXero, rifleName: string): Partial<Load> {
  return {
    id: uid(),
    date: p.isoDate, rifle: rifleName, caliber: '',
    bullet: '', bullet_wt: '', bullet_bc: '', powder: '', charge: '', primer: '',
    brass: '', brass_fires: '', trim_len: '', overall_coal: '', headspace_coal: '',
    max_overall_coal: '', max_headspace_coal: '', neck_tension: '',
    lot_number: p.lotPart,
    velocity: p.avg, sd: p.sd, es: p.es, group_size: '', distance: '', status: 'testing',
    tumbled: 0, ultrasonic: 0, fl_sized: 0, neck_sized: 0, case_trimmed: 0,
    chrono_sessions: JSON.stringify([toChronoSession(p)]),
    notes: shotNote(p),
  };
}

// merge a parsed Xero session into an existing Load (append chrono session, refresh primary stats)
export function mergeIntoLoad(load: Load, p: ParsedXero): Partial<Load> {
  const sessions = parseChrono(load.chrono_sessions);
  sessions.push(toChronoSession(p));
  const prevNotes = load.notes || '';
  const addition = shotNote(p);
  return {
    ...load,
    velocity: p.avg, sd: p.sd, es: p.es,
    chrono_sessions: JSON.stringify(sessions),
    notes: prevNotes.includes(addition) ? prevNotes : (prevNotes ? `${prevNotes}\n\n${addition}` : addition),
  };
}
