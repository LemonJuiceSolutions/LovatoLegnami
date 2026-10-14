import { type Mat4, fromBasis } from "./mat4";
import { type Vec3, vec3 } from "./vec3";

/**
 * Geometria dell'asse curvo dei pezzi (E1): arco di raggio `radius` nel piano
 * locale X–Z, che parte dall'origine tangente a +X e curva verso +Z, con
 * centro di curvatura in `(0, 0, radius)`. `s` è la coordinata curvilinea
 * lungo l'asse (mm, 0..sviluppo), `θ = s / radius`.
 */

/** Sviluppo dell'asse: `radius · sweep(rad)` (sweep in gradi). */
export const arcLength = (radius: number, sweepDeg: number): number => (radius * sweepDeg * Math.PI) / 180;

/** Punto dell'asse alla coordinata curvilinea `s`: `(R sin θ, 0, R (1 − cos θ))`. */
export function arcPoint(radius: number, s: number): Vec3 {
  const t = s / radius;
  return vec3(radius * Math.sin(t), 0, radius * (1 - Math.cos(t)));
}

/** Tangente unitaria (verso di `s` crescente): `(cos θ, 0, sin θ)`. */
export function arcTangent(radius: number, s: number): Vec3 {
  const t = s / radius;
  return vec3(Math.cos(t), 0, Math.sin(t));
}

/**
 * Normale radiale unitaria verso il centro di curvatura: `(−sin θ, 0, cos θ)`.
 * È la direzione dell'asse Z locale della sezione in `s` (in `s = 0` coincide con +Z).
 */
export function arcNormal(radius: number, s: number): Vec3 {
  const t = s / radius;
  return vec3(-Math.sin(t), 0, Math.cos(t));
}

/**
 * Sistema locale della sezione in `s`: origine sull'asse, X = tangente,
 * Y = +Y del pezzo, Z = normale radiale verso il centro (posa rigida rispetto
 * al sistema del pezzo). In `s = 0` è l'identità.
 */
export const arcFrame = (radius: number, s: number): Mat4 =>
  fromBasis(arcPoint(radius, s), arcTangent(radius, s), arcNormal(radius, s));

export interface ArcSegment {
  /** Coordinata curvilinea iniziale e finale (mm). */
  readonly from: number;
  readonly to: number;
  /** Punti dell'asse alle due estremità. */
  readonly start: Vec3;
  readonly end: Vec3;
}

/**
 * Divide l'arco in `ceil(sweep / maxStepDeg)` segmenti uguali (almeno 1), ognuno
 * di ampiezza ≤ `maxStepDeg` gradi.
 */
export function arcSegments(radius: number, sweepDeg: number, maxStepDeg = 15): ArcSegment[] {
  if (!(maxStepDeg > 0)) throw new Error(`passo angolare non valido: ${maxStepDeg}`);
  const n = Math.max(1, Math.ceil(sweepDeg / maxStepDeg - 1e-9));
  const total = arcLength(radius, sweepDeg);
  const out: ArcSegment[] = [];
  for (let i = 0; i < n; i++) {
    const from = (total * i) / n;
    const to = (total * (i + 1)) / n;
    out.push({ from, to, start: arcPoint(radius, from), end: arcPoint(radius, to) });
  }
  return out;
}
