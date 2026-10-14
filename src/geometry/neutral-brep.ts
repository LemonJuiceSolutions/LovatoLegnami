import { z } from "zod";
import { cross, dot, neg, sub, type Vec3 } from "@/domain/math/vec3";

/**
 * B-rep neutra (D6/D7): rappresentazione topologica e geometrica di un solido
 * indipendente da OCCT, consumata dal writer SAT (`src/export/sat`). È estratta
 * dalla `TopoDS_Shape` nel worker (`occt/extract-brep.ts`) oppure generata in
 * TS puro (`neutral-brep-box.ts`) per i test senza WASM.
 *
 * Convenzioni (mm, sistema locale del pezzo; la posa si applica nell'export):
 *
 * - Topologia indicizzata: `vertices[i]`, `edges[j]` e `faces[k]` sono
 *   condivisi; spigoli e facce si riferiscono ai vertici/spigoli per indice.
 *   Ogni spigolo è usato da esattamente due coedge (solido chiuso manifold).
 * - **Spigolo**: verso proprio da `start` a `end`; la curva è parametrizzata in
 *   modo che il parametro cresca da `start` (`t0`) a `end` (`t1`, `t0 < t1`).
 *   `retta`: P(t) = origin + t·direction (|direction| = 1).
 *   `cerchio`: P(t) = center + radius·(cos t·xAxis + sin t·yAxis) con
 *   yAxis = axis × xAxis (terna destrorsa); spigolo chiuso ⇒ `start === end`.
 *   `seam` = spigolo di cucitura di una superficie periodica (usato due volte,
 *   con versi opposti, dallo stesso loop della faccia cilindrica).
 * - **Superficie**: normale propria della superficie = `normal` per il piano
 *   (= xAxis × yAxis), radiale uscente dall'asse per il cilindro. `sense` della
 *   faccia: `forward` ⇒ la normale esterna del solido coincide con la normale
 *   della superficie, `reversed` ⇒ è opposta (es. foro: superficie cilindrica
 *   con normale uscente dall'asse, faccia `reversed` ⇒ normale esterna verso
 *   l'asse, cioè "verso l'interno del foro").
 * - **Loop**: coedge ordinati e concatenati (fine di uno = inizio del
 *   successivo, ciclico). Guardando la faccia dall'esterno del solido (contro
 *   la normale esterna), la faccia sta a sinistra di ogni coedge: loop esterno
 *   antiorario, loop interni (fori) orari. `loops[0]` è il loop esterno.
 *   `coedge.sense`: `forward` = percorso nel verso proprio dello spigolo.
 */

export type BrepSense = "forward" | "reversed";

export interface BrepVertex {
  readonly point: Vec3;
}

interface BrepEdgeBase {
  /** Indice del vertice iniziale (verso proprio dello spigolo). */
  readonly start: number;
  /** Indice del vertice finale (uguale a `start` per gli spigoli chiusi). */
  readonly end: number;
  /** Parametro della curva in `start`. */
  readonly t0: number;
  /** Parametro della curva in `end` (`t1 > t0`). */
  readonly t1: number;
  /** Spigolo di cucitura di una superficie periodica. */
  readonly seam: boolean;
}

export interface BrepLineEdge extends BrepEdgeBase {
  readonly kind: "retta";
  readonly origin: Vec3;
  readonly direction: Vec3;
}

export interface BrepCircleEdge extends BrepEdgeBase {
  readonly kind: "cerchio";
  readonly center: Vec3;
  /** Normale al piano del cerchio. */
  readonly axis: Vec3;
  /** Direzione di riferimento (t = 0). */
  readonly xAxis: Vec3;
  /** = axis × xAxis. */
  readonly yAxis: Vec3;
  readonly radius: number;
}

/** Curva non classificata (es. B-spline): l'export che non la supporta la segnala. */
export interface BrepOtherEdge extends BrepEdgeBase {
  readonly kind: "altro";
  /** Tipo OCCT della curva (es. `GeomAbs_BSplineCurve`). */
  readonly curveType: string;
}

export type BrepEdge = BrepLineEdge | BrepCircleEdge | BrepOtherEdge;

export interface BrepCoedge {
  readonly edge: number;
  readonly sense: BrepSense;
}

export interface BrepLoop {
  readonly coedges: readonly BrepCoedge[];
}

interface BrepFaceBase {
  readonly sense: BrepSense;
  readonly loops: readonly BrepLoop[];
}

export interface BrepPlaneFace extends BrepFaceBase {
  readonly kind: "piana";
  /** Punto del piano. */
  readonly origin: Vec3;
  /** Normale della superficie (= xAxis × yAxis). */
  readonly normal: Vec3;
  readonly xAxis: Vec3;
}

export interface BrepCylinderFace extends BrepFaceBase {
  readonly kind: "cilindrica";
  /** Punto sull'asse. */
  readonly origin: Vec3;
  /** Direzione dell'asse; la normale della superficie è radiale uscente. */
  readonly axis: Vec3;
  /** Direzione radiale di riferimento (perpendicolare all'asse). */
  readonly xAxis: Vec3;
  readonly radius: number;
}

export interface BrepOtherFace extends BrepFaceBase {
  readonly kind: "altro";
  /** Tipo OCCT della superficie (es. `GeomAbs_BSplineSurface`). */
  readonly surfaceType: string;
}

export type BrepFace = BrepPlaneFace | BrepCylinderFace | BrepOtherFace;
export type BrepFaceKind = BrepFace["kind"];
export type BrepEdgeKind = BrepEdge["kind"];

/** Un solido (un lump, una shell chiusa). */
export interface NeutralBrep {
  readonly vertices: readonly BrepVertex[];
  readonly edges: readonly BrepEdge[];
  readonly faces: readonly BrepFace[];
}

// ---------------------------------------------------------------------------
// Schemi zod (confine worker → client e test)

const num = z.number().finite();
const index = z.number().int().nonnegative();
export const Vec3Schema: z.ZodType<Vec3> = z.object({ x: num, y: num, z: num });
const SenseSchema = z.enum(["forward", "reversed"]);

const edgeBase = { start: index, end: index, t0: num, t1: num, seam: z.boolean() };
export const BrepEdgeSchema: z.ZodType<BrepEdge> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("retta"), ...edgeBase, origin: Vec3Schema, direction: Vec3Schema }),
  z.object({
    kind: z.literal("cerchio"),
    ...edgeBase,
    center: Vec3Schema,
    axis: Vec3Schema,
    xAxis: Vec3Schema,
    yAxis: Vec3Schema,
    radius: num.positive(),
  }),
  z.object({ kind: z.literal("altro"), ...edgeBase, curveType: z.string() }),
]);

const LoopSchema: z.ZodType<BrepLoop> = z.object({
  coedges: z.array(z.object({ edge: index, sense: SenseSchema })).min(1),
});
const faceBase = { sense: SenseSchema, loops: z.array(LoopSchema).min(1) };
export const BrepFaceSchema: z.ZodType<BrepFace> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("piana"), ...faceBase, origin: Vec3Schema, normal: Vec3Schema, xAxis: Vec3Schema }),
  z.object({
    kind: z.literal("cilindrica"),
    ...faceBase,
    origin: Vec3Schema,
    axis: Vec3Schema,
    xAxis: Vec3Schema,
    radius: num.positive(),
  }),
  z.object({ kind: z.literal("altro"), ...faceBase, surfaceType: z.string() }),
]);

export const NeutralBrepSchema: z.ZodType<NeutralBrep> = z
  .object({
    vertices: z.array(z.object({ point: Vec3Schema })),
    edges: z.array(BrepEdgeSchema),
    faces: z.array(BrepFaceSchema),
  })
  .superRefine((b, ctx) => {
    b.edges.forEach((e, i) => {
      for (const k of ["start", "end"] as const)
        if (e[k] >= b.vertices.length)
          ctx.addIssue({ code: "custom", path: ["edges", i, k], message: `vertice ${e[k]} inesistente` });
    });
    b.faces.forEach((f, i) =>
      f.loops.forEach((l, j) =>
        l.coedges.forEach((c, k) => {
          if (c.edge >= b.edges.length)
            ctx.addIssue({
              code: "custom",
              path: ["faces", i, "loops", j, "coedges", k, "edge"],
              message: `spigolo ${c.edge} inesistente`,
            });
        }),
      ),
    );
  });

// ---------------------------------------------------------------------------
// Utilità

/** Vertice di partenza/arrivo di un coedge (tiene conto del verso). */
export function coedgeEnds(brep: NeutralBrep, c: BrepCoedge): { from: number; to: number } {
  const e = brep.edges[c.edge];
  return c.sense === "forward" ? { from: e.start, to: e.end } : { from: e.end, to: e.start };
}

/** Normale esterna (rispetto al solido) di una faccia piana. */
export const outwardNormal = (f: BrepPlaneFace): Vec3 => (f.sense === "forward" ? f.normal : neg(f.normal));

/**
 * Per una faccia cilindrica: `true` se la normale esterna del solido punta
 * verso l'asse (superficie concava vista dal materiale, es. un foro).
 */
export const normalTowardsAxis = (f: BrepCylinderFace): boolean => f.sense === "reversed";

/** Conteggi riassuntivi (facce per tipo, spigoli per tipo, vertici, loop, coedge). */
export function brepCounts(brep: NeutralBrep) {
  const faces: Record<BrepFaceKind, number> = { piana: 0, cilindrica: 0, altro: 0 };
  const edges: Record<BrepEdgeKind, number> = { retta: 0, cerchio: 0, altro: 0 };
  let loops = 0;
  let coedges = 0;
  for (const f of brep.faces) {
    faces[f.kind]++;
    loops += f.loops.length;
    for (const l of f.loops) coedges += l.coedges.length;
  }
  for (const e of brep.edges) edges[e.kind]++;
  return { faces, edges, vertices: brep.vertices.length, loops, coedges };
}

/**
 * Verifica topologica: riferimenti validi, loop concatenati e chiusi, ogni
 * spigolo usato da esattamente 2 coedge con versi opposti. Restituisce
 * l'elenco dei problemi (vuoto = valida).
 */
export function checkBrepTopology(brep: NeutralBrep): string[] {
  const problems: string[] = [];
  const parsed = NeutralBrepSchema.safeParse(brep);
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  const uses = brep.edges.map(() => ({ forward: 0, reversed: 0 }));
  brep.faces.forEach((f, fi) =>
    f.loops.forEach((l, li) => {
      l.coedges.forEach((c, ci) => {
        uses[c.edge][c.sense]++;
        const next = l.coedges[(ci + 1) % l.coedges.length];
        if (coedgeEnds(brep, c).to !== coedgeEnds(brep, next).from)
          problems.push(`faccia ${fi}, loop ${li}: coedge ${ci} non concatenato al successivo`);
      });
    }),
  );
  uses.forEach((u, i) => {
    if (u.forward !== 1 || u.reversed !== 1)
      problems.push(`spigolo ${i}: usato ${u.forward} volte in avanti e ${u.reversed} all'indietro (atteso 1 e 1)`);
  });
  return problems;
}

/**
 * Normale di Newell del poligono dei vertici di un loop (per facce piane con
 * spigoli rettilinei): concorde con la normale esterna per i loop esterni.
 */
export function loopNewellNormal(brep: NeutralBrep, loop: BrepLoop): Vec3 {
  const pts = loop.coedges.map((c) => brep.vertices[coedgeEnds(brep, c).from].point);
  let n = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = cross(a, b);
    n = { x: n.x + c.x, y: n.y + c.y, z: n.z + c.z };
  }
  return n;
}

/** Distanza con segno di un punto dal piano di una faccia piana (lungo la normale esterna). */
export const signedDistanceToPlane = (f: BrepPlaneFace, p: Vec3): number => dot(sub(p, f.origin), outwardNormal(f));
