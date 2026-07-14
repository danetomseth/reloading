// Reference data for reload entry: rifle powders + a bullet library.
// Values are convenience prefills — every field stays editable on the load form.
// Powders: rifle-only list from lindcottarmory.com/powder-library.
// Bullets: manufacturer-published BCs, verified per-bullet from hornady.com,
// bergerbullets.com, and sierrabullets.com (Sierra = highest velocity-band G1).

// ── Rifle powders (searchable) ────────────────────────────────────────────────
export const POWDERS: string[] = [
  'Vectan A0', 'ADI AR 2205', 'Alliant Power Pro Varmint', 'Ramshot X-Terminator',
  'Reload Swiss RS40', 'Somchem S133', 'IMR 4198', 'Lovex S010',
  'Shooters World Economy Rifle', 'Accurate 2230', 'IMR 4227', 'Vectan A1',
  'Ramshot TAC', 'Somchem S135', 'Winchester 748', 'Hodgdon CFE BLK',
  'Maxam CSRB1', 'Hodgdon 5744', 'IMR 8208 XBR', 'Hodgdon Leverevolution',
  'Accurate 2520', 'Lovex D032.5', 'Somchem MS200', 'Reload Swiss RS50',
  'Alliant Reloader 7', 'Shooters World Match Rifle', 'Vihtavuori N130', 'Norma 201',
  'Reload Swiss RS52', 'Accurate 2495', 'Hodgdon Benchmark', 'Hodgdon H322',
  'Alliant Reloader 10x', 'ADI AR 2206H', 'ADI AR 2207', 'Hodgdon H335',
  'Vihtavuori N133', 'Accurate 2015', 'Hodgdon BL-C(2)', 'Shooters World Precision Rifle',
  'Alliant AR-Comp', 'ADI AR 2208', 'Accurate LT-30', 'Reload Swiss RS60',
  'Somchem S243', 'Winchester 760', 'Accurate 2460', 'Hodgdon CFE 223',
  'IMR 3031', 'Alliant Power Pro 4000-MR', 'Hodgdon H4895', 'IMR 4895',
  'Vihtavuori N135', 'Vihtavuori N550', 'Winchester 670', 'Norma 203-B',
  'Accurate 2700', 'Alliant Reloader 15', 'Maxam CSRB2', 'Lovex D072.5',
  'Norma 202', 'Hodgdon Superformance', 'Hodgdon H380', 'Alliant Reloader 16',
  'IMR 4320', 'Shooters World Long Rifle', 'Vihtavuori N555', 'Accurate LT-32',
  'Ramshot Hunter', 'Winchester StaBALL Match', 'Hodgdon Varget', 'Vihtavuori N140',
  'Accurate 4064', 'Accurate 4350', 'ADI AR 2209', 'IMR 4064',
  'Vihtavuori N540', 'Reload Swiss RS62', 'Somchem S353', 'Alliant Reloader 17',
  'Norma URP', 'Hodgdon H414', 'Vihtavuori N560', 'Norma 204',
  'Winchester StaBALL 6.5', 'Hodgdon H4350', 'Vihtavuori N150', 'IMR 4350',
  'Ramshot Big Game', 'Alliant Reloader 19', 'Somchem S355', 'Hodgdon H4831',
  'Hodgdon H4831SC', 'ADI AR 2213SC', 'IMR 4831', 'Reload Swiss RS70',
  'Vihtavuori N160', 'Vihtavuori 20N29', 'Winchester StaBALL HD', 'Vectan Tubal 7000',
  'Alliant Reloader 22', 'ADI AR 2217', 'Shooters World Magnum Rifle', 'Vihtavuori N165',
  'Vihtavuori N565', 'Vihtavuori N570', 'Somchem S365', 'Alliant Reloader 23',
  'Winchester 780', 'Accurate MagPro', 'Hodgdon H1000', 'Ramshot Magnum',
  'ADI AR 2218', 'Vihtavuori N170', 'Alliant Reloader 25', 'Hodgdon Retumbo',
  'Alliant Reloader 26', 'Ramshot LRT', 'Vihtavuori 24N41', 'Hodgdon H870',
  'Alliant Reloader 33', 'Vihtavuori N105', 'Hodgdon H50BMG', 'Alliant Reloader 50',
].sort((a, b) => a.localeCompare(b));

// ── Bullet library ────────────────────────────────────────────────────────────
export type Bullet = {
  mfr: string;
  model: string;
  weight: number;    // grains
  diameter: number;  // inches
  bcG1?: number;
  bcG7?: number;
  col?: number;      // suggested CARTRIDGE overall length (in), when published
};

// Sectional density = (grains / 7000) / diameter²  — computed, never stored.
export const computeSD = (weight: number, diameter: number): string =>
  diameter > 0 ? ((weight / 7000) / (diameter * diameter)).toFixed(3) : '';

export const BULLETS: Bullet[] = [
  // ── .224" · 22 cal (incl. 22 Creedmoor) ──
  { mfr: 'Sierra',  model: 'BlitzKing',     weight: 55,   diameter: 0.224, bcG1: 0.271 },
  { mfr: 'Hornady', model: 'V-MAX',         weight: 55,   diameter: 0.224, bcG1: 0.255 },
  { mfr: 'Hornady', model: 'ELD-VT',        weight: 62,   diameter: 0.224, bcG1: 0.395, bcG7: 0.199, col: 2.590 },
  { mfr: 'Sierra',  model: 'MatchKing',     weight: 69,   diameter: 0.224, bcG1: 0.301 },
  { mfr: 'Sierra',  model: 'TMK',           weight: 69,   diameter: 0.224, bcG1: 0.375 },
  { mfr: 'Hornady', model: 'ELD-M',         weight: 75,   diameter: 0.224, bcG1: 0.467, bcG7: 0.235 },
  { mfr: 'Sierra',  model: 'MatchKing',     weight: 77,   diameter: 0.224, bcG1: 0.362 },
  { mfr: 'Sierra',  model: 'TMK',           weight: 77,   diameter: 0.224, bcG1: 0.420 },
  { mfr: 'Hornady', model: 'ELD-M',         weight: 80,   diameter: 0.224, bcG1: 0.485, bcG7: 0.244 },
  { mfr: 'Berger',  model: 'LRHT',          weight: 85.5, diameter: 0.224, bcG1: 0.524, bcG7: 0.268 },
  { mfr: 'Hornady', model: 'ELD-M',         weight: 88,   diameter: 0.224, bcG1: 0.545, bcG7: 0.274 },
  { mfr: 'Sierra',  model: 'MatchKing',     weight: 90,   diameter: 0.224, bcG1: 0.563 },
  { mfr: 'Berger',  model: 'VLD Target',    weight: 90,   diameter: 0.224, bcG1: 0.534, bcG7: 0.274 },

  // ── .243" · 6mm ──
  { mfr: 'Hornady', model: 'V-MAX',         weight: 65,   diameter: 0.243, bcG1: 0.280 },
  { mfr: 'Hornady', model: 'ELD-X',         weight: 90,   diameter: 0.243, bcG1: 0.409, bcG7: 0.206 },
  { mfr: 'Berger',  model: 'Classic Hunter', weight: 95,  diameter: 0.243, bcG1: 0.434, bcG7: 0.223 },
  { mfr: 'Sierra',  model: 'TMK',           weight: 95,   diameter: 0.243, bcG1: 0.500 },
  { mfr: 'Sierra',  model: 'GameKing',      weight: 100,  diameter: 0.243, bcG1: 0.430 },
  { mfr: 'Hornady', model: 'ELD-X',         weight: 103,  diameter: 0.243, bcG1: 0.512, bcG7: 0.258 },
  { mfr: 'Berger',  model: 'Hybrid Target', weight: 105,  diameter: 0.243, bcG1: 0.536, bcG7: 0.275 },
  { mfr: 'Berger',  model: 'VLD Hunting',   weight: 105,  diameter: 0.243, bcG1: 0.545, bcG7: 0.278 },
  { mfr: 'Sierra',  model: 'MatchKing',     weight: 107,  diameter: 0.243, bcG1: 0.547 },
  { mfr: 'Hornady', model: 'ELD-M',         weight: 108,  diameter: 0.243, bcG1: 0.536, bcG7: 0.270 },
  { mfr: 'Berger',  model: 'LRHT',          weight: 109,  diameter: 0.243, bcG1: 0.568, bcG7: 0.292 },
  { mfr: 'Berger',  model: 'VLD Target',    weight: 115,  diameter: 0.243, bcG1: 0.563, bcG7: 0.289 },

  // ── .257" · 25 cal (incl. 25 Creedmoor) ──
  { mfr: 'Sierra',  model: 'GameKing',      weight: 100,  diameter: 0.257, bcG1: 0.355 },
  { mfr: 'Sierra',  model: 'GameChanger',   weight: 110,  diameter: 0.257, bcG1: 0.447 },
  { mfr: 'Hornady', model: 'ELD-X',         weight: 110,  diameter: 0.257, bcG1: 0.465, bcG7: 0.234 },
  { mfr: 'Berger',  model: 'VLD Hunting',   weight: 115,  diameter: 0.257, bcG1: 0.483, bcG7: 0.247 },
  { mfr: 'Sierra',  model: 'GameKing',      weight: 117,  diameter: 0.257, bcG1: 0.410 },
  { mfr: 'Hornady', model: 'SST',           weight: 117,  diameter: 0.257, bcG1: 0.390 },
  { mfr: 'Hornady', model: 'ELD-X',         weight: 128,  diameter: 0.257, bcG1: 0.598, bcG7: 0.313 },
  { mfr: 'Berger',  model: 'LRHT',          weight: 135,  diameter: 0.257, bcG1: 0.650, bcG7: 0.334 },

  // ── .264" · 6.5mm ──
  { mfr: 'Hornady', model: 'ELD-M',         weight: 123,  diameter: 0.264, bcG1: 0.506, bcG7: 0.255 },
  { mfr: 'Sierra',  model: 'GameChanger',   weight: 130,  diameter: 0.264, bcG1: 0.510 },
  { mfr: 'Berger',  model: 'VLD Target',    weight: 130,  diameter: 0.264, bcG1: 0.562, bcG7: 0.288 },
  { mfr: 'Hornady', model: 'ELD-M',         weight: 140,  diameter: 0.264, bcG1: 0.646, bcG7: 0.326 },
  { mfr: 'Sierra',  model: 'GameChanger',   weight: 140,  diameter: 0.264, bcG1: 0.563 },
  { mfr: 'Berger',  model: 'Hybrid Target', weight: 140,  diameter: 0.264, bcG1: 0.607, bcG7: 0.311 },
  { mfr: 'Sierra',  model: 'MatchKing',     weight: 142,  diameter: 0.264, bcG1: 0.595 },
  { mfr: 'Hornady', model: 'ELD-X',         weight: 143,  diameter: 0.264, bcG1: 0.625, bcG7: 0.315 },
  { mfr: 'Berger',  model: 'LRHT',          weight: 144,  diameter: 0.264, bcG1: 0.655, bcG7: 0.336 },
  { mfr: 'Hornady', model: 'ELD-M',         weight: 147,  diameter: 0.264, bcG1: 0.697, bcG7: 0.351 },
  { mfr: 'Hornady', model: 'A-Tip',         weight: 153,  diameter: 0.264, bcG1: 0.704, bcG7: 0.355 },
  { mfr: 'Berger',  model: 'LRHT',          weight: 153.5, diameter: 0.264, bcG1: 0.694, bcG7: 0.356 },
];

// ── diameter grouping + caliber → diameter mapping ────────────────────────────
export const diameterLabel = (d: number): string => ({
  0.224: '22 cal · .224"',
  0.243: '6mm · .243"',
  0.257: '25 cal · .257"',
  0.264: '6.5mm · .264"',
}[d] || `.${Math.round(d * 1000)}"`);

// unique diameters present in the library, ascending
export const bulletDiameters = (): number[] =>
  [...new Set(BULLETS.map(b => b.diameter))].sort((a, b) => a - b);

export const bulletsForDiameter = (d: number): Bullet[] =>
  BULLETS.filter(b => b.diameter === d).sort((a, b) => a.weight - b.weight);

// cartridge-number → bullet diameter (for guessing the group from a caliber string)
const NUM_TO_DIA: Record<string, number> = {
  '22': 0.224, '220': 0.224, '222': 0.224, '223': 0.224, '224': 0.224,
  '6': 0.243, '243': 0.243, '244': 0.243,
  '25': 0.257, '257': 0.257,
  '6.5': 0.264, '65': 0.264, '260': 0.264, '264': 0.264,
};

// best-guess diameter for a free-text caliber like "25CM", "22 Creedmoor", ".257".
// Only returns a diameter that actually has bullets in the library.
export const suggestDiameter = (caliber: string): number | null => {
  const has = (d: number | null | undefined) =>
    d != null && bulletDiameters().some(k => Math.abs(k - d) < 0.0005) ? d : null;

  const s = (caliber || '').toLowerCase();
  const dia = s.match(/0?\.(\d{3})/);
  if (dia) {
    const d = parseFloat('0.' + dia[1]);
    const known = bulletDiameters().find(k => Math.abs(k - d) < 0.002);
    if (known) return known;
  }
  const re = /(\d+\.?\d*)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > 0 && s[m.index - 1] === '.') continue;
    const hit = has(NUM_TO_DIA[m[1]]);
    if (hit) return hit;
  }
  return null;
};
