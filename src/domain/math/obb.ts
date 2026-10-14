import { type AABB, aabbCenter, aabbSize } from "./aabb";
import { type Mat4, applyToPoint, axisOf } from "./mat4";
import { EPS, type Vec3, add, cross, dot, norm, scale, sub, vec3, X_AXIS, Y_AXIS, Z_AXIS } from "./vec3";

/** Box orientato: centro, tre versori ortonormali, semi-dimensioni lungo ciascun asse. */
export interface OBB {
  readonly center: Vec3;
  readonly axes: readonly [Vec3, Vec3, Vec3];
  readonly halfSize: Vec3;
}

/**
 * OBB di un parallelepipedo `size` (x = lunghezza, y = base, z = altezza)
 * definito nel sistema locale a partire da `localMin` e posizionato da `pose`.
 * Default di `localMin`: X da 0 a lunghezza, sezione centrata sull'asse X
 * (convenzione del pezzo, vedi D2).
 */
export function obbFromPose(
  pose: Mat4,
  size: Vec3,
  localMin: Vec3 = vec3(0, -size.y / 2, -size.z / 2),
): OBB {
  const localCenter = add(localMin, scale(size, 0.5));
  return {
    center: applyToPoint(pose, localCenter),
    axes: [axisOf(pose, 0), axisOf(pose, 1), axisOf(pose, 2)],
    halfSize: scale(size, 0.5),
  };
}

const halfOf = (o: OBB, i: number): number =>
  i === 0 ? o.halfSize.x : i === 1 ? o.halfSize.y : o.halfSize.z;

export function obbVertices(o: OBB): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        let p = o.center;
        p = add(p, scale(o.axes[0], sx * o.halfSize.x));
        p = add(p, scale(o.axes[1], sy * o.halfSize.y));
        p = add(p, scale(o.axes[2], sz * o.halfSize.z));
        out.push(p);
      }
  return out;
}

/**
 * Separating Axis Theorem OBB–AABB su 15 assi. Restituisce la minima
 * sovrapposizione delle proiezioni (stima della profondità di penetrazione):
 * > 0 compenetrazione, 0 contatto, < 0 separazione.
 */
export function obbAabbPenetration(o: OBB, box: AABB): number {
  const boxAxes = [X_AXIS, Y_AXIS, Z_AXIS] as const;
  const bh = scale(aabbSize(box), 0.5);
  const boxHalf = [bh.x, bh.y, bh.z];
  const d = sub(aabbCenter(box), o.center);

  const candidates: Vec3[] = [...boxAxes, ...o.axes];
  for (const a of boxAxes) for (const b of o.axes) candidates.push(cross(a, b));

  let depth = Infinity;
  for (const raw of candidates) {
    const n = norm(raw);
    if (n < EPS) continue; // assi paralleli: già coperti dagli assi delle facce
    const l = scale(raw, 1 / n);
    let rO = 0;
    for (let i = 0; i < 3; i++) rO += halfOf(o, i) * Math.abs(dot(o.axes[i], l));
    let rB = 0;
    for (let i = 0; i < 3; i++) rB += boxHalf[i] * Math.abs(dot(boxAxes[i], l));
    depth = Math.min(depth, rO + rB - Math.abs(dot(d, l)));
  }
  return depth;
}

/** Compenetrazione stretta OBB–AABB: il contatto (profondità ≤ tol) non conta. */
export const obbIntersectsAabb = (o: OBB, box: AABB, tol: number = EPS): boolean =>
  obbAabbPenetration(o, box) > tol;
