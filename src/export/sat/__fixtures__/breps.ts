import { vec3 } from "@/domain/math/vec3";
import type { BrepEdge, BrepFace, NeutralBrep } from "@/geometry/neutral-brep";
import { boxBrep } from "@/geometry/neutral-brep-box";

/**
 * B-rep costruite a mano per i test del writer SAT (senza WASM), con le
 * stesse convenzioni dell'estrazione OCCT (7.4).
 */

/**
 * Parallelepipedo 0..100 × 0..100 × 0..50 con foro passante verticale Ø20 in
 * (50, 50): come l'estrazione OCCT, 1 faccia cilindrica `reversed` con un solo
 * loop `cerchio inferiore⁻¹, cucitura, cerchio superiore, cucitura⁻¹`, e i
 * loop interni (orari visti dall'esterno) sulle facce inferiore e superiore.
 */
export function holeBoxBrep(): NeutralBrep {
  const box = boxBrep(vec3(0, 0, 0), vec3(100, 100, 50));
  const r = 10;
  const vertices = [...box.vertices, { point: vec3(60, 50, 0) }, { point: vec3(60, 50, 50) }];
  const circle = (z: number, v: number): BrepEdge => ({
    kind: "cerchio",
    start: v,
    end: v,
    t0: 0,
    t1: 2 * Math.PI,
    seam: false,
    center: vec3(50, 50, z),
    axis: vec3(0, 0, 1),
    xAxis: vec3(1, 0, 0),
    yAxis: vec3(0, 1, 0),
    radius: r,
  });
  const bottom = box.edges.length;
  const top = bottom + 1;
  const seam = bottom + 2;
  const edges: BrepEdge[] = [
    ...box.edges,
    circle(0, 8),
    circle(50, 9),
    { kind: "retta", start: 8, end: 9, t0: 0, t1: 50, seam: true, origin: vec3(60, 50, 0), direction: vec3(0, 0, 1) },
  ];
  const faces: BrepFace[] = box.faces.map((f) => {
    if (f.kind !== "piana" || f.normal.z === 0) return f;
    // inferiore (normale −Z): orario visto da sotto = antiorario attorno a +Z = cerchio in avanti
    const inner = f.normal.z < 0 ? { edge: bottom, sense: "forward" as const } : { edge: top, sense: "reversed" as const };
    return { ...f, loops: [...f.loops, { coedges: [inner] }] };
  });
  faces.push({
    kind: "cilindrica",
    sense: "reversed",
    origin: vec3(50, 50, 0),
    axis: vec3(0, 0, 1),
    xAxis: vec3(1, 0, 0),
    radius: r,
    loops: [
      {
        coedges: [
          { edge: bottom, sense: "reversed" },
          { edge: seam, sense: "forward" },
          { edge: top, sense: "forward" },
          { edge: seam, sense: "reversed" },
        ],
      },
    ],
  });
  return { vertices, edges, faces };
}

/** Parallelepipedo con una faccia di tipo non supportato (es. B-spline). */
export function boxWithOtherFace(surfaceType = "GeomAbs_BSplineSurface"): NeutralBrep {
  const box = boxBrep(vec3(0, 0, 0), vec3(100, 100, 50));
  const faces: BrepFace[] = box.faces.map((f, i) =>
    i === 0 ? { kind: "altro", surfaceType, sense: f.sense, loops: f.loops } : f,
  );
  return { ...box, faces };
}
