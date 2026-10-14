import type { Shape3D } from "replicad";
import type { OpenCascadeInstance, TopoDS_Edge, TopoDS_Face, TopoDS_Shape, TopoDS_Vertex } from "replicad-opencascadejs";
import { cross, distance, scale, sub, vec3, type Vec3 } from "@/domain/math/vec3";
import type {
  BrepCoedge,
  BrepEdge,
  BrepFace,
  BrepLoop,
  BrepSense,
  BrepVertex,
  NeutralBrep,
} from "../neutral-brep";
import { occt } from "./init";

/**
 * Estrazione della B-rep neutra (`neutral-brep.ts`) da un solido OCCT:
 * TopExp_Explorer faccia → wire → spigolo → vertice, con spigoli e vertici
 * condivisi (hash + `IsSame`), classificazione della superficie
 * (`BRepAdaptor_Surface`: Plane/Cylinder, il resto `altro`) e della curva
 * (`BRepAdaptor_Curve`: Line/Circle, il resto `altro`), orientamenti dalle
 * `Orientation()` composte dall'esploratore.
 */

const HASH_MAX = 2147483647;

interface Deletable {
  delete(): void;
}

/** Raccoglie oggetti OCCT temporanei da liberare a fine estrazione. */
class Scope {
  private readonly items: Deletable[] = [];
  track<T extends Deletable>(o: T): T {
    this.items.push(o);
    return o;
  }
  dispose(): void {
    for (const o of this.items.reverse()) {
      try {
        o.delete();
      } catch {
        // già liberato
      }
    }
  }
}

/** Mappa indicizzata di sotto-forme (equivalente di TopTools_IndexedMapOfShape). */
class ShapeIndex<S extends TopoDS_Shape> {
  private readonly buckets = new Map<number, { shape: S; index: number }[]>();
  readonly shapes: S[] = [];
  constructor(private readonly oc: OpenCascadeInstance) {}

  find(shape: TopoDS_Shape): number | undefined {
    const bucket = this.buckets.get(this.oc.ReplicadShapeHasher.HashCode(shape, HASH_MAX));
    return bucket?.find((e) => e.shape.IsSame(shape))?.index;
  }

  /** Indice della forma, aggiunta se nuova (`make` la converte nella copia da conservare). */
  add(shape: TopoDS_Shape, make: () => S): { index: number; added: boolean } {
    const found = this.find(shape);
    if (found !== undefined) return { index: found, added: false };
    const hash = this.oc.ReplicadShapeHasher.HashCode(shape, HASH_MAX);
    const index = this.shapes.length;
    const stored = make();
    this.shapes.push(stored);
    const bucket = this.buckets.get(hash) ?? [];
    bucket.push({ shape: stored, index });
    this.buckets.set(hash, bucket);
    return { index, added: true };
  }
}

const pt = (p: { X(): number; Y(): number; Z(): number }): Vec3 => vec3(p.X(), p.Y(), p.Z());

function enumName(group: Record<string, unknown>, value: unknown): string {
  for (const [k, v] of Object.entries(group)) if (v === value) return k;
  return String(value);
}

/** Itera le sotto-forme di tipo `kind` (orientamenti composti). */
function* explore(oc: OpenCascadeInstance, shape: TopoDS_Shape, kind: "FACE" | "WIRE" | "EDGE" | "VERTEX") {
  const ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum[`TopAbs_${kind}`], oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try {
    for (; ex.More(); ex.Next()) yield ex.Current();
  } finally {
    ex.delete();
  }
}

export class BrepExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrepExtractionError";
  }
}

/** Estrae la B-rep neutra del solido (coordinate nel sistema della forma, mm). */
export function extractBrep(shape: Shape3D | TopoDS_Shape): NeutralBrep {
  const oc = occt();
  const root: TopoDS_Shape = "wrapped" in shape ? (shape.wrapped as TopoDS_Shape) : shape;
  const scope = new Scope();
  const FORWARD = oc.TopAbs_Orientation.TopAbs_FORWARD;
  const REVERSED = oc.TopAbs_Orientation.TopAbs_REVERSED;
  const senseOf = (s: TopoDS_Shape): BrepSense => {
    const o = s.Orientation();
    if (o === FORWARD) return "forward";
    if (o === REVERSED) return "reversed";
    throw new BrepExtractionError(`orientamento non supportato: ${enumName(oc.TopAbs_Orientation, o)}`);
  };

  const vertexIndex = new ShapeIndex<TopoDS_Vertex>(oc);
  const vertices: BrepVertex[] = [];
  const edgeIndex = new ShapeIndex<TopoDS_Edge>(oc);
  const edges: BrepEdge[] = [];

  const addVertex = (v: TopoDS_Shape): number => {
    const r = vertexIndex.add(v, () => scope.track(oc.TopoDS.Vertex(v)));
    if (r.added) {
      const p = scope.track(oc.BRep_Tool.Pnt(vertexIndex.shapes[r.index]));
      vertices.push({ point: pt(p) });
    }
    return r.index;
  };

  const addEdge = (e: TopoDS_Shape): number => {
    const r = edgeIndex.add(e, () => scope.track(oc.TopoDS.Edge(e.Oriented(FORWARD))));
    if (r.added) edges.push(edgeGeometry(edgeIndex.shapes[r.index]));
    return r.index;
  };

  const edgeGeometry = (edge: TopoDS_Edge): BrepEdge => {
    let start: number | undefined;
    let end: number | undefined;
    for (const v of explore(oc, edge, "VERTEX")) {
      scope.track(v);
      if (v.Orientation() === FORWARD) start = addVertex(v);
      else if (v.Orientation() === REVERSED) end = addVertex(v);
    }
    if (start === undefined || end === undefined) throw new BrepExtractionError("spigolo senza vertici di estremità");
    const adaptor = scope.track(new oc.BRepAdaptor_Curve(edge));
    const type = adaptor.GetType();
    const t0 = adaptor.FirstParameter();
    const t1 = adaptor.LastParameter();
    const p0 = vertices[start].point;
    const p1 = vertices[end].point;
    if (type === oc.GeomAbs_CurveType.GeomAbs_Line) {
      const len = distance(p0, p1);
      return { kind: "retta", start, end, origin: p0, direction: scale(sub(p1, p0), 1 / len), t0: 0, t1: len, seam: false };
    }
    if (type === oc.GeomAbs_CurveType.GeomAbs_Circle) {
      const circ = scope.track(adaptor.Circle());
      const ax2 = scope.track(circ.Position());
      const axis = pt(scope.track(ax2.Direction()));
      const xAxis = pt(scope.track(ax2.XDirection()));
      return {
        kind: "cerchio",
        start,
        end,
        center: pt(scope.track(ax2.Location())),
        axis,
        xAxis,
        yAxis: cross(axis, xAxis),
        radius: circ.Radius(),
        t0,
        t1,
        seam: false,
      };
    }
    return { kind: "altro", start, end, t0, t1, seam: false, curveType: enumName(oc.GeomAbs_CurveType, type) };
  };

  const faceGeometry = (face: TopoDS_Face, sense: BrepSense, loops: BrepLoop[]): BrepFace => {
    const adaptor = scope.track(new oc.BRepAdaptor_Surface(face, true));
    const type = adaptor.GetType();
    if (type === oc.GeomAbs_SurfaceType.GeomAbs_Plane) {
      const pln = scope.track(adaptor.Plane());
      const ax3 = scope.track(pln.Position());
      const xAxis = pt(scope.track(ax3.XDirection()));
      const yAxis = pt(scope.track(ax3.YDirection()));
      return { kind: "piana", sense, loops, origin: pt(scope.track(ax3.Location())), normal: cross(xAxis, yAxis), xAxis };
    }
    if (type === oc.GeomAbs_SurfaceType.GeomAbs_Cylinder) {
      const cyl = scope.track(adaptor.Cylinder());
      const ax3 = scope.track(cyl.Position());
      const dir = pt(scope.track(ax3.Direction()));
      // Terna indiretta ⇒ la normale OCCT della superficie è rivolta verso l'asse:
      // la B-rep neutra usa sempre la normale radiale uscente, quindi si inverte il verso.
      const direct = ax3.Direct();
      return {
        kind: "cilindrica",
        sense: direct ? sense : sense === "forward" ? "reversed" : "forward",
        loops,
        origin: pt(scope.track(ax3.Location())),
        axis: direct ? dir : scale(dir, -1),
        xAxis: pt(scope.track(ax3.XDirection())),
        radius: cyl.Radius(),
      };
    }
    return { kind: "altro", sense, loops, surfaceType: enumName(oc.GeomAbs_SurfaceType, type) };
  };

  const ends = (c: BrepCoedge) => {
    const e = edges[c.edge];
    return c.sense === "forward" ? { from: e.start, to: e.end } : { from: e.end, to: e.start };
  };

  /** Ordina i coedge di un wire in catena (fine di uno = inizio del successivo). */
  const chain = (coedges: BrepCoedge[]): BrepCoedge[] => {
    if (coedges.length <= 1) return coedges;
    const left = coedges.slice(1);
    const out = [coedges[0]];
    while (left.length) {
      const to = ends(out[out.length - 1]).to;
      const i = left.findIndex((c) => ends(c).from === to);
      if (i < 0) throw new BrepExtractionError("loop non concatenato");
      out.push(left.splice(i, 1)[0]);
    }
    return out;
  };

  try {
    const faces: BrepFace[] = [];
    for (const f of explore(oc, root, "FACE")) {
      const face = scope.track(oc.TopoDS.Face(f));
      scope.track(f);
      const sense = senseOf(face);
      const outer = scope.track(oc.BRepTools.OuterWire(face));
      const loops: { loop: BrepLoop; outer: boolean }[] = [];
      for (const w of explore(oc, face, "WIRE")) {
        scope.track(w);
        const coedges: BrepCoedge[] = [];
        for (const e of explore(oc, w, "EDGE")) {
          scope.track(e);
          const edge = oc.TopoDS.Edge(e);
          scope.track(edge);
          if (oc.BRep_Tool.Degenerated(edge)) continue;
          coedges.push({ edge: addEdge(edge), sense: senseOf(edge) });
        }
        if (coedges.length) loops.push({ loop: { coedges: chain(coedges) }, outer: !outer.IsNull() && w.IsSame(outer) });
      }
      loops.sort((a, b) => Number(b.outer) - Number(a.outer));
      faces.push(faceGeometry(face, sense, loops.map((l) => l.loop)));
    }

    // Spigoli di cucitura: usati due volte dalla stessa faccia.
    const seams = new Set<number>();
    for (const f of faces) {
      const seen = new Set<number>();
      for (const l of f.loops)
        for (const c of l.coedges) {
          if (seen.has(c.edge)) seams.add(c.edge);
          seen.add(c.edge);
        }
    }
    const finalEdges = edges.map((e, i) => (seams.has(i) ? { ...e, seam: true } : e));
    return { vertices, edges: finalEdges, faces };
  } finally {
    scope.dispose();
  }
}
