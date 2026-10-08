import type { TrajectoryRow } from './solver';

// linear interpolation within a 10-yd trajectory table
export function lookup(rows: TrajectoryRow[], r: number): TrajectoryRow | null {
  const i = rows.findIndex(x => x.rangeYd >= r);
  if (i < 0) return null;
  if (i === 0 || rows[i].rangeYd === r) return rows[i];
  const a = rows[i - 1], b = rows[i], t = (r - a.rangeYd) / (b.rangeYd - a.rangeYd);
  const L = (x: number, y: number) => x + t * (y - x);
  return {
    ...b, rangeYd: r, dropIn: L(a.dropIn, b.dropIn), elevMil: L(a.elevMil, b.elevMil), elevMoa: L(a.elevMoa, b.elevMoa),
    windIn: L(a.windIn, b.windIn), windMil: L(a.windMil, b.windMil), windMoa: L(a.windMoa, b.windMoa),
    velocityFps: L(a.velocityFps, b.velocityFps), mach: L(a.mach, b.mach), energyFtLb: L(a.energyFtLb, b.energyFtLb),
    tofS: L(a.tofS, b.tofS), spinDriftIn: L(a.spinDriftIn, b.spinDriftIn),
  };
}
