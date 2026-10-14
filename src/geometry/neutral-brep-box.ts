import { vec3, type Vec3 } from "@/domain/math/vec3";
import type { BrepCoedge, BrepLineEdge, BrepPlaneFace, BrepVertex, NeutralBrep } from "./neutral-brep";

const AXES = ["x", "y", "z"] as const;
const UNIT: readonly Vec3[] = [vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)];

/**
 * B-rep neutra di un parallelepipedo allineato agli assi, in TS puro (senza
 * WASM): 8 vertici, 12 spigoli rettilinei orientati lungo +asse, 6 facce piane
 * `forward` con normale esterna e loop antiorari visti dall'esterno. Serve ai
 * test del writer SAT e della pipeline senza kernel. Default: pezzo con
 * sezione `b×h` e lunghezza `length` nella convenzione locale del dominio.
 */
export function boxBrep(min: Vec3, max: Vec3): NeutralBrep {
  const corner = (i: number): Vec3 =>
    vec3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z);
  const vertices: BrepVertex[] = Array.from({ length: 8 }, (_, i) => ({ point: corner(i) }));

  const edges: BrepLineEdge[] = [];
  const edgeIndex = new Map<string, number>();
  for (let a = 0; a < 3; a++) {
    const bit = 1 << a;
    for (let i = 0; i < 8; i++) {
      if (i & bit) continue;
      const j = i | bit;
      const p = corner(i);
      edgeIndex.set(`${i}-${j}`, edges.length);
      edges.push({
        kind: "retta",
        start: i,
        end: j,
        origin: p,
        direction: UNIT[a],
        t0: 0,
        t1: corner(j)[AXES[a]] - p[AXES[a]],
        seam: false,
      });
    }
  }

  const coedge = (from: number, to: number): BrepCoedge => {
    const fwd = edgeIndex.get(`${from}-${to}`);
    if (fwd !== undefined) return { edge: fwd, sense: "forward" };
    return { edge: edgeIndex.get(`${to}-${from}`)!, sense: "reversed" };
  };

  const faces: BrepPlaneFace[] = [];
  for (let a = 0; a < 3; a++) {
    const bit = 1 << a;
    const u = (a + 1) % 3;
    const v = (a + 2) % 3;
    for (const high of [false, true]) {
      const base = high ? bit : 0;
      // Giro (0,0) → (1,0) → (1,1) → (0,1) nel piano (u, v), u × v = +asse a.
      const ring = [0, 1 << u, (1 << u) | (1 << v), 1 << v].map((k) => base | k);
      if (!high) ring.reverse();
      const n = high ? UNIT[a] : vec3(-UNIT[a].x, -UNIT[a].y, -UNIT[a].z);
      const c = corner(base);
      faces.push({
        kind: "piana",
        sense: "forward",
        origin: c,
        normal: n,
        xAxis: UNIT[u],
        loops: [{ coedges: ring.map((from, k) => coedge(from, ring[(k + 1) % 4])) }],
      });
    }
  }
  return { vertices, edges, faces };
}

/** Parallelepipedo del pezzo `b×h×length` nella convenzione locale (X 0..L, sezione centrata). */
export const pieceBoxBrep = (section: { b: number; h: number }, length: number): NeutralBrep =>
  boxBrep(vec3(0, -section.b / 2, -section.h / 2), vec3(length, section.b / 2, section.h / 2));
