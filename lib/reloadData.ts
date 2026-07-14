// Reference data for reload entry: common powders + a starter bullet library.
// Values are convenience prefills — every field stays editable on the load form.
// BCs are manufacturer-published figures; verify against the current data book.

// ── Powders (searchable list; Alliant shown with RL alias) ────────────────────
export const POWDERS: string[] = [
  // Hodgdon
  'H4350', 'H4831', 'H4831SC', 'H1000', 'H4895', 'Varget', 'H4198', 'H322',
  'H335', 'H380', 'H414', 'BL-C(2)', 'CFE 223', 'Benchmark', 'Superformance',
  'LEVERevolution', 'Retumbo', 'US 869', 'H50BMG',
  // IMR
  'IMR 3031', 'IMR 4064', 'IMR 4166', 'IMR 4320', 'IMR 4350', 'IMR 4451',
  'IMR 4831', 'IMR 4895', 'IMR 7828', 'IMR 7828 SSC', 'IMR 8208 XBR',
  'IMR 4198', 'IMR 4227',
  // Alliant
  'Reloder 7 (RL-7)', 'Reloder 10x (RL-10x)', 'Reloder 15 (RL-15)',
  'Reloder 16 (RL-16)', 'Reloder 17 (RL-17)', 'Reloder 19 (RL-19)',
  'Reloder 22 (RL-22)', 'Reloder 23 (RL-23)', 'Reloder 25 (RL-25)',
  'Reloder 26 (RL-26)', 'Reloder 33 (RL-33)', 'AR-Comp',
  'Power Pro 4000 MR', 'Power Pro 2000 MR', 'Power Pro 1200-R', 'Hybrid 100V',
  // Vihtavuori
  'N120', 'N130', 'N133', 'N135', 'N140', 'N150', 'N160', 'N165', 'N170',
  'N540', 'N550', 'N555', 'N560', 'N565', 'N568', '24N41',
  // Winchester
  'StaBALL 6.5', 'StaBALL HD', 'StaBALL Match', 'Win 748', 'Win 760',
  // Ramshot
  'Ramshot TAC', 'Ramshot X-Terminator', 'Ramshot Big Game', 'Ramshot Hunter',
  'Ramshot Magnum', 'Ramshot Grand', 'Ramshot LRT',
  // Accurate
  'Accurate 2230', 'Accurate 2460', 'Accurate 2495', 'Accurate 2520',
  'Accurate 2700', 'Accurate 4064', 'Accurate 4350', 'Accurate 4831',
  'Accurate MagPro', 'Accurate LT-30', 'Accurate LT-32',
  // Norma / Shooters World
  'Norma URP', 'Norma MRP', 'Norma MRP-2', 'Norma 203-B', 'Norma 204',
  'SW Precision Rifle', 'SW Match Rifle', 'SW Tactical Rifle',
].sort((a, b) => a.localeCompare(b));

// ── Bullet library ────────────────────────────────────────────────────────────
export type Bullet = {
  mfr: string;
  model: string;
  weight: number;    // grains
  diameter: number;  // inches
  bcG1?: number;
  bcG7?: number;
  col?: number;      // suggested cartridge overall length (in), when published
  item?: string;     // manufacturer item #, when known
};

// Sectional density = (grains / 7000) / diameter²  — computed, never stored.
export const computeSD = (weight: number, diameter: number): string =>
  diameter > 0 ? ((weight / 7000) / (diameter * diameter)).toFixed(3) : '';

export const BULLETS: Bullet[] = [
  // .224" — 22 cal (incl. 22 Creedmoor). 62 ELD-VT is exact from the Hornady app.
  { mfr: 'Hornady', model: 'ELD-VT',  weight: 62,   diameter: 0.224, bcG1: 0.395, bcG7: 0.199, col: 2.590, item: '22762' },
  { mfr: 'Hornady', model: 'ELD-M',   weight: 75,   diameter: 0.224, bcG1: 0.467, bcG7: 0.234 },
  { mfr: 'Hornady', model: 'ELD-M',   weight: 88,   diameter: 0.224, bcG1: 0.545, bcG7: 0.274 },
  { mfr: 'Sierra',  model: 'MatchKing', weight: 69, diameter: 0.224, bcG1: 0.301 },
  { mfr: 'Sierra',  model: 'MatchKing', weight: 77, diameter: 0.224, bcG1: 0.362 },
  { mfr: 'Sierra',  model: 'TMK',     weight: 77,   diameter: 0.224, bcG1: 0.420 },
  { mfr: 'Berger',  model: 'LRHT',    weight: 85.5, diameter: 0.224, bcG1: 0.545 },

  // .243" — 6mm
  { mfr: 'Hornady', model: 'ELD-M',   weight: 108,  diameter: 0.243, bcG1: 0.536, bcG7: 0.270 },
  { mfr: 'Berger',  model: 'Hybrid Target', weight: 105, diameter: 0.243, bcG1: 0.545 },
  { mfr: 'Sierra',  model: 'MatchKing', weight: 107, diameter: 0.243, bcG1: 0.420 },

  // .257" — 25 cal (incl. 25 Creedmoor)
  { mfr: 'Hornady', model: 'ELD-X',   weight: 110,  diameter: 0.257, bcG1: 0.465 },
  { mfr: 'Berger',  model: 'Elite Hunter', weight: 135, diameter: 0.257, bcG1: 0.520 },

  // .264" — 6.5mm
  { mfr: 'Hornady', model: 'ELD-M',   weight: 140,  diameter: 0.264, bcG1: 0.610, bcG7: 0.307 },
  { mfr: 'Hornady', model: 'ELD-M',   weight: 147,  diameter: 0.264, bcG1: 0.697, bcG7: 0.351 },
  { mfr: 'Hornady', model: 'ELD-X',   weight: 143,  diameter: 0.264, bcG1: 0.625, bcG7: 0.315 },
  { mfr: 'Berger',  model: 'Hybrid Target', weight: 140, diameter: 0.264, bcG1: 0.618 },
  { mfr: 'Sierra',  model: 'MatchKing', weight: 142, diameter: 0.264, bcG1: 0.595 },

  // .277" — 270
  { mfr: 'Hornady', model: 'ELD-X',   weight: 145,  diameter: 0.277, bcG1: 0.536 },

  // .284" — 7mm
  { mfr: 'Hornady', model: 'ELD-M',   weight: 162,  diameter: 0.284, bcG1: 0.615, bcG7: 0.310 },
  { mfr: 'Hornady', model: 'ELD-M',   weight: 180,  diameter: 0.284, bcG1: 0.796, bcG7: 0.401 },
  { mfr: 'Berger',  model: 'Hybrid Target', weight: 180, diameter: 0.284, bcG1: 0.680 },

  // .308" — 30 cal
  { mfr: 'Hornady', model: 'ELD-M',   weight: 168,  diameter: 0.308, bcG1: 0.523, bcG7: 0.263 },
  { mfr: 'Hornady', model: 'ELD-X',   weight: 178,  diameter: 0.308, bcG1: 0.552, bcG7: 0.278 },
  { mfr: 'Hornady', model: 'ELD-M',   weight: 208,  diameter: 0.308, bcG1: 0.690, bcG7: 0.347 },
  { mfr: 'Sierra',  model: 'MatchKing', weight: 175, diameter: 0.308, bcG1: 0.505 },
  { mfr: 'Sierra',  model: 'MatchKing', weight: 168, diameter: 0.308, bcG1: 0.462 },
  { mfr: 'Berger',  model: 'Juggernaut', weight: 185, diameter: 0.308, bcG1: 0.550 },

  // .338"
  { mfr: 'Hornady', model: 'ELD-M',   weight: 285,  diameter: 0.338, bcG1: 0.789, bcG7: 0.396 },
  { mfr: 'Berger',  model: 'Elite Hunter', weight: 300, diameter: 0.338, bcG1: 0.822 },
];

// ── diameter grouping + caliber → diameter mapping ────────────────────────────
export const diameterLabel = (d: number): string => ({
  0.224: '22 cal · .224"',
  0.243: '6mm · .243"',
  0.257: '25 cal · .257"',
  0.264: '6.5mm · .264"',
  0.277: '270 · .277"',
  0.284: '7mm · .284"',
  0.308: '30 cal · .308"',
  0.338: '338 · .338"',
}[d] || `.${Math.round(d * 1000)}"`);

// unique diameters present in the library, in ascending order
export const bulletDiameters = (): number[] =>
  [...new Set(BULLETS.map(b => b.diameter))].sort((a, b) => a - b);

export const bulletsForDiameter = (d: number): Bullet[] =>
  BULLETS.filter(b => b.diameter === d).sort((a, b) => a.weight - b.weight);

// cartridge-number → bullet diameter (for guessing the group from a caliber string)
const NUM_TO_DIA: Record<string, number> = {
  '22': 0.224, '220': 0.224, '222': 0.224, '223': 0.224, '224': 0.224,
  '6': 0.243, '243': 0.243, '244': 0.243,
  '25': 0.257, '257': 0.257,
  '6.5': 0.264, '65': 0.264, '260': 0.264, '264': 0.264, '6.5cm': 0.264,
  '270': 0.277, '277': 0.277,
  '7': 0.284, '280': 0.284, '284': 0.284,
  '30': 0.308, '308': 0.308, '300': 0.308, '3006': 0.308,
  '338': 0.338,
};

// best-guess diameter for a free-text caliber like "25CM", "22 Creedmoor", ".257"
export const suggestDiameter = (caliber: string): number | null => {
  const s = (caliber || '').toLowerCase();
  // explicit diameter like .224 / 0.264
  const dia = s.match(/0?\.(\d{3})/);
  if (dia) {
    const d = parseFloat('0.' + dia[1]);
    const known = bulletDiameters().find(k => Math.abs(k - d) < 0.002);
    if (known) return known;
  }
  // cartridge number (skip diameter decimals)
  const re = /(\d+\.?\d*)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > 0 && s[m.index - 1] === '.') continue;
    const key = m[1];
    if (NUM_TO_DIA[key] != null) return NUM_TO_DIA[key];
  }
  return null;
};
