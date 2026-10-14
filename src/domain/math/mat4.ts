import { EPS, type Vec3, cross, vec3 } from "./vec3";

/**
 * Matrice 4×4 per trasformazioni affini, memorizzata per righe:
 * l'elemento (riga r, colonna c) è `m[r * 4 + c]`. Le trasformazioni si
 * applicano a vettori colonna: p' = M · p. Angoli in radianti.
 */
export type Mat4 = readonly number[];

export const identity = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export const translation = (t: Vec3): Mat4 => [1, 0, 0, t.x, 0, 1, 0, t.y, 0, 0, 1, t.z, 0, 0, 0, 1];

export function rotationX(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
}

export function rotationY(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
}

export function rotationZ(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * Posa rigida da origine e assi locali X e Z (versori ortogonali) espressi nel
 * sistema assieme; l'asse Y locale è Z × X (terna destrorsa).
 */
export function fromBasis(origin: Vec3, xAxis: Vec3, zAxis: Vec3): Mat4 {
  const y = cross(zAxis, xAxis);
  return [
    xAxis.x, y.x, zAxis.x, origin.x,
    xAxis.y, y.y, zAxis.y, origin.y,
    xAxis.z, y.z, zAxis.z, origin.z,
    0, 0, 0, 1,
  ];
}

/** Prodotto a · b (applica prima b, poi a). */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
      out[r * 4 + c] = s;
    }
  }
  return out;
}

export const applyToPoint = (m: Mat4, p: Vec3): Vec3 =>
  vec3(
    m[0] * p.x + m[1] * p.y + m[2] * p.z + m[3],
    m[4] * p.x + m[5] * p.y + m[6] * p.z + m[7],
    m[8] * p.x + m[9] * p.y + m[10] * p.z + m[11],
  );

/** Applica solo la parte lineare (direzioni, nessuna traslazione). */
export const applyToVector = (m: Mat4, v: Vec3): Vec3 =>
  vec3(
    m[0] * v.x + m[1] * v.y + m[2] * v.z,
    m[4] * v.x + m[5] * v.y + m[6] * v.z,
    m[8] * v.x + m[9] * v.y + m[10] * v.z,
  );

/** Inversa di una trasformazione rigida [R | t] → [Rᵀ | −Rᵀ·t]. */
export function invertRigid(m: Mat4): Mat4 {
  const [r00, r01, r02, tx, r10, r11, r12, ty, r20, r21, r22, tz] = m;
  return [
    r00, r10, r20, -(r00 * tx + r10 * ty + r20 * tz),
    r01, r11, r21, -(r01 * tx + r11 * ty + r21 * tz),
    r02, r12, r22, -(r02 * tx + r12 * ty + r22 * tz),
    0, 0, 0, 1,
  ];
}

/** Colonna `i` (0..2) della parte di rotazione: asse locale nel sistema assieme. */
export const axisOf = (m: Mat4, i: 0 | 1 | 2): Vec3 => vec3(m[i], m[4 + i], m[8 + i]);

/** Origine (traslazione) della trasformazione. */
export const originOf = (m: Mat4): Vec3 => vec3(m[3], m[7], m[11]);

export const equalsMat4 = (a: Mat4, b: Mat4, tol: number = EPS): boolean =>
  a.length === 16 && b.length === 16 && a.every((v, i) => Math.abs(v - b[i]) <= tol);

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;
