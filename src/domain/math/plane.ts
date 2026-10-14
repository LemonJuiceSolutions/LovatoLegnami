import { type Mat4, applyToPoint, applyToVector } from "./mat4";
import { type Vec3, add, cross, dot, norm, scale, sub } from "./vec3";

/** Piano per un punto con normale unitaria (verso significativo per la distanza con segno). */
export interface Plane {
  readonly point: Vec3;
  readonly normal: Vec3;
}

/** Errore geometrico: piano degenere o retta parallela al piano. */
export class GeometryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeometryError";
  }
}

/** Piano da punto e normale qualsiasi (normalizzata); errore se la normale è nulla. */
export function plane(point: Vec3, normal: Vec3): Plane {
  const n = norm(normal);
  if (n < 1e-12) throw new GeometryError("piano con normale nulla");
  return { point, normal: scale(normal, 1 / n) };
}

/**
 * Piano per tre punti; la normale segue la regola della mano destra
 * `(b − a) × (c − a)`. Errore se i punti sono allineati.
 */
export function planeFromPoints(a: Vec3, b: Vec3, c: Vec3): Plane {
  const n = cross(sub(b, a), sub(c, a));
  if (norm(n) < 1e-9) throw new GeometryError("piano per tre punti allineati o coincidenti");
  return plane(a, n);
}

/** Distanza con segno di `p` dal piano (positiva dal lato della normale). */
export const signedDistance = (pl: Plane, p: Vec3): number => dot(pl.normal, sub(p, pl.point));

export interface LinePlaneHit {
  /** Punto d'intersezione. */
  readonly point: Vec3;
  /** Parametro sulla retta: `point = origin + t·direction`. */
  readonly t: number;
}

/**
 * Intersezione della retta `origin + t·direction` con il piano. Errore se la
 * retta è parallela al piano (|n·d| < 1e-9·|d|).
 */
export function intersectLinePlane(origin: Vec3, direction: Vec3, pl: Plane): LinePlaneHit {
  const denom = dot(pl.normal, direction);
  if (Math.abs(denom) < 1e-9 * Math.max(1, norm(direction)))
    throw new GeometryError("retta parallela al piano: nessuna intersezione");
  const t = -signedDistance(pl, origin) / denom;
  return { point: add(origin, scale(direction, t)), t };
}

/** Piano trasformato da una trasformazione rigida `m` (punto e normale). */
export const transformPlane = (m: Mat4, pl: Plane): Plane => plane(applyToPoint(m, pl.point), applyToVector(m, pl.normal));
