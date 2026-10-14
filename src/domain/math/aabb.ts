import { EPS, type Vec3, sub, vec3 } from "./vec3";

/** Box allineato agli assi del sistema assieme (mm). */
export interface AABB {
  readonly min: Vec3;
  readonly max: Vec3;
}

export const aabb = (min: Vec3, max: Vec3): AABB => ({ min, max });

export function aabbFromPoints(points: readonly Vec3[]): AABB {
  if (points.length === 0) throw new Error("aabbFromPoints: nessun punto");
  let [x0, y0, z0] = [Infinity, Infinity, Infinity];
  let [x1, y1, z1] = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    z0 = Math.min(z0, p.z);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
    z1 = Math.max(z1, p.z);
  }
  return aabb(vec3(x0, y0, z0), vec3(x1, y1, z1));
}

export const aabbSize = (b: AABB): Vec3 => sub(b.max, b.min);

export const aabbCenter = (b: AABB): Vec3 =>
  vec3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);

export const aabbUnion = (a: AABB, b: AABB): AABB =>
  aabb(
    vec3(Math.min(a.min.x, b.min.x), Math.min(a.min.y, b.min.y), Math.min(a.min.z, b.min.z)),
    vec3(Math.max(a.max.x, b.max.x), Math.max(a.max.y, b.max.y), Math.max(a.max.z, b.max.z)),
  );

/** Il punto è dentro il box (bordo incluso) entro `tol`. */
export const containsPoint = (b: AABB, p: Vec3, tol: number = EPS): boolean =>
  p.x >= b.min.x - tol &&
  p.x <= b.max.x + tol &&
  p.y >= b.min.y - tol &&
  p.y <= b.max.y + tol &&
  p.z >= b.min.z - tol &&
  p.z <= b.max.z + tol;

/** `inner` è interamente contenuto in `outer` entro `tol`. */
export const containsBox = (outer: AABB, inner: AABB, tol: number = EPS): boolean =>
  containsPoint(outer, inner.min, tol) && containsPoint(outer, inner.max, tol);

const AXES = ["x", "y", "z"] as const;

/**
 * Profondità di penetrazione: la minima sovrapposizione tra i tre assi.
 * > 0 compenetrazione, 0 contatto, < 0 separazione (−distanza sull'asse
 * più separato).
 */
export function aabbPenetrationDepth(a: AABB, b: AABB): number {
  let depth = Infinity;
  for (const k of AXES) {
    const overlap = Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]);
    depth = Math.min(depth, overlap);
  }
  return depth;
}

/** Compenetrazione stretta: il semplice contatto (profondità ≤ tol) non conta. */
export const aabbIntersects = (a: AABB, b: AABB, tol: number = EPS): boolean =>
  aabbPenetrationDepth(a, b) > tol;

/** Box di intersezione, o `null` se i box non si compenetrano. */
export function aabbIntersection(a: AABB, b: AABB, tol: number = EPS): AABB | null {
  if (!aabbIntersects(a, b, tol)) return null;
  return aabb(
    vec3(Math.max(a.min.x, b.min.x), Math.max(a.min.y, b.min.y), Math.max(a.min.z, b.min.z)),
    vec3(Math.min(a.max.x, b.max.x), Math.min(a.max.y, b.max.y), Math.min(a.max.z, b.max.z)),
  );
}
