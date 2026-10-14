/** Vettore/punto 3D in millimetri (sistema di riferimento D3). */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Tolleranza geometrica di default per i confronti (mm). */
export const EPS = 1e-6;

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const ZERO: Vec3 = vec3(0, 0, 0);
export const X_AXIS: Vec3 = vec3(1, 0, 0);
export const Y_AXIS: Vec3 = vec3(0, 1, 0);
export const Z_AXIS: Vec3 = vec3(0, 0, 1);

export const add = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z);

export const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);

export const scale = (a: Vec3, s: number): Vec3 => vec3(a.x * s, a.y * s, a.z * s);

export const neg = (a: Vec3): Vec3 => vec3(-a.x, -a.y, -a.z);

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

export const norm = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

export const distance = (a: Vec3, b: Vec3): number => norm(sub(a, b));

/** Versore di `a`; lancia un errore per il vettore nullo. */
export function normalize(a: Vec3): Vec3 {
  const n = norm(a);
  if (n < EPS) throw new Error("normalize: vettore nullo");
  return scale(a, 1 / n);
}

/** Uguaglianza componente per componente entro `tol`. */
export const equals = (a: Vec3, b: Vec3, tol: number = EPS): boolean =>
  Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.z - b.z) <= tol;
