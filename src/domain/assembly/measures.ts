import type { Assembly, Piece, PieceType } from "../components/types";
import { type Mat4, axisOf, invertRigid, multiply } from "../math/mat4";
import { obbAabbPenetration, obbFromPose } from "../math/obb";
import { aabb } from "../math/aabb";
import { type Vec3, cross, dot, vec3 } from "../math/vec3";
import { type ClearHeight, type FloorHeightFn, minClearHeight, pieceObb } from "./bounds";

/**
 * Misure effettive dell'assieme calcolate da pezzi e pose (non dai parametri
 * di input), così le regole costruttive valgono per qualsiasi tipologia (D4).
 *
 * Convenzioni:
 * - un pezzo S "appoggia" P se il tipo di S è tra i `SUPPORTERS` del tipo di P
 *   e i loro box (sezione × lunghezza, lavorazioni ignorate) si toccano o si
 *   compenetrano; la zona d'appoggio è l'intervallo, lungo l'asse X locale di
 *   P, dell'intersezione dei due box;
 * - luce = massima distanza tra i centri di due zone d'appoggio consecutive,
 *   misurata lungo l'asse del pezzo;
 * - sbalzo = distanza tra il bordo esterno della zona d'appoggio estrema e la
 *   testa del pezzo, proiettata in orizzontale (per i travetti è lo sbalzo di
 *   gronda in pianta);
 * - interasse = distanza in pianta tra gli assi di travetti paralleli
 *   consecutivi della stessa falda.
 */

/** Per ogni tipo di pezzo, i tipi che gli fanno da appoggio. Dati, estendibili. */
export const SUPPORTERS: Readonly<Record<PieceType, readonly PieceType[]>> = {
  trave: ["pilastro"],
  colmo: ["puntone", "pilastro"],
  travetto: ["trave", "banchina", "colmo"],
  puntone: ["trave", "colmo"],
  banchina: [],
  pilastro: [],
  controvento: [],
  // nuovi primitivi (tipologie-estese): appoggi completati dal task 3.4 (E8)
  tavola: [],
  arco: [],
  cantonale: [],
  monaco: [],
  mensola: [],
  fascia: [],
  grigliato: [],
};

/** Zona d'appoggio di un supporto lungo l'asse X locale del pezzo (mm). */
export interface SupportContact {
  readonly pieceId: string;
  readonly from: number;
  readonly to: number;
  /** Centro della zona d'appoggio. */
  readonly at: number;
}

export interface SpanMeasure {
  readonly pieceId: string;
  readonly type: PieceType;
  /** Appoggi ordinati lungo l'asse. */
  readonly supports: readonly SupportContact[];
  /** Luce effettiva lungo l'asse (0 con un solo appoggio, lunghezza se nessun appoggio). */
  readonly span: number;
  /** Sbalzo orizzontale oltre l'appoggio verso la testa iniziale (X = 0). */
  readonly overhangStart: number;
  /** Sbalzo orizzontale oltre l'appoggio verso la testa finale (X = lunghezza). */
  readonly overhangEnd: number;
  /** max(overhangStart, overhangEnd). */
  readonly overhang: number;
}

export interface JoistGroup {
  /** Direzione in pianta (versore) dell'asse dei travetti del gruppo. */
  readonly direction: { readonly x: number; readonly y: number };
  /** Travetti ordinati per posizione trasversale. */
  readonly pieceIds: readonly string[];
  /** Interassi consecutivi (mm). */
  readonly spacings: readonly number[];
  /** Interasse effettivo massimo; `undefined` con un solo travetto. */
  readonly spacing?: number;
}

export interface SlopeMeasure {
  readonly pieceId: string;
  /** Inclinazione dell'asse sull'orizzontale (gradi). */
  readonly deg: number;
}

export interface Measures {
  readonly spans: readonly SpanMeasure[];
  readonly joistGroups: readonly JoistGroup[];
  /** Interasse effettivo massimo tra tutti i gruppi di travetti. */
  readonly joistSpacing?: number;
  /** Sbalzo massimo tra i pezzi con appoggi. */
  readonly maxOverhang?: { readonly value: number; readonly pieceId: string };
  readonly clearHeight?: ClearHeight;
  /** Pendenza di ogni travetto. */
  readonly slopes: readonly SlopeMeasure[];
  /** Pendenza effettiva (massima tra i travetti); `undefined` senza travetti. */
  readonly slope?: number;
}

export interface MeasureOptions {
  readonly floorHeightAt?: FloorHeightFn;
  /** Distanza entro cui due box sono considerati a contatto (mm, default 0,5). */
  readonly contactTolerance?: number;
}

interface HalfSpace {
  readonly n: Vec3;
  readonly d: number;
}

/** Semispazi n·q ≤ d del box [lo, hi] (locale) posizionato da `m`, espressi nel sistema di arrivo. */
function boxHalfSpaces(m: Mat4, lo: Vec3, hi: Vec3, tol: number): HalfSpace[] {
  const t = vec3(m[3], m[7], m[11]);
  const out: HalfSpace[] = [];
  const los = [lo.x, lo.y, lo.z];
  const his = [hi.x, hi.y, hi.z];
  for (const k of [0, 1, 2] as const) {
    const r = axisOf(m, k);
    const rt = dot(r, t);
    out.push({ n: r, d: his[k] + rt + tol });
    out.push({ n: vec3(-r.x, -r.y, -r.z), d: -(los[k] + rt) + tol });
  }
  return out;
}

const localBounds = (p: Piece): [Vec3, Vec3] => [
  vec3(0, -p.section.b / 2, -p.section.h / 2),
  vec3(p.length, p.section.b / 2, p.section.h / 2),
];

/** Soluzione del sistema a·q = d per tre piani (Cramer); `undefined` se degenere. */
function intersect3(a: HalfSpace, b: HalfSpace, c: HalfSpace): Vec3 | undefined {
  const bc = cross(b.n, c.n);
  const det = dot(a.n, bc);
  if (Math.abs(det) < 1e-12) return undefined;
  const ca = cross(c.n, a.n);
  const ab = cross(a.n, b.n);
  const s = 1 / det;
  return vec3(
    (a.d * bc.x + b.d * ca.x + c.d * ab.x) * s,
    (a.d * bc.y + b.d * ca.y + c.d * ab.y) * s,
    (a.d * bc.z + b.d * ca.z + c.d * ab.z) * s,
  );
}

/**
 * Intervallo lungo l'asse X locale di `p` dell'intersezione tra il box di `p`
 * e quello di `s` (con tolleranza), per enumerazione dei vertici del poliedro
 * intersezione; `undefined` se i box non si toccano.
 */
export function contactRange(p: Piece, s: Piece, tol = 0.5): { from: number; to: number } | undefined {
  const rel = multiply(invertRigid(p.pose), s.pose);
  const [plo, phi] = localBounds(p);
  const [slo, shi] = localBounds(s);
  const sObb = obbFromPose(rel, vec3(s.length, s.section.b, s.section.h));
  if (obbAabbPenetration(sObb, aabb(plo, phi)) < -tol) return undefined;
  // prima con tolleranza numerica (intervallo esatto), poi con `tol` per i contatti quasi esatti
  const range = vertexRange(plo, phi, rel, slo, shi, 1e-6) ?? vertexRange(plo, phi, rel, slo, shi, tol);
  if (!range) return undefined;
  return { from: Math.max(0, range.from), to: Math.min(p.length, range.to) };
}

function vertexRange(plo: Vec3, phi: Vec3, rel: Mat4, slo: Vec3, shi: Vec3, tol: number): { from: number; to: number } | undefined {
  const hs = [
    ...boxHalfSpaces([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], plo, phi, tol),
    ...boxHalfSpaces(rel, slo, shi, tol),
  ];
  let from = Infinity;
  let to = -Infinity;
  for (let i = 0; i < hs.length; i++)
    for (let j = i + 1; j < hs.length; j++)
      for (let k = j + 1; k < hs.length; k++) {
        const q = intersect3(hs[i], hs[j], hs[k]);
        if (!q || !hs.every((h) => dot(h.n, q) <= h.d + 1e-7)) continue;
        from = Math.min(from, q.x);
        to = Math.max(to, q.x);
      }
  return from > to ? undefined : { from, to };
}

/** Componente orizzontale dell'asse del pezzo (1 = orizzontale, 0 = verticale). */
const horizontalFactor = (p: Piece): number => {
  const x = axisOf(p.pose, 0);
  return Math.hypot(x.x, x.y);
};

/** Luce, appoggi e sbalzi di un pezzo rispetto agli altri pezzi dell'assieme. */
export function measureSpan(p: Piece, pieces: readonly Piece[], tol = 0.5): SpanMeasure {
  const types = SUPPORTERS[p.type];
  const supports: SupportContact[] = [];
  for (const s of pieces) {
    if (s.id === p.id || !types.includes(s.type)) continue;
    const r = contactRange(p, s, tol);
    if (r) supports.push({ pieceId: s.id, from: r.from, to: r.to, at: (r.from + r.to) / 2 });
  }
  supports.sort((a, b) => a.at - b.at || a.pieceId.localeCompare(b.pieceId));
  if (supports.length === 0)
    return { pieceId: p.id, type: p.type, supports, span: p.length, overhangStart: 0, overhangEnd: 0, overhang: 0 };
  let span = 0;
  for (let i = 1; i < supports.length; i++) span = Math.max(span, supports[i].at - supports[i - 1].at);
  const h = horizontalFactor(p);
  const overhangStart = Math.max(0, supports[0].from) * h;
  const overhangEnd = Math.max(0, p.length - supports[supports.length - 1].to) * h;
  return { pieceId: p.id, type: p.type, supports, span, overhangStart, overhangEnd, overhang: Math.max(overhangStart, overhangEnd) };
}

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6 + 0;

/** Raggruppa i travetti per direzione in pianta e calcola gli interassi effettivi. */
export function measureJoistGroups(pieces: readonly Piece[]): JoistGroup[] {
  const groups = new Map<string, { dir: { x: number; y: number }; items: { id: string; pos: number }[] }>();
  for (const p of pieces) {
    if (p.type !== "travetto") continue;
    const ax = axisOf(p.pose, 0);
    const len = Math.hypot(ax.x, ax.y);
    if (len < 1e-9) continue;
    const dir = { x: round6(ax.x / len), y: round6(ax.y / len) };
    const key = `${dir.x},${dir.y}`;
    const c = pieceObb(p).center;
    // posizione trasversale su un asse orientato in modo canonico (verso +X, o +Y se parallelo a Y)
    const flip = dir.y < -1e-9 || (Math.abs(dir.y) <= 1e-9 && dir.x > 0) ? -1 : 1;
    const pos = flip * (dir.y * c.x - dir.x * c.y);
    const g = groups.get(key) ?? { dir, items: [] };
    g.items.push({ id: p.id, pos });
    groups.set(key, g);
  }
  return [...groups.values()].map(({ dir, items }) => {
    items.sort((a, b) => a.pos - b.pos);
    const spacings = items.slice(1).map((it, i) => it.pos - items[i].pos);
    return {
      direction: dir,
      pieceIds: items.map((i) => i.id),
      spacings,
      spacing: spacings.length ? Math.max(...spacings) : undefined,
    };
  });
}

/** Inclinazione dell'asse del pezzo sull'orizzontale, in gradi. */
export function pieceSlope(p: Piece): number {
  const x = axisOf(p.pose, 0);
  return (Math.atan2(Math.abs(x.z), Math.hypot(x.x, x.y)) * 180) / Math.PI;
}

/** Misure effettive dell'assieme (luci, interassi, sbalzi, altezza libera, pendenza). */
export function measureAssembly(assembly: Pick<Assembly, "pieces">, options: MeasureOptions = {}): Measures {
  const tol = options.contactTolerance ?? 0.5;
  const pieces = assembly.pieces;
  const spans = pieces.filter((p) => SUPPORTERS[p.type].length > 0).map((p) => measureSpan(p, pieces, tol));
  const joistGroups = measureJoistGroups(pieces);
  const spacings = joistGroups.flatMap((g) => (g.spacing === undefined ? [] : [g.spacing]));
  let maxOverhang: Measures["maxOverhang"];
  for (const s of spans)
    if (s.supports.length > 0 && (!maxOverhang || s.overhang > maxOverhang.value))
      maxOverhang = { value: s.overhang, pieceId: s.pieceId };
  const slopes = pieces.filter((p) => p.type === "travetto").map((p) => ({ pieceId: p.id, deg: pieceSlope(p) }));
  return {
    spans,
    joistGroups,
    joistSpacing: spacings.length ? Math.max(...spacings) : undefined,
    maxOverhang,
    clearHeight: minClearHeight(assembly, { floorHeightAt: options.floorHeightAt }),
    slopes,
    slope: slopes.length ? Math.max(...slopes.map((s) => s.deg)) : undefined,
  };
}
