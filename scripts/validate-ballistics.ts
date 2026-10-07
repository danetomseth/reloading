// Regression check for the ballistics engine. Run after any solver change:
//   npx tsx scripts/validate-ballistics.ts
// Reference values come from py-ballisticcalc 3.0 (RK4, step x0.25), an
// independent open-source point-mass solver. Tolerances: 0.02 mil elevation,
// 1 fps velocity, 0.3 in windage. Aerodynamic jump is off here because the
// reference doesn't model it.
import { SolveInput, solve, solveAt } from '../lib/ballistics/solver';
import { solveBcFromVelocities, trueFromDrop, velocityAt } from '../lib/ballistics/truing';

type Ref = { name: string; input: SolveInput; rangeYd: number; dropIn: number; windIn: number; velocity: number };

const REFS: Ref[] = [
  {
    name: 'G7 140gr, standard air',
    input: { mv: 2710, projectile: { bc: 0.326, model: 'G7', weightGr: 140, diameterIn: 0.264, lengthIn: 1.4 },
      rifle: { sightHeightIn: 1.75, zeroYd: 100, twistIn: 8 }, conditions: { atmo: { tempF: 59, pressureInHg: 29.92, humidity: 0 } },
      options: { aeroJump: false } },
    rangeYd: 1000, dropIn: -317.2167, windIn: 7.2963, velocity: 1484.98,
  },
  {
    name: 'G1 175gr, 90°F/25.5 inHg, zeroed at sea level, 10 mph from 3:00',
    input: { mv: 2600, projectile: { bc: 0.505, model: 'G1', weightGr: 175, diameterIn: 0.308, lengthIn: 1.24 },
      rifle: { sightHeightIn: 1.5, zeroYd: 100, twistIn: 10 }, conditions: { atmo: { tempF: 90, pressureInHg: 25.5, humidity: 0 }, windMph: 10, windFromDeg: 90 },
      options: { aeroJump: false, zeroAtmo: { tempF: 59, pressureInHg: 29.92, humidity: 0 } } },
    rangeYd: 1000.0, dropIn: -359.6432, windIn: -64.4343, velocity: 1392.39,
  },
  {
    name: 'G7 147gr, 20°F, 50% RH, 15° uphill, 8 mph from 10:30',
    input: { mv: 2900, projectile: { bc: 0.3, model: 'G7', weightGr: 147, diameterIn: 0.264, lengthIn: 1.45 },
      rifle: { sightHeightIn: 2.0, zeroYd: 200, twistIn: 8 }, conditions: { atmo: { tempF: 20, pressureInHg: 26.0, humidity: 50 }, windMph: 8, windFromDeg: 315, lookAngleDeg: 15 },
      options: { aeroJump: false } },
    rangeYd: 1239.085, dropIn: -436.1999, windIn: 68.8588, velocity: 1371.52,
  },
  {
    name: 'G7 135gr, Coriolis 45°N firing east',
    input: { mv: 2750, projectile: { bc: 0.336, model: 'G7', weightGr: 135, diameterIn: 0.257, lengthIn: 1.45 },
      rifle: { sightHeightIn: 1.8, zeroYd: 100, twistIn: 7.5 }, conditions: { atmo: { tempF: 59, pressureInHg: 29.92, humidity: 0 }, latitudeDeg: 45, azimuthDeg: 90 },
      options: { aeroJump: false } },
    rangeYd: 1500.0, dropIn: -928.0079, windIn: 25.8804, velocity: 1083.51,
  },
  {
    name: 'G7 135gr, Coriolis 45°N firing north',
    input: { mv: 2750, projectile: { bc: 0.336, model: 'G7', weightGr: 135, diameterIn: 0.257, lengthIn: 1.45 },
      rifle: { sightHeightIn: 1.8, zeroYd: 100, twistIn: 7.5 }, conditions: { atmo: { tempF: 59, pressureInHg: 29.92, humidity: 0 }, latitudeDeg: 45, azimuthDeg: 0 },
      options: { aeroJump: false } },
    rangeYd: 1500.0, dropIn: -934.1762, windIn: 25.9501, velocity: 1083.51,
  },
  {
    name: 'G7 123gr, 80% RH, 1600 yd subsonic',
    input: { mv: 2650, projectile: { bc: 0.255, model: 'G7', weightGr: 123, diameterIn: 0.264, lengthIn: 1.27 },
      rifle: { sightHeightIn: 1.6, zeroYd: 100, twistIn: 8 }, conditions: { atmo: { tempF: 45, pressureInHg: 25.7, humidity: 80 } },
      options: { aeroJump: false } },
    rangeYd: 1600.0, dropIn: -1448.0375, windIn: 36.3247, velocity: 947.80,
  },
];

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures++;
};

for (const r of REFS) {
  const row = solve(r.input, [r.rangeYd]).rows[0];
  if (!row) { check(false, `${r.name}: no trajectory row`); continue; }
  const dMil = ((row.dropIn - r.dropIn) / (r.rangeYd * 36)) * 1000;
  const dv = row.velocityFps - r.velocity, dw = row.windIn - r.windIn;
  check(Math.abs(dMil) <= 0.02 && Math.abs(dv) <= 1 && Math.abs(dw) <= 0.3,
    `${r.name} @ ${r.rangeYd.toFixed(0)} yd: elevation ${dMil.toFixed(4)} mil, velocity ${dv.toFixed(2)} fps, wind ${dw.toFixed(2)} in`);
}

// Truing round trips: plant a known error, then recover it from "measured" data.
const base: SolveInput = {
  mv: 2806,
  projectile: { bc: 0.334, model: 'G7', weightGr: 135, diameterIn: 0.257 },
  rifle: { sightHeightIn: 1.75, zeroYd: 100, twistIn: 7.5 },
  conditions: { atmo: { tempF: 55, pressureInHg: 25.7, humidity: 50 } },
};

const v300 = velocityAt({ ...base, projectile: { ...base.projectile, bc: 0.32 } }, 300)!;
const bc = solveBcFromVelocities(base, 2806, v300, 300);
check(bc != null && Math.abs(bc - 0.32) < 0.0005, `BC from two chronographs: planted 0.320, recovered ${bc?.toFixed(4)}`);

const obsMv = solveAt({ ...base, mv: 2780 }, 1100)!.elevMil;
const mvRes = trueFromDrop(base, 1100, obsMv);
check(mvRes?.kind === 'mv' && Math.abs((mvRes.mvDelta ?? 0) + 26) < 0.5, `MV from drop: planted -26 fps, recovered ${mvRes?.mvDelta?.toFixed(1)}`);

const truth = { ...base, projectile: { ...base.projectile, dsf: [{ mach: 1.0, factor: 1.06 }] } };
const obsDsf = solveAt(truth, 1750)!.elevMil;
const dsfRes = trueFromDrop(base, 1750, obsDsf);
const after = dsfRes?.dsf ? solveAt({ ...base, projectile: { ...base.projectile, dsf: dsfRes.dsf } }, 1750)!.elevMil : NaN;
check(dsfRes?.kind === 'dsf' && Math.abs(after - obsDsf) < 0.005, `Transonic drag: planted +6%, fitted x${dsfRes?.node?.factor.toFixed(3)} at Mach ${dsfRes?.node?.mach.toFixed(2)}, residual ${(after - obsDsf).toFixed(4)} mil`);

if (failures) throw new Error(`${failures} check(s) failed`);
console.log('All checks passed.');
