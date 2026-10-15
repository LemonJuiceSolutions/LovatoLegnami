import { arcPoint, arcTangent } from "@/domain/math/arc";
import { add, scale, vec3, type Vec3 } from "@/domain/math/vec3";
import type {
  BrepCircleEdge,
  BrepCoedge,
  BrepCylinderFace,
  BrepEdge,
  BrepFace,
  BrepLineEdge,
  BrepPlaneFace,
  BrepVertex,
  NeutralBrep,
} from "./neutral-brep";

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

/**
 * B-rep neutra di un pezzo curvo (E1/E6) in TS puro: settore anulare ottenuto
 * dalla rivoluzione della sezione `b×h` (Y ∈ ±b/2, radiale ±h/2) attorno
 * all'asse ∥ Y per `(0, 0, radius)`, di `sweep` gradi, con l'asse del pezzo
 * che parte in origine tangente a +X e curva verso +Z (come `makeBaseArc` del
 * kernel). 8 vertici; 12 spigoli: 4 `cerchio` (archi di intradosso ed
 * estradosso sulle due facce laterali, centro sull'asse, `axis` = −Y,
 * `xAxis` = −Z così che `t` vada da 0 a `sweep` in radianti) e 8 `retta` (4
 * per testa); 6 facce: 2 `cilindrica` (estradosso `forward`, intradosso
 * `reversed`: normale esterna verso l'asse), 2 piane laterali e 2 piane di
 * testa. Convenzioni di `neutral-brep.ts` (loop antiorari visti dall'esterno).
 * Serve ai test del writer SAT sui curvi senza WASM.
 */
export function arcBrep(section: { b: number; h: number }, radius: number, sweep: number): NeutralBrep {
  const { b, h } = section;
  const theta = (sweep * Math.PI) / 180;
  const length = radius * theta;
  const center = vec3(0, 0, radius);
  const radii = [radius - h / 2, radius + h / 2]; // k = 0 intradosso, k = 1 estradosso
  const ys = [-b / 2, b / 2]; // j
  /** Direzione radiale uscente dal centro all'angolo φ: (sin φ, 0, −cos φ). */
  const radial = (phi: number): Vec3 => vec3(Math.sin(phi), 0, -Math.cos(phi));
  const vid = (i: number, j: number, k: number): number => i * 4 + j * 2 + k; // i = testa (0 piede, 1 fine)
  const vertices: BrepVertex[] = [];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++)
      for (let k = 0; k < 2; k++)
        vertices.push({ point: add(vec3(0, ys[j], radius), scale(radial(i * theta), radii[k])) });

  const edges: BrepEdge[] = [];
  const edgeIndex = new Map<string, number>();
  const addEdge = (from: number, to: number, e: BrepEdge) => {
    edgeIndex.set(`${from}-${to}`, edges.length);
    edges.push(e);
  };
  const axis = vec3(0, -1, 0);
  const xAxis = vec3(0, 0, -1);
  // Cerchi: dal piede alla testa finale.
  for (let j = 0; j < 2; j++)
    for (let k = 0; k < 2; k++) {
      const circle: BrepCircleEdge = {
        kind: "cerchio",
        start: vid(0, j, k),
        end: vid(1, j, k),
        center: vec3(0, ys[j], radius),
        axis,
        xAxis,
        yAxis: vec3(1, 0, 0), // = axis × xAxis
        radius: radii[k],
        t0: 0,
        t1: theta,
        seam: false,
      };
      addEdge(circle.start, circle.end, circle);
    }
  const line = (from: number, to: number) => {
    const p = vertices[from].point;
    const q = vertices[to].point;
    const d = vec3(q.x - p.x, q.y - p.y, q.z - p.z);
    const len = Math.hypot(d.x, d.y, d.z);
    const e: BrepLineEdge = { kind: "retta", start: from, end: to, origin: p, direction: scale(d, 1 / len), t0: 0, t1: len, seam: false };
    addEdge(from, to, e);
  };
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) line(vid(i, j, 0), vid(i, j, 1)); // radiali
    for (let k = 0; k < 2; k++) line(vid(i, 0, k), vid(i, 1, k)); // lungo Y
  }

  const coedge = (from: number, to: number): BrepCoedge => {
    const fwd = edgeIndex.get(`${from}-${to}`);
    if (fwd !== undefined) return { edge: fwd, sense: "forward" };
    return { edge: edgeIndex.get(`${to}-${from}`)!, sense: "reversed" };
  };
  const loop = (ring: number[]) => [{ coedges: ring.map((from, n) => coedge(from, ring[(n + 1) % ring.length])) }];

  const plane = (ring: number[], origin: Vec3, normal: Vec3, x: Vec3): BrepPlaneFace => ({
    kind: "piana",
    sense: "forward",
    origin,
    normal,
    xAxis: x,
    loops: loop(ring),
  });
  const cylinder = (ring: number[], k: number): BrepCylinderFace => ({
    kind: "cilindrica",
    sense: k === 1 ? "forward" : "reversed",
    origin: center,
    axis,
    xAxis,
    radius: radii[k],
    loops: loop(ring),
  });

  const Y = vec3(0, 1, 0);
  const tEnd = arcTangent(radius, length);
  // Anelli (i, j, k) antiorari attorno alla normale esterna: sistema della
  // sezione (tangente, Y, verso il centro) destrorso, con l'intradosso (k = 0) dal lato +Z.
  const faces: BrepFace[] = [
    plane([vid(0, 0, 1), vid(0, 0, 0), vid(0, 1, 0), vid(0, 1, 1)], vec3(0, 0, 0), vec3(-1, 0, 0), Y),
    plane([vid(1, 0, 1), vid(1, 1, 1), vid(1, 1, 0), vid(1, 0, 0)], arcPoint(radius, length), tEnd, Y),
    plane([vid(0, 1, 1), vid(0, 1, 0), vid(1, 1, 0), vid(1, 1, 1)], vec3(0, b / 2, radius), Y, xAxis),
    plane([vid(0, 0, 1), vid(1, 0, 1), vid(1, 0, 0), vid(0, 0, 0)], vec3(0, -b / 2, radius), vec3(0, -1, 0), xAxis),
    cylinder([vid(0, 0, 1), vid(0, 1, 1), vid(1, 1, 1), vid(1, 0, 1)], 1),
    cylinder([vid(0, 0, 0), vid(1, 0, 0), vid(1, 1, 0), vid(0, 1, 0)], 0),
  ];
  return { vertices, edges, faces };
}

