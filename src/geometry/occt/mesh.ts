import type { Shape3D } from "replicad";
import type { PieceMesh } from "../protocol";

/** Tolleranze di tessellazione di default (spec: 0,5 mm). */
export const DEFAULT_MESH_TOLERANCE = 0.5;
export const DEFAULT_ANGULAR_TOLERANCE = 0.3;

export interface MeshOptions {
  readonly tolerance?: number;
  readonly angularTolerance?: number;
}

/** Area minima (mm²) sotto la quale un triangolo è considerato degenere e scartato. */
const MIN_AREA = 1e-9;

/**
 * Tessella il solido (sistema locale) in `positions`/`normals`/`indices` per il
 * viewer. I triangoli degeneri (area ≈ 0, indici ripetuti) sono scartati e gli
 * indici riferiscono sempre vertici esistenti.
 */
export function meshShape(shape: Shape3D, options: MeshOptions = {}): PieceMesh {
  const raw = shape.mesh({
    tolerance: options.tolerance ?? DEFAULT_MESH_TOLERANCE,
    angularTolerance: options.angularTolerance ?? DEFAULT_ANGULAR_TOLERANCE,
  });
  const positions = Float32Array.from(raw.vertices);
  const normals = Float32Array.from(raw.normals);
  const vertexCount = positions.length / 3;
  const tri = raw.triangles;
  const kept: number[] = [];
  for (let i = 0; i + 2 < tri.length; i += 3) {
    const a = tri[i];
    const b = tri[i + 1];
    const c = tri[i + 2];
    if (a === b || b === c || a === c) continue;
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount || a < 0 || b < 0 || c < 0) continue;
    if (triangleArea(positions, a, b, c) <= MIN_AREA) continue;
    kept.push(a, b, c);
  }
  return { positions, normals, indices: Uint32Array.from(kept) };
}

export function triangleArea(p: ArrayLike<number>, a: number, b: number, c: number): number {
  const ux = p[3 * b] - p[3 * a];
  const uy = p[3 * b + 1] - p[3 * a + 1];
  const uz = p[3 * b + 2] - p[3 * a + 2];
  const vx = p[3 * c] - p[3 * a];
  const vy = p[3 * c + 1] - p[3 * a + 1];
  const vz = p[3 * c + 2] - p[3 * a + 2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}
