import { Vector, basicFaceExtrusion, makeBox, makeCylinder, makePolygon, type Shape3D, type Solid } from "replicad";
import type { Face, Machining, Section } from "@/domain/components/types";
import { add, cross, normalize, scale, vec3, type Vec3 } from "@/domain/math/vec3";
import { occt } from "./init";

/**
 * Costruzione del solido di un pezzo nel sistema LOCALE (D6): parallelepipedo
 * X ∈ [0, L], Y ∈ [−b/2, b/2], Z ∈ [−h/2, h/2] meno un solido-utensile per
 * lavorazione (`cut`). Gli utensili sporgono di `TOOL_OFFSET` oltre le facce del
 * pezzo che attraversano, per evitare facce complanari nelle booleane.
 */

/** Sporgenza degli utensili oltre le facce del pezzo (mm). */
export const TOOL_OFFSET = 0.01;

/** Dati del pezzo che determinano il solido (la posa non serve). */
export interface PieceSolidInput {
  readonly id: string;
  readonly section: Section;
  readonly length: number;
  readonly machinings: readonly Machining[];
}

/** Errore di costruzione di un pezzo (con la lavorazione responsabile, se nota). */
export class PieceBuildError extends Error {
  readonly pieceId: string;
  readonly machiningId?: string;
  readonly machiningType?: string;

  constructor(pieceId: string, reason: string, machining?: { id?: string; type?: string }) {
    const what = machining?.type ? ` (lavorazione ${machining.type}${machining.id ? ` ${machining.id}` : ""})` : "";
    super(`Pezzo ${pieceId}${what}: ${reason}`);
    this.name = "PieceBuildError";
    this.pieceId = pieceId;
    this.machiningId = machining?.id;
    this.machiningType = machining?.type;
  }
}

type LateralFace = Exclude<Face, "testa-inizio" | "testa-fine">;

/** Riferimento di una faccia laterale: normale uscente, asse trasversale (`offset`), distanza dall'asse X. */
interface FaceFrame {
  readonly n: Vec3;
  readonly w: Vec3;
  readonly dist: number;
  /** Larghezza della faccia lungo `w`. */
  readonly across: number;
}

function faceFrame(face: LateralFace, { b, h }: Section): FaceFrame {
  switch (face) {
    case "superiore":
      return { n: vec3(0, 0, 1), w: vec3(0, 1, 0), dist: h / 2, across: b };
    case "inferiore":
      return { n: vec3(0, 0, -1), w: vec3(0, 1, 0), dist: h / 2, across: b };
    case "sinistra":
      return { n: vec3(0, 1, 0), w: vec3(0, 0, 1), dist: b / 2, across: h };
    case "destra":
      return { n: vec3(0, -1, 0), w: vec3(0, 0, 1), dist: b / 2, across: h };
  }
}

const toPoint = (v: Vec3): [number, number, number] => [v.x, v.y, v.z];

/** Prisma: poligono piano (punti 3D) estruso lungo `dir`. */
function prism(points: readonly Vec3[], dir: Vec3): Solid {
  const face = makePolygon(points.map(toPoint));
  const vec = new Vector(toPoint(dir));
  try {
    return basicFaceExtrusion(face, vec);
  } finally {
    face.delete();
    vec.delete();
  }
}

/** Estremi lungo X: se toccano una testa vengono estesi oltre di `TOOL_OFFSET`. */
function extendX(x0: number, x1: number, L: number): [number, number] {
  const tol = 1e-6;
  return [x0 <= tol ? -TOOL_OFFSET : x0, x1 >= L - tol ? L + TOOL_OFFSET : x1];
}

/**
 * Prisma "da faccia": rettangolo sulla faccia (estesa verso l'esterno di
 * `TOOL_OFFSET`) definito da centro, semi-assi `d1`, `d2` nel piano della
 * faccia, estruso verso l'interno fino alla profondità `depth`.
 */
function facePocket(frame: FaceFrame, center: Vec3, d1: Vec3, d2: Vec3, depth: number): Solid {
  const top = add(center, scale(frame.n, TOOL_OFFSET));
  const pts = [
    add(add(top, d1), d2),
    add(add(top, scale(d1, -1)), d2),
    add(add(top, scale(d1, -1)), scale(d2, -1)),
    add(add(top, d1), scale(d2, -1)),
  ];
  return prism(pts, scale(frame.n, -(depth + TOOL_OFFSET)));
}

/** Punto sulla faccia laterale in (x, offset). */
const facePoint = (frame: FaceFrame, x: number, offset: number): Vec3 =>
  add(add(vec3(x, 0, 0), scale(frame.n, frame.dist)), scale(frame.w, offset));

type ToolBuilder<M extends Machining> = (m: M, p: PieceSolidInput) => Shape3D;
/** Lavorazioni il cui utensile non è ancora implementato nel kernel (task 8.3 di `tipologie-estese`). */
type PendingTools = "asola-lama" | "dardo-di-giove";
type ToolBuilders = { [K in Exclude<Machining["type"], PendingTools>]: ToolBuilder<Extract<Machining, { type: K }>> } & {
  [K in PendingTools]?: ToolBuilder<Extract<Machining, { type: K }>>;
};

const deg = (a: number): number => (a * Math.PI) / 180;

/** Procedure di costruzione dell'utensile per tipo di lavorazione. */
const TOOLS: ToolBuilders = {
  /** Tasca che attraversa tutta la faccia, larga `width` lungo X centrata in `at`. */
  "mezzo-legno": (m, p) => {
    const f = faceFrame(m.face, p.section);
    const [x0, x1] = extendX(m.at - m.width / 2, m.at + m.width / 2, p.length);
    const halfAcross = f.across / 2 + TOOL_OFFSET;
    const center = facePoint(f, (x0 + x1) / 2, 0);
    return facePocket(f, center, vec3((x1 - x0) / 2, 0, 0), scale(f.w, halfAcross), m.depth);
  },

  /** Rimuove il materiale della testa attorno al tenone `width`×`height` lungo `length`. */
  tenone: (m, p) => {
    const { b, h } = p.section;
    const atStart = m.face === "testa-inizio";
    const [x0, x1] = atStart ? [-TOOL_OFFSET, m.length] : [p.length - m.length, p.length + TOOL_OFFSET];
    const outer = makeBox([x0, -b / 2 - TOOL_OFFSET, -h / 2 - TOOL_OFFSET], [x1, b / 2 + TOOL_OFFSET, h / 2 + TOOL_OFFSET]);
    // Il tenone a filo di una faccia si estende oltre per non lasciare pellicole.
    const hy = m.width >= b - 1e-6 ? b / 2 + 2 * TOOL_OFFSET : m.width / 2;
    const hz = m.height >= h - 1e-6 ? h / 2 + 2 * TOOL_OFFSET : m.height / 2;
    const inner = makeBox([x0 - TOOL_OFFSET, -hy, -hz], [x1 + TOOL_OFFSET, hy, hz]);
    try {
      return outer.cut(inner);
    } finally {
      outer.delete();
      inner.delete();
    }
  },

  /**
   * Tasca `width`×`height` profonda `depth` centrata in (`at`, `offset`); la
   * direzione di `width` sulla faccia è cos(angle)·X + sin(angle)·W (W = asse
   * trasversale della faccia, +Y o +Z), come calcolata da `expandJoint`.
   */
  mortasa: (m, p) => {
    const f = faceFrame(m.face, p.section);
    const a = deg(m.angle);
    const dW = add(scale(vec3(1, 0, 0), Math.cos(a)), scale(f.w, Math.sin(a)));
    const dH = add(scale(vec3(1, 0, 0), -Math.sin(a)), scale(f.w, Math.cos(a)));
    return facePocket(f, facePoint(f, m.at, m.offset), scale(dW, m.width / 2), scale(dH, m.height / 2), m.depth);
  },

  /**
   * Becco d'uccello (convenzione di design.md, note 4.5): intaglio triangolare
   * su tutta la larghezza della faccia con vertice a profondità `depth` in
   * `at`; faccia d'appoggio inclinata di `angle` sull'asse dal lato +X
   * (fino a `at + depth/tan(angle)`), faccia di battuta perpendicolare dal
   * lato −X (da `at − depth·tan(angle)`).
   */
  "becco-uccello": (m, p) => {
    const f = faceFrame(m.face, p.section);
    const t = Math.tan(deg(m.angle));
    const e = TOOL_OFFSET;
    // Rette prolungate di e oltre la faccia: battuta −X, appoggio +X.
    const xPlumb = m.at - (m.depth + e) * t;
    const xSeat = m.at + (m.depth + e) / t;
    const half = f.across / 2 + e;
    const inPlane = (x: number, depthFromFace: number, s: number): Vec3 =>
      add(add(vec3(x, 0, 0), scale(f.n, f.dist - depthFromFace)), scale(f.w, s));
    const tri = [inPlane(xPlumb, -e, -half), inPlane(m.at, m.depth, -half), inPlane(xSeat, -e, -half)];
    return prism(tri, scale(f.w, 2 * half));
  },

  /** Cilindro perpendicolare alla faccia in (`at`, `offset`); `depth` assente = passante. */
  foro: (m, p) => {
    const f = faceFrame(m.face, p.section);
    const thickness = 2 * f.dist;
    const start = add(facePoint(f, m.at, m.offset), scale(f.n, TOOL_OFFSET));
    const height = (m.depth ?? thickness + TOOL_OFFSET) + TOOL_OFFSET;
    return makeCylinder(m.diameter / 2, height, toPoint(start), toPoint(scale(f.n, -1)));
  },

  /**
   * Semispazio delimitato dal piano per (`at`, 0, 0) con normale ∝
   * (1, tan(angle2), −tan(angle)) — tracce inclinate di `angle` nel piano X–Z
   * e di `angle2` nel piano X–Y; con angle2 = 0 è rotY(angle)·X — che rimuove
   * il materiale dal lato della testa `face`. Realizzato come prisma molto
   * più grande del pezzo.
   */
  "taglio-testa": (m, p) => {
    const n = normalize(vec3(1, Math.tan(deg(m.angle2 ?? 0)), -Math.tan(deg(m.angle))));
    const towardHead = m.face === "testa-inizio" ? scale(n, -1) : n;
    const size = p.length + p.section.b + p.section.h + 100;
    const u = normalize(cross(n, vec3(0, 1, 0)));
    const v = cross(n, u);
    const c = vec3(m.at, 0, 0);
    const pts = [
      add(add(c, scale(u, size)), scale(v, size)),
      add(add(c, scale(u, -size)), scale(v, size)),
      add(add(c, scale(u, -size)), scale(v, -size)),
      add(add(c, scale(u, size)), scale(v, -size)),
    ];
    return prism(pts, scale(towardHead, size));
  },
};

/** Parallelepipedo di base del pezzo nel sistema locale. */
export function makeBaseBox(section: Section, length: number): Solid {
  return makeBox([0, -section.b / 2, -section.h / 2], [length, section.b / 2, section.h / 2]);
}

/** Solido-utensile di una lavorazione (lancia se il tipo non ha procedura). */
export function makeTool(m: Machining, piece: PieceSolidInput): Shape3D {
  const builder = (TOOLS as Record<string, ToolBuilder<Machining> | undefined>)[m.type];
  if (!builder) throw new PieceBuildError(piece.id, "nessuna procedura di costruzione geometrica", m);
  return builder(m, piece);
}

/** Estrae l'unico solido di un risultato booleano. */
function singleSolid(shape: Shape3D, piece: PieceSolidInput, m?: Machining): Solid {
  const solids = shape.solids;
  if (solids.length === 1) return solids[0];
  for (const s of solids) s.delete();
  throw new PieceBuildError(
    piece.id,
    solids.length === 0 ? "il solido risultante è vuoto" : `il pezzo risulta diviso in ${solids.length} parti`,
    m,
  );
}

/** `true` se la forma è topologicamente e geometricamente valida (BRepCheck_Analyzer). */
export function isValidShape(shape: Shape3D): boolean {
  const oc = occt();
  const analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false);
  try {
    return analyzer.IsValid();
  } finally {
    analyzer.delete();
  }
}

/**
 * Costruisce il solido del pezzo nel sistema locale applicando le lavorazioni
 * nell'ordine. Lancia `PieceBuildError` (con id e tipo della lavorazione) se
 * una lavorazione non ha procedura, fallisce o produce un solido non valido.
 */
export function buildPieceSolid(piece: PieceSolidInput): Solid {
  if (!(piece.length > 0 && piece.section.b > 0 && piece.section.h > 0))
    throw new PieceBuildError(piece.id, "dimensioni non valide");
  let solid: Solid = makeBaseBox(piece.section, piece.length);
  for (const m of piece.machinings) {
    let tool: Shape3D | undefined;
    try {
      tool = makeTool(m, piece);
      const result = solid.cut(tool);
      const next = singleSolid(result, piece, m);
      if (result !== next) result.delete();
      solid.delete();
      solid = next;
    } catch (e) {
      solid.delete();
      if (e instanceof PieceBuildError) throw e;
      throw new PieceBuildError(piece.id, `operazione booleana fallita: ${errorMessage(e)}`, m);
    } finally {
      tool?.delete();
    }
  }
  if (!isValidShape(solid)) {
    solid.delete();
    throw new PieceBuildError(piece.id, "il solido risultante non è valido");
  }
  return solid;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "number") {
    // Eccezione C++ di OCCT: puntatore numerico.
    try {
      return occt().OCJS.getStandard_FailureData(e).GetMessageString();
    } catch {
      return `eccezione OCCT ${e}`;
    }
  }
  return String(e);
}
