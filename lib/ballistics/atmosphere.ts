// Air density and speed of sound from the conditions a Kestrel (or the
// phone's barometer + a weather source) reports. Pressure is STATION pressure
// (what the air actually is where you stand), not the sea-level-corrected
// barometric pressure a weather report shows.

export type Atmosphere = {
  tempF: number;
  pressureInHg: number; // station (absolute) pressure
  humidity: number;     // relative humidity, 0–100
};

const INHG_TO_PA = 3386.389;
const KG_M3_TO_LB_FT3 = 0.0624279606;
const LAPSE_R_PER_FT = -0.00356616;   // standard lapse rate, °R per ft
const PRESSURE_EXP = 5.255876;        // g·M / (R·L)

export const STANDARD: Atmosphere = { tempF: 59, pressureInHg: 29.92126, humidity: 0 };

// Saturation vapor pressure over water, Pa (Arden Buck, 1996).
function saturationVaporPa(tempC: number): number {
  return 611.21 * Math.exp((18.678 - tempC / 234.5) * (tempC / (257.14 + tempC)));
}

// Humid-air density in lb/ft³ (ideal-gas mix of dry air + water vapor).
export function airDensity(a: Atmosphere): number {
  const tC = (a.tempF - 32) * 5 / 9;
  const tK = tC + 273.15;
  const p = a.pressureInHg * INHG_TO_PA;
  const pv = Math.min(Math.max(a.humidity, 0), 100) / 100 * saturationVaporPa(tC);
  const pd = p - pv;
  const rho = pd / (287.058 * tK) + pv / (461.495 * tK);
  return rho * KG_M3_TO_LB_FT3;
}

export const STANDARD_DENSITY = airDensity(STANDARD); // ≈ 0.076474 lb/ft³ (ICAO)

export const densityRatio = (a: Atmosphere) => airDensity(a) / STANDARD_DENSITY;

export const speedOfSound = (tempF: number) => 49.0223 * Math.sqrt(tempF + 459.67);

// Standard-atmosphere station pressure at an elevation — a fallback when no
// barometer reading is available.
export const pressureAtAltitude = (altitudeFt: number) =>
  29.92126 * Math.pow(1 - 6.8755856e-6 * altitudeFt, PRESSURE_EXP);

// Density altitude in feet (includes humidity, like a Kestrel).
export function densityAltitude(a: Atmosphere): number {
  const sigma = densityRatio(a);
  return (1 - Math.pow(sigma, 1 / (PRESSURE_EXP - 1))) / 6.8755856e-6;
}

// Shift density ratio and speed of sound for a height change during flight
// (matters for steep up/downhill shots).
export function atHeight(baseTempF: number, baseDensityRatio: number, dhFt: number) {
  const t0 = baseTempF + 459.67;
  const t = t0 + LAPSE_R_PER_FT * dhFt;
  const ratio = t / t0;
  return {
    densityRatio: baseDensityRatio * Math.pow(ratio, PRESSURE_EXP - 1),
    machFps: 49.0223 * Math.sqrt(t),
  };
}
