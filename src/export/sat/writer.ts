import { applyToPoint, applyToVector, type Mat4 } from "@/domain/math/mat4";
import { normalize, scale, type Vec3 } from "@/domain/math/vec3";
import type { BrepCoedge, BrepEdge, BrepFace, NeutralBrep } from "@/geometry/neutral-brep";
import { formatSatNumber } from "./number";
import {
  DEFAULT_SAT_VERSION,
  STRING_ATTRIB,
  formatSatString,
  recordLayout,
  satHeader,
  satVersionInfo,
  type SatVersion,
  type SatVersionInfo,
} from "./versions";

/**
 * Writer SAT (ACIS testuale, D7). Per ogni pezzo scrive un body completo
 * (body → lump → shell → face → loop → coedge → edge → vertex → point con
 * `plane-surface`/`cone-surface` e `straight-curve`/`ellipse-curve`) con le coordinate **già trasformate**
 * nel sistema dell'assieme (posa applicata alla geometria, `transform` del
 * body = `$-1`) e, opzionalmente, l'attributo nome = id del pezzo.
 */

export interface SatBodyInput {
  /** Id del pezzo: nome del body. */
  readonly id: string;
  readonly brep: NeutralBrep;
  /** Posa del pezzo (Mat4 per righe, rigida). */
  readonly pose: Mat4;
}

export interface SatWriteOptions {
  readonly version?: SatVersion;
  /** Campo "produttore/CAM" scritto come product id nell'header. */
  readonly producer?: string;
  /** Scrive l'attributo nome sul body (default `true`). */
  readonly includeName?: boolean;
  /** Nome dell'attributo stringa che porta l'id del pezzo (default `ATTRIB_XACIS_NAME`). */
  readonly nameAttribute?: string;
  /** Data dell'header (default: adesso). */
  readonly date?: Date;
}

export const DEFAULT_SAT_PRODUCER = "Lovato Legnami - Configuratore pergole";
/** Nome usato dai traduttori ACIS (InterOp) per il nome delle entità. */
export const DEFAULT_NAME_ATTRIBUTE = "ATTRIB_XACIS_NAME";

/** Pezzo non scrivibile: superficie/curva non supportata o posa non rigida. */
export class SatBodyError extends Error {
  constructor(
    readonly pieceId: string,
    readonly entity: "superficie" | "curva" | "topologia" | "posa",
    readonly entityType: string,
    detail: string,
  ) {
    super(`Pezzo ${pieceId}: ${detail}`);
    this.name = "SatBodyError";
  }
}

export interface SatWriteResult {
  readonly text: string;
  /** Id dei pezzi scritti, nell'ordine del file. */
  readonly written: readonly string[];
  /** Pezzi esclusi (gli altri sono comunque nel file). */
  readonly errors: readonly SatBodyError[];
}

// ---------------------------------------------------------------------------
// Record astratti

/** Valore di un campo: indice/`null` (ref), numero, vettore, parola chiave o stringa; `undefined` = intervallo `I`. */
type SatValue = number | null | Vec3 | string | undefined;

interface SatRecord {
  readonly type: string;
  readonly fields: Record<string, SatValue>;
}

const isVec = (v: SatValue): v is Vec3 => typeof v === "object" && v !== null;

function serializeRecord(info: SatVersionInfo, rec: SatRecord): string {
  const layout = recordLayout(info, rec.type);
  if (!layout) throw new Error(`SAT: tipo di record senza layout "${rec.type}"`);
  const tokens: string[] = [rec.type];
  for (const { name, type } of layout) {
    const has = name in rec.fields;
    const v = rec.fields[name];
    const missing = () => new Error(`SAT: campo "${name}" mancante o non valido in ${rec.type}`);
    switch (type.kind) {
      case "ref":
        if (has && typeof v !== "number" && v !== null) throw missing();
        tokens.push(`$${typeof v === "number" ? v : -1}`);
        break;
      case "int":
        tokens.push(String(typeof v === "number" ? v : -1));
        break;
      case "num":
        if (typeof v !== "number") throw missing();
        tokens.push(formatSatNumber(v));
        break;
      case "vec":
        if (!isVec(v)) throw missing();
        tokens.push(formatSatNumber(v.x), formatSatNumber(v.y), formatSatNumber(v.z));
        break;
      case "keyword":
        if (typeof v !== "string") throw missing();
        tokens.push(v);
        break;
      case "string":
        if (typeof v !== "string") throw missing();
        tokens.push(formatSatString(info, v));
        break;
      case "interval":
        tokens.push(typeof v === "number" ? formatSatNumber(v) : "I");
        break;
    }
  }
  tokens.push("#");
  return tokens.join(" ");
}

// ---------------------------------------------------------------------------
// Topologia del body

interface FaceLoops {
  readonly face: BrepFace;
  readonly loops: readonly (readonly BrepCoedge[])[];
}

function det3(m: Mat4): number {
  return (
    m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8])
  );
}

const coedgeTo = (brep: NeutralBrep, c: BrepCoedge) => (c.sense === "forward" ? brep.edges[c.edge].end : brep.edges[c.edge].start);
const coedgeFrom = (brep: NeutralBrep, c: BrepCoedge) =>
  c.sense === "forward" ? brep.edges[c.edge].start : brep.edges[c.edge].end;

const kindName = (x: BrepFace | BrepEdge) =>
  x.kind === "altro" ? ("surfaceType" in x ? x.surfaceType : x.curveType) : x.kind;

/**
 * Loop delle facce pronti per la scrittura (controlla i tipi supportati).
 * Le cuciture delle facce cilindriche sono scartate: il loop unico
 * `cerchio, cucitura, cerchio, cucitura⁻¹` diventa due loop di un solo coedge
 * ciascuno (rappresentazione ACIS di una faccia periodica senza cucitura). Se
 * i tratti rimasti non si chiudono (faccia cilindrica tagliata in modo
 * irregolare) la cucitura è mantenuta: spigolo usato due volte, con versi
 * opposti, dallo stesso loop, ammesso da ACIS.
 */
function faceLoops(body: SatBodyInput): FaceLoops[] {
  const { brep, id } = body;
  const facesOfEdge = new Map<number, Set<number>>();
  brep.faces.forEach((f, fi) =>
    f.loops.forEach((l) =>
      l.coedges.forEach((c) => facesOfEdge.set(c.edge, (facesOfEdge.get(c.edge) ?? new Set()).add(fi))),
    ),
  );
  return brep.faces.map((face, fi) => {
    if (face.kind === "altro")
      throw new SatBodyError(id, "superficie", kindName(face), `superficie non supportata nel SAT (${kindName(face)})`);
    const loops = face.loops.map((l) => l.coedges);
    if (face.kind !== "cilindrica") return { face, loops };
    const isSeam = (c: BrepCoedge) => brep.edges[c.edge].seam && facesOfEdge.get(c.edge)!.size === 1;
    return { face, loops: loops.flatMap((coedges) => splitAtSeams(brep, coedges, isSeam)) };
  });
}

function splitAtSeams(
  brep: NeutralBrep,
  coedges: readonly BrepCoedge[],
  isSeam: (c: BrepCoedge) => boolean,
): (readonly BrepCoedge[])[] {
  const first = coedges.findIndex(isSeam);
  if (first < 0) return [coedges];
  const segments: BrepCoedge[][] = [];
  let current: BrepCoedge[] = [];
  for (let k = 1; k <= coedges.length; k++) {
    const c = coedges[(first + k) % coedges.length];
    if (!isSeam(c)) current.push(c);
    else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  }
  const closed = segments.every((s) => coedgeFrom(brep, s[0]) === coedgeTo(brep, s[s.length - 1]));
  return closed && segments.length > 0 ? segments : [coedges];
}

function checkEdge(id: string, e: BrepEdge): void {
  if (e.kind === "altro")
    throw new SatBodyError(id, "curva", kindName(e), `curva non supportata nel SAT (${kindName(e)})`);
}

interface BodyContext {
  readonly info: SatVersionInfo;
  readonly includeName: boolean;
  readonly nameAttribute: string;
}

/** Record di un body a partire dall'indice globale `base`. */
function bodyRecords(body: SatBodyInput, base: number, ctx: BodyContext): SatRecord[] {
  const { brep, pose, id } = body;
  if (Math.abs(det3(pose) - 1) > 1e-6)
    throw new SatBodyError(id, "posa", "matrice", "la posa non è una rototraslazione (determinante ≠ 1)");
  const P = (p: Vec3) => applyToPoint(pose, p);
  const V = (v: Vec3) => normalize(applyToVector(pose, v));

  const faces = faceLoops(body);
  const loops = faces.flatMap((f, fi) => f.loops.map((coedges) => ({ fi, coedges })));
  const coedges = loops.flatMap((l, li) => l.coedges.map((c, k) => ({ li, k, c })));

  // Spigoli e vertici effettivamente usati, nell'ordine degli indici della B-rep.
  const edgeIds = [...new Set(coedges.map((x) => x.c.edge))].sort((a, b) => a - b);
  edgeIds.forEach((e) => checkEdge(id, brep.edges[e]));
  const vertexIds = [...new Set(edgeIds.flatMap((e) => [brep.edges[e].start, brep.edges[e].end]))].sort((a, b) => a - b);

  // Indici globali dei record.
  let next = base;
  const take = (n: number) => {
    const first = next;
    next += n;
    return first;
  };
  const iBody = take(1);
  const iAttrib = ctx.includeName ? take(1) : null;
  const iLump = take(1);
  const iShell = take(1);
  const iFace0 = take(faces.length);
  const iSurface0 = take(faces.length);
  const iLoop0 = take(loops.length);
  const iCoedge0 = take(coedges.length);
  const iEdge0 = take(edgeIds.length);
  const iCurve0 = take(edgeIds.length);
  const iVertex0 = take(vertexIds.length);
  const iPoint0 = take(vertexIds.length);
  const edgeIndex = new Map(edgeIds.map((e, k) => [e, k]));
  const vertexIndex = new Map(vertexIds.map((v, k) => [v, k]));

  // Partner: anello dei coedge dello stesso spigolo (2 per un solido manifold).
  const byEdge = new Map<number, number[]>();
  coedges.forEach((x, ci) => byEdge.set(x.c.edge, [...(byEdge.get(x.c.edge) ?? []), ci]));
  const loopStart: number[] = [];
  coedges.forEach((x, ci) => {
    if (x.k === 0) loopStart[x.li] = ci;
  });

  const records: SatRecord[] = [];
  records.push({ type: "body", fields: { attrib: iAttrib, lump: iLump, wire: null, transform: null } });
  if (iAttrib !== null)
    records.push({
      type: STRING_ATTRIB,
      fields: {
        attrib: null,
        next: null,
        prev: null,
        owner: iBody,
        split: "keep",
        merge: "keep_kept",
        trans: "ignore",
        copy: "copy_keep",
        name: ctx.nameAttribute,
        value: id,
      },
    });
  records.push({ type: "lump", fields: { next: null, shell: iShell, body: iBody } });
  records.push({ type: "shell", fields: { next: null, subshell: null, face: iFace0, wire: null, lump: iLump } });

  const firstLoopOfFace: number[] = [];
  loops.forEach((l, li) => {
    if (firstLoopOfFace[l.fi] === undefined) firstLoopOfFace[l.fi] = li;
  });
  faces.forEach((f, fi) =>
    records.push({
      type: "face",
      fields: {
        next: fi + 1 < faces.length ? iFace0 + fi + 1 : null,
        loop: iLoop0 + firstLoopOfFace[fi],
        shell: iShell,
        subshell: null,
        surface: iSurface0 + fi,
        sense: f.face.sense,
        sides: "single",
      },
    }),
  );
  faces.forEach(({ face }) => records.push(surfaceRecord(face, P, V)));

  loops.forEach((l, li) =>
    records.push({
      type: "loop",
      fields: {
        next: li + 1 < loops.length && loops[li + 1].fi === l.fi ? iLoop0 + li + 1 : null,
        coedge: iCoedge0 + loopStart[li],
        face: iFace0 + l.fi,
      },
    }),
  );

  coedges.forEach((x, ci) => {
    const n = loops[x.li].coedges.length;
    const first = loopStart[x.li];
    const ring = byEdge.get(x.c.edge)!;
    const pos = ring.indexOf(ci);
    records.push({
      type: "coedge",
      fields: {
        next: iCoedge0 + first + ((x.k + 1) % n),
        prev: iCoedge0 + first + ((x.k + n - 1) % n),
        partner: ring.length > 1 ? iCoedge0 + ring[(pos + 1) % ring.length] : null,
        edge: iEdge0 + edgeIndex.get(x.c.edge)!,
        sense: x.c.sense,
        loop: iLoop0 + x.li,
        pcurve: null,
      },
    });
  });

  edgeIds.forEach((e, k) => {
    const edge = brep.edges[e];
    records.push({
      type: "edge",
      fields: {
        start: iVertex0 + vertexIndex.get(edge.start)!,
        startParam: edge.t0,
        end: iVertex0 + vertexIndex.get(edge.end)!,
        endParam: edge.t1,
        coedge: iCoedge0 + byEdge.get(e)![0],
        curve: iCurve0 + k,
        sense: "forward",
        convexity: "unknown",
      },
    });
  });
  edgeIds.forEach((e) => records.push(curveRecord(brep.edges[e], P, V)));

  vertexIds.forEach((v, k) => {
    const edge = edgeIds.findIndex((e) => brep.edges[e].start === v || brep.edges[e].end === v);
    records.push({ type: "vertex", fields: { edge: iEdge0 + edge, point: iPoint0 + k } });
  });
  vertexIds.forEach((v) => records.push({ type: "point", fields: { location: P(brep.vertices[v].point) } }));

  if (records.length !== next - base) throw new Error("SAT: conteggio record incoerente");
  // Coerenza dei loop (il writer non deve mai produrre loop aperti).
  for (const l of loops)
    l.coedges.forEach((c, k) => {
      if (coedgeTo(brep, c) !== coedgeFrom(brep, l.coedges[(k + 1) % l.coedges.length]))
        throw new SatBodyError(id, "topologia", "loop", "loop non concatenato nella B-rep");
    });
  return records;
}

/**
 * Superficie della faccia. Cilindro = `cone-surface` con semiangolo 0
 * (`sin 0`, `cos 1`: normale radiale uscente, come nella B-rep neutra),
 * ellisse di base di raggio `radius` con rapporto 1 e scala u = raggio.
 */
function surfaceRecord(face: BrepFace, P: (p: Vec3) => Vec3, V: (v: Vec3) => Vec3): SatRecord {
  switch (face.kind) {
    case "piana":
      return {
        type: "plane-surface",
        fields: { root: P(face.origin), normal: V(face.normal), uDir: V(face.xAxis), reverseV: "forward_v" },
      };
    case "cilindrica":
      return {
        type: "cone-surface",
        fields: {
          center: P(face.origin),
          normal: V(face.axis),
          major: scale(V(face.xAxis), face.radius),
          ratio: 1,
          sinHalfAngle: 0,
          cosHalfAngle: 1,
          uScale: face.radius,
          reverseU: "forward",
        },
      };
    default:
      throw new Error(`SAT: superficie non gestita ${face.kind}`);
  }
}

/** Curva dello spigolo: retta = `straight-curve`, cerchio = `ellipse-curve` con rapporto 1. */
function curveRecord(edge: BrepEdge, P: (p: Vec3) => Vec3, V: (v: Vec3) => Vec3): SatRecord {
  switch (edge.kind) {
    case "retta":
      return { type: "straight-curve", fields: { root: P(edge.origin), direction: V(edge.direction) } };
    case "cerchio":
      return {
        type: "ellipse-curve",
        fields: {
          center: P(edge.center),
          normal: V(edge.axis),
          major: scale(V(edge.xAxis), edge.radius),
          ratio: 1,
        },
      };
    default:
      throw new Error(`SAT: curva non gestita ${edge.kind}`);
  }
}

// ---------------------------------------------------------------------------

/**
 * Scrive un file SAT con un body per pezzo. I pezzi non scrivibili finiscono
 * in `errors` (con id e tipo di superficie/curva) e non bloccano gli altri.
 */
export function writeSat(bodies: readonly SatBodyInput[], options: SatWriteOptions = {}): SatWriteResult {
  const info = satVersionInfo(options.version ?? DEFAULT_SAT_VERSION);
  const ctx: BodyContext = {
    info,
    includeName: options.includeName ?? true,
    nameAttribute: options.nameAttribute?.trim() || DEFAULT_NAME_ATTRIBUTE,
  };
  const records: SatRecord[] = [];
  const written: string[] = [];
  const errors: SatBodyError[] = [];
  for (const body of bodies) {
    try {
      records.push(...bodyRecords(body, records.length, ctx));
      written.push(body.id);
    } catch (e) {
      if (!(e instanceof SatBodyError)) throw e;
      errors.push(e);
    }
  }
  const header = satHeader(info, {
    producer: options.producer ?? DEFAULT_SAT_PRODUCER,
    date: options.date ?? new Date(),
    bodyCount: written.length,
  });
  const lines = [...header, ...records.map((r) => serializeRecord(info, r)), info.endMarker];
  return { text: `${lines.join("\n")}\n`, written, errors };
}
