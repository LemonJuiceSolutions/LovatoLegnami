import { EPS } from "./vec3";

/** Risultato di un'interpolazione: `outside` segnala un punto estrapolato dal bordo. */
export interface InterpResult {
  readonly value: number;
  readonly outside: boolean;
}

/**
 * Valori ai 4 angoli di un rettangolo allineato agli assi:
 * `z00` in (x0,y0), `z10` in (x1,y0), `z01` in (x0,y1), `z11` in (x1,y1).
 */
export interface BilinearCorners {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly z00: number;
  readonly z10: number;
  readonly z01: number;
  readonly z11: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Interpolazione bilineare sui 4 angoli. Fuori dal rettangolo il punto viene
 * proiettato sul bordo più vicino (valore del bordo) e `outside` è `true`.
 */
export function bilinear(c: BilinearCorners, x: number, y: number): InterpResult {
  const w = c.x1 - c.x0;
  const h = c.y1 - c.y0;
  if (!(w > EPS) || !(h > EPS)) throw new Error("bilinear: rettangolo degenere (x1 ≤ x0 o y1 ≤ y0)");
  const outside = x < c.x0 - EPS || x > c.x1 + EPS || y < c.y0 - EPS || y > c.y1 + EPS;
  const u = clamp((x - c.x0) / w, 0, 1);
  const v = clamp((y - c.y0) / h, 0, 1);
  const value =
    c.z00 * (1 - u) * (1 - v) + c.z10 * u * (1 - v) + c.z01 * (1 - u) * v + c.z11 * u * v;
  return { value, outside };
}
