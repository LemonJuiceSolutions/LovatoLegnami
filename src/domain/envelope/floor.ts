import type { FloorHeightFn } from "../assembly/bounds";
import { type Triangulation, interpolateAt, triangulate } from "../math/delaunay";
import { bilinear } from "../math/interp";
import { vec3 } from "../math/vec3";
import type { Envelope } from "./types";

/**
 * Pavimento interpolato (D5): senza punti extra interpolazione bilineare sui
 * 4 angoli del box base; con punti extra triangolazione di Delaunay di angoli
 * + punti e interpolazione baricentrica (passa esattamente per i punti dati).
 * Fuori dal box base il punto è riportato sul bordo più vicino (estrapolazione
 * costante dal bordo) e viene segnalato un avviso.
 */

export interface FloorHeight {
  /** Quota del pavimento (mm, positiva verso l'alto). */
  readonly value: number;
  /** `true` se il punto è fuori dal box base (valore estrapolato dal bordo). */
  readonly outside: boolean;
  readonly warning?: string;
}

type FloorEnvelope = Pick<Envelope, "box" | "floor">;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const EPS = 1e-6;

/** Valutatore della quota del pavimento con la triangolazione precalcolata. */
function evaluator(e: FloorEnvelope): (x: number, y: number) => number {
  const { width: L, depth: P } = e.box;
  const c = e.floor.corners;
  if (e.floor.points.length === 0) {
    const corners = { x0: 0, y0: 0, x1: L, y1: P, z00: c.frontLeft, z10: c.frontRight, z01: c.backLeft, z11: c.backRight };
    return (x, y) => bilinear(corners, x, y).value;
  }
  const t: Triangulation = triangulate([
    vec3(0, 0, c.frontLeft),
    vec3(L, 0, c.frontRight),
    vec3(0, P, c.backLeft),
    vec3(L, P, c.backRight),
    ...e.floor.points.map((p) => vec3(p.x, p.y, p.z)),
  ]);
  return (x, y) => interpolateAt(t, x, y).value;
}

function withBoxClamp(e: FloorEnvelope, f: (x: number, y: number) => number) {
  const { width: L, depth: P } = e.box;
  return (x: number, y: number): FloorHeight => {
    const outside = x < -EPS || x > L + EPS || y < -EPS || y > P + EPS;
    const value = f(clamp(x, 0, L), clamp(y, 0, P)) + 0;
    return outside
      ? { value, outside, warning: `punto (${x}, ${y}) fuori dall'ingombro: quota del pavimento estrapolata dal bordo più vicino` }
      : { value, outside };
  };
}

/** Quota del pavimento in (x, y) con eventuale avviso fuori box. */
export function floorHeightAt(envelope: FloorEnvelope, x: number, y: number): FloorHeight {
  return withBoxClamp(envelope, evaluator(envelope))(x, y);
}

/**
 * Funzione `quotaPavimento(x, y)` per l'interprete dei template e le misure
 * (triangolazione calcolata una volta sola). `onOutside` riceve gli avvisi per
 * i punti fuori dal box base.
 */
export function floorFunction(envelope: FloorEnvelope, onOutside?: (warning: string) => void): FloorHeightFn {
  const f = withBoxClamp(envelope, evaluator(envelope));
  return (x, y) => {
    const r = f(x, y);
    if (r.warning) onOutside?.(r.warning);
    return r.value;
  };
}
