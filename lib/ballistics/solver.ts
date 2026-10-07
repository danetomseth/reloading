// Point-mass trajectory solver.
//
// Frame: x along the line of sight, y perpendicular to it (up), z to the
// right. The bore starts sightHeight below the line of sight and is tilted up
// by the zero angle. Gravity is rotated by the look angle, so up/down-hill
// shots are solved exactly rather than with a rifleman's-rule shortcut.
// Integration is classic RK4 on (position, velocity).

import { DragModelName, DsfPoint, makeCdFn } from './drag';
import { Atmosphere, atHeight, densityRatio, speedOfSound } from './atmosphere';

export type Projectile = {
  bc: number;
  model: DragModelName;
  weightGr: number;
  diameterIn: number;
  lengthIn?: number;      // needed for stability, spin drift and aero jump
  dsf?: DsfPoint[];       // transonic drag scale factors from truing
};

export type RifleSetup = {
  sightHeightIn: number;  // center of bore to center of scope
  zeroYd: number;
  twistIn?: number;       // inches per turn
  twistLeft?: boolean;    // default: right-hand twist
};

export type Conditions = {
  atmo: Atmosphere;
  windMph?: number;
  windFromDeg?: number;   // 0 = from the target (headwind), 90 = from the right (3 o'clock)
  lookAngleDeg?: number;  // + uphill, − downhill
  latitudeDeg?: number;   // Coriolis is applied only when latitude AND azimuth are set
  azimuthDeg?: number;    // direction of fire, degrees from true north
};

export type SolveOptions = {
  zeroAtmo?: Atmosphere;  // conditions the rifle was zeroed in (default: same as now)
  spinDrift?: boolean;    // default true
  aeroJump?: boolean;     // default true
  coriolis?: boolean;     // default true (when latitude + azimuth are given)
  dt?: number;            // integration step, s (default 0.002)
  zeroAngleRad?: number;  // skip the zero search and use this bore angle (rad)
};

export type SolveInput = {
  mv: number;             // muzzle velocity actually leaving the barrel, fps
  projectile: Projectile;
  rifle: RifleSetup;
  conditions: Conditions;
  options?: SolveOptions;
};

export type TrajectoryRow = {
  rangeYd: number;
  dropIn: number;         // path relative to line of sight (− = below)
  elevMil: number;        // elevation to dial (+ = up)
  elevMoa: number;
  windIn: number;         // lateral offset (+ = impacts right of aim)
  windMil: number;        // windage to dial (+ = dial right)
  windMoa: number;
  velocityFps: number;
  mach: number;
  energyFtLb: number;
  tofS: number;
  spinDriftIn: number;
};

export type Trajectory = {
  rows: TrajectoryRow[];
  zeroAngleMil: number;   // bore angle above line of sight
  sg: number | null;      // Miller stability factor (null if length/twist unknown)
  sgAssumed: boolean;     // true when spin drift used a default Sg
};

const G = 32.17405;          // ft/s²
const DRAG_K = 2.08551e-4;   // (π/8)·ρ₀/144: Cd·v²/BC → ft/s² at standard density
const OMEGA = 7.2921159e-5;  // Earth rotation, rad/s
const DEFAULT_SG = 1.5;
const DEFAULT_DT = 0.002;    // s — within 0.0001 mil of a 0.00025 s step out to 2000 yd
const MOA_PER_RAD = 180 * 60 / Math.PI;

type Env = {
  cd: (mach: number) => number;
  bc: number;
  tempF: number;
  rho: number;             // density ratio at the muzzle
  gx: number; gy: number;
  wx: number; wy: number; wz: number;
  ox: number; oy: number; oz: number; // Earth rotation in the shot frame
  sinA: number; cosA: number;
};

function buildEnv(input: SolveInput, c: Conditions, atmo: Atmosphere, withCoriolis: boolean): Env {
  const a = ((c.lookAngleDeg ?? 0) * Math.PI) / 180;
  const sinA = Math.sin(a), cosA = Math.cos(a);

  // wind: horizontal, rotated into the inclined frame
  const W = ((c.windMph ?? 0) * 5280) / 3600;
  const th = ((c.windFromDeg ?? 0) * Math.PI) / 180;
  const wxh = -W * Math.cos(th);
  const wz = -W * Math.sin(th);

  let ox = 0, oy = 0, oz = 0;
  if (withCoriolis && c.latitudeDeg != null && c.azimuthDeg != null) {
    const lat = (c.latitudeDeg * Math.PI) / 180;
    const az = (c.azimuthDeg * Math.PI) / 180;
    const oxh = OMEGA * Math.cos(lat) * Math.cos(az);
    const oyh = OMEGA * Math.sin(lat);
    oz = -OMEGA * Math.cos(lat) * Math.sin(az);
    ox = cosA * oxh + sinA * oyh;
    oy = -sinA * oxh + cosA * oyh;
  }

  return {
    cd: makeCdFn(input.projectile.model, input.projectile.dsf),
    bc: input.projectile.bc,
    tempF: atmo.tempF,
    rho: densityRatio(atmo),
    gx: -G * sinA, gy: -G * cosA,
    wx: wxh * cosA, wy: -wxh * sinA, wz,
    ox, oy, oz,
    sinA, cosA,
  };
}

// derivative of [x,y,z,vx,vy,vz]
function deriv(e: Env, s: number[], out: number[]) {
  const vx = s[3], vy = s[4], vz = s[5];
  const rx = vx - e.wx, ry = vy - e.wy, rz = vz - e.wz;
  const speed = Math.sqrt(rx * rx + ry * ry + rz * rz);
  const dh = s[0] * e.sinA + s[1] * e.cosA;
  const air = atHeight(e.tempF, e.rho, dh);
  const k = (DRAG_K * air.densityRatio * e.cd(speed / air.machFps)) / e.bc;
  // Coriolis: −2 Ω × v
  const cx = -2 * (e.oy * vz - e.oz * vy);
  const cy = -2 * (e.oz * vx - e.ox * vz);
  const cz = -2 * (e.ox * vy - e.oy * vx);
  out[0] = vx; out[1] = vy; out[2] = vz;
  out[3] = -k * speed * rx + e.gx + cx;
  out[4] = -k * speed * ry + e.gy + cy;
  out[5] = -k * speed * rz + cz;
}

type Sample = { x: number; y: number; z: number; v: number; t: number; mach: number };

// Integrate until x passes every requested distance (ft). Returns samples in
// the same order as `xs` (sorted ascending); stops early if the bullet stalls.
function integrate(e: Env, mv: number, angle: number, sightFt: number, xs: number[], dt: number): Sample[] {
  const s = [0, -sightFt, 0, mv * Math.cos(angle), mv * Math.sin(angle), 0];
  const k1 = new Array(6), k2 = new Array(6), k3 = new Array(6), k4 = new Array(6), tmp = new Array(6);
  const out: Sample[] = [];
  let t = 0, i = 0;
  const machAt = (st: number[]) => {
    const rx = st[3] - e.wx, ry = st[4] - e.wy, rz = st[5] - e.wz;
    const air = atHeight(e.tempF, e.rho, st[0] * e.sinA + st[1] * e.cosA);
    return Math.sqrt(rx * rx + ry * ry + rz * rz) / air.machFps;
  };
  const speedOf = (st: number[]) => Math.sqrt(st[3] * st[3] + st[4] * st[4] + st[5] * st[5]);

  while (i < xs.length && xs[i] <= 0) {
    out.push({ x: 0, y: s[1], z: 0, v: mv, t: 0, mach: machAt(s) });
    i++;
  }
  const prev = s.slice();
  while (i < xs.length) {
    for (let j = 0; j < 6; j++) prev[j] = s[j];
    deriv(e, s, k1);
    for (let j = 0; j < 6; j++) tmp[j] = s[j] + 0.5 * dt * k1[j];
    deriv(e, tmp, k2);
    for (let j = 0; j < 6; j++) tmp[j] = s[j] + 0.5 * dt * k2[j];
    deriv(e, tmp, k3);
    for (let j = 0; j < 6; j++) tmp[j] = s[j] + dt * k3[j];
    deriv(e, tmp, k4);
    for (let j = 0; j < 6; j++) s[j] += (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
    t += dt;

    while (i < xs.length && s[0] >= xs[i]) {
      const f = (xs[i] - prev[0]) / (s[0] - prev[0]);
      const lerp = (j: number) => prev[j] + f * (s[j] - prev[j]);
      const st = [xs[i], lerp(1), lerp(2), lerp(3), lerp(4), lerp(5)];
      out.push({ x: xs[i], y: st[1], z: st[2], v: speedOf(st), t: t - dt + f * dt, mach: machAt(st) });
      i++;
    }
    if (s[3] <= 50 || t > 30) break; // stalled or absurdly long flight
  }
  return out;
}

// ── stability / empirical corrections ────────────────────────────────────────

// Miller twist rule with velocity and atmosphere corrections.
export function millerSg(p: Projectile, twistIn: number, mv: number, atmo: Atmosphere): number | null {
  if (!p.lengthIn || !twistIn || !p.diameterIn || !p.weightGr) return null;
  const d = p.diameterIn;
  const t = twistIn / d;
  const l = p.lengthIn / d;
  const sg = (30 * p.weightGr) / (t * t * d * d * d * l * (1 + l * l));
  const vCorr = Math.cbrt(mv / 2800);
  const aCorr = ((atmo.tempF + 460) / 519) * (29.92 / atmo.pressureInHg);
  return sg * vCorr * aCorr;
}

// Litz empirical spin drift, inches (right for RH twist).
export const spinDriftIn = (sg: number, tofS: number) => 1.25 * (sg + 1.2) * Math.pow(tofS, 1.83);

// Litz aerodynamic jump, MOA of vertical per mph of crosswind.
export const aeroJumpMoaPerMph = (sg: number, lengthCal: number) => 0.01 * sg - 0.0024 * lengthCal + 0.032;

// ── public API ───────────────────────────────────────────────────────────────

// Bore angle (rad, relative to the line of sight) that puts the bullet on the
// line of sight at the zero distance, in the zero conditions, level ground.
export function zeroAngle(input: SolveInput): number {
  const { rifle } = input;
  const atmo = input.options?.zeroAtmo ?? input.conditions.atmo;
  const env = buildEnv(input, { atmo }, atmo, false);
  const dt = input.options?.dt ?? DEFAULT_DT;
  const xz = rifle.zeroYd * 3;
  const sight = rifle.sightHeightIn / 12;
  const yAt = (a: number) => {
    const r = integrate(env, input.mv, a, sight, [xz], dt);
    return r.length ? r[0].y : -1e9;
  };
  let a0 = Math.atan(sight / xz), a1 = a0 + 0.002;
  let y0 = yAt(a0), y1 = yAt(a1);
  for (let k = 0; k < 40 && Math.abs(y1) > 1e-7; k++) {
    const a2 = a1 - (y1 * (a1 - a0)) / (y1 - y0);
    a0 = a1; y0 = y1; a1 = a2; y1 = yAt(a1);
  }
  return a1;
}

export function solve(input: SolveInput, rangesYd: number[]): Trajectory {
  const { projectile: p, rifle, conditions: c } = input;
  const opt = input.options ?? {};
  if (!(input.mv > 0) || !(p.bc > 0) || !(rifle.zeroYd > 0)) {
    return { rows: [], zeroAngleMil: 0, sg: null, sgAssumed: false };
  }
  const dt = opt.dt ?? DEFAULT_DT;
  const angle = opt.zeroAngleRad ?? zeroAngle(input);
  const env = buildEnv(input, c, c.atmo, opt.coriolis !== false);
  const sorted = [...new Set(rangesYd)].filter(r => r >= 0).sort((a, b) => a - b);
  const samples = integrate(env, input.mv, angle, rifle.sightHeightIn / 12, sorted.map(r => r * 3), dt);

  const sgCalc = rifle.twistIn ? millerSg(p, rifle.twistIn, input.mv, c.atmo) : null;
  const sg = sgCalc ?? DEFAULT_SG;
  const twistSign = rifle.twistLeft ? -1 : 1;
  const crossFromRightMph = (c.windMph ?? 0) * Math.sin(((c.windFromDeg ?? 0) * Math.PI) / 180);
  const jumpMoa = opt.aeroJump !== false && p.lengthIn && p.diameterIn
    ? -aeroJumpMoaPerMph(sg, p.lengthIn / p.diameterIn) * crossFromRightMph * twistSign
    : 0;

  const rows: TrajectoryRow[] = samples.map((s, idx) => {
    const rangeYd = sorted[idx];
    const rIn = rangeYd * 36;
    const sd = opt.spinDrift !== false ? twistSign * spinDriftIn(sg, s.t) : 0;
    const dropIn = s.y * 12 + (jumpMoa / MOA_PER_RAD) * rIn;
    const windIn = s.z * 12 + sd;
    const elevRad = rIn > 0 ? -Math.atan(dropIn / rIn) : 0;
    const windRad = rIn > 0 ? -Math.atan(windIn / rIn) : 0;
    return {
      rangeYd,
      dropIn, windIn,
      elevMil: elevRad * 1000, elevMoa: elevRad * MOA_PER_RAD,
      windMil: windRad * 1000, windMoa: windRad * MOA_PER_RAD,
      velocityFps: s.v,
      mach: s.mach,
      energyFtLb: (p.weightGr * s.v * s.v) / 450240,
      tofS: s.t,
      spinDriftIn: sd,
    };
  });

  return { rows, zeroAngleMil: angle * 1000, sg: sgCalc, sgAssumed: sgCalc == null && opt.spinDrift !== false };
}

// convenience: one range
export const solveAt = (input: SolveInput, rangeYd: number): TrajectoryRow | null =>
  solve(input, [rangeYd]).rows[0] ?? null;

export { speedOfSound };
