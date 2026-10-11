// Published load data from reloading manuals, transcribed from screenshots.
// Each table is one cartridge + bullet: a charge per powder at each listed
// velocity. The last charge in a row is the manual's maximum load — never
// suggest anything above it. Start at the lowest listed charge and work up.
//
// To add a table: copy a block below, keep charges in velocity order, and use
// null for a velocity the manual leaves blank. Powder names must match POWDERS
// in reloadData.ts so a tap fills the powder field exactly.

export type ManualRow = { powder: string; charges: (number | null)[] };

export type ManualBullet = {
  mfr: string;
  model: string;
  item?: string;        // manufacturer item number
  weight: number;       // grains
  col?: number;         // cartridge overall length the manual tested at (in)
  bcG1?: number;
  bcG7?: number;
  velocities: number[]; // fps, column headers
  rows: ManualRow[];
};

export type ManualCartridge = {
  name: string;
  match: RegExp;        // tested against the load's caliber and rifle name
  source: string;
  testRifle?: string;
  barrel?: string;
  case?: string;
  primer?: string;
  diameter: number;     // in
  maxCol?: number;      // in
  maxCaseLen?: number;  // in
  trimLen?: number;     // in
  bullets: ManualBullet[];
};

export const MANUAL_DATA: ManualCartridge[] = [
  {
    name: '300 Norma Mag',
    match: /\b300\s*(norma|nm)\b/,
    source: 'Hornady 12th Edition',
    testRifle: 'Test Barrel',
    barrel: '24", 1 in 9"',
    case: 'Hornady',
    primer: 'Federal 215',
    diameter: 0.308,
    maxCol: 3.681,
    maxCaseLen: 2.492,
    trimLen: 2.482,
    bullets: [
      {
        mfr: 'Hornady', model: 'ELD-X', item: '3078', weight: 220,
        col: 3.475, bcG1: 0.654, bcG7: 0.329,
        velocities: [2700, 2800, 2850, 2900, 2950],
        rows: [
          { powder: 'Hodgdon H1000',       charges: [75.7, 79.7, 81.7, null, null] },
          { powder: 'Vihtavuori N570',     charges: [77.4, 80.6, 82.2, 83.8, null] },
          { powder: 'IMR 8133',            charges: [76.6, 80.0, 81.7, null, null] },
          { powder: 'Norma 217',           charges: [76.5, 80.2, 82.0, 83.8, null] },
          { powder: 'Alliant Reloader 33', charges: [81.7, 85.4, 87.3, 89.1, 91.0] },
          { powder: 'Vihtavuori N170',     charges: [77.4, 81.4, 83.4, null, null] },
          { powder: 'Vihtavuori N565',     charges: [74.6, 78.5, 80.5, null, null] },
          { powder: 'Ramshot LRT',         charges: [83.7, 87.7, 89.7, 91.7, 93.6] },
          { powder: 'Hodgdon US 869',      charges: [91.0, 94.1, 95.7, 97.2, 98.8] },
        ],
      },
      {
        mfr: 'Hornady', model: 'A-Tip Match', item: '3092', weight: 250,
        col: 3.645, bcG1: 0.878, bcG7: 0.442,
        velocities: [2500, 2600, 2700, 2750, 2800],
        rows: [
          { powder: 'Hodgdon H1000',       charges: [72.6, 75.9, 79.2, null, null] },
          { powder: 'Vihtavuori N570',     charges: [74.0, 77.4, 80.9, 82.6, 84.3] },
          { powder: 'IMR 8133',            charges: [74.5, 77.7, 81.0, null, null] },
          { powder: 'Norma 217',           charges: [73.5, 77.1, 80.7, 82.5, null] },
          { powder: 'Alliant Reloader 33', charges: [77.9, 81.2, 84.5, 86.1, null] },
          { powder: 'Vihtavuori N170',     charges: [74.5, 78.0, 81.6, null, null] },
          { powder: 'Vihtavuori N565',     charges: [71.6, 75.2, 78.8, null, null] },
          { powder: 'Ramshot LRT',         charges: [80.2, 84.1, 88.0, 89.9, null] },
          { powder: 'Hodgdon US 869',      charges: [85.9, 89.2, 92.5, 94.2, 95.8] },
        ],
      },
    ],
  },
];

const norm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// the cartridge whose pattern matches any of the given strings (caliber, rifle name…)
export function findCartridge(...srcs: (string | undefined | null)[]): ManualCartridge | null {
  const text = srcs.filter(Boolean).join(' ').toLowerCase().replace(/_+/g, ' ');
  return MANUAL_DATA.find(c => c.match.test(text)) ?? null;
}

// manual data is listed by weight; prefer the same model when there are two at one weight
export function findBullet(c: ManualCartridge, weight: number | null, bullet?: string): ManualBullet | null {
  if (weight == null) return null;
  const same = c.bullets.filter(b => Math.abs(b.weight - weight) < 0.6);
  const name = norm(bullet);
  return same.find(b => name && name.includes(norm(b.model))) ?? same[0] ?? null;
}

// "VIHT N-570", "N570" and "Vihtavuori N570" all find the same row
export function findRow(b: ManualBullet, powder?: string): ManualRow | null {
  const p = norm(powder).replace(/^(hodgdon|vihtavuori|viht|alliant|imr|ramshot|norma|accurate|winchester)/, '');
  if (p.length < 3) return null;
  return b.rows.find(r => {
    const full = norm(r.powder);
    return full === norm(powder) || full.endsWith(p) || full.endsWith(p.replace(/^rl/, 'reloader'));
  }) ?? null;
}

export type ChargePoint = { velocity: number; charge: number };

export function points(b: ManualBullet, r: ManualRow): ChargePoint[] {
  return r.charges
    .map((c, i) => (c == null ? null : { velocity: b.velocities[i], charge: c }))
    .filter((p): p is ChargePoint => p != null);
}

// start = lowest listed charge, max = highest listed charge
export function range(b: ManualBullet, r: ManualRow): { start: ChargePoint; max: ChargePoint } | null {
  const p = points(b, r);
  return p.length ? { start: p[0], max: p[p.length - 1] } : null;
}

// a ladder from the start charge toward the max: at most 10 charges, steps of
// 0.1 gr or more, and the last charge never past max
export function ladderPlan(b: ManualBullet, r: ManualRow): { start: string; step: string; count: string } | null {
  const rg = range(b, r);
  const span = rg ? rg.max.charge - rg.start.charge : 0;
  if (!rg || span < 0.1) return null;
  const step = Math.max(0.1, Math.ceil((span / 9) * 10 - 1e-6) / 10);
  const n = Math.min(10, Math.floor(span / step + 1e-6) + 1);
  return { start: rg.start.charge.toFixed(1), step: step.toFixed(1), count: String(n) };
}
