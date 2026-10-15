import { planeOfHeadCut } from "../components/head-cut";
import type { Assembly, Piece, PieceType, TaglioTesta } from "../components/types";
import { type AABB, aabbFromPoints, aabbUnion } from "../math/aabb";
import { type OBB, obbFromPose, obbVertices } from "../math/obb";
import { applyToPoint, applyToVector } from "../math/mat4";
import { type Vec3, cross, dot, scale, add, vec3 } from "../math/vec3";

/** Quota del pavimento nel punto (x, y); default: pavimento piano a quota 0. */
export type FloorHeightFn = (x: number, y: number) => number;

export const flatFloor: FloorHeightFn = () => 0;

/** Ampiezza angolare massima (gradi) di un segmento di pezzo curvo in `pieceObbs` (E1). */
export const CURVE_SEGMENT_DEG = 15;

/** Semispazio `n·x ≤ d` (sistema assieme). */
interface HalfSpace {
  readonly n: Vec3;
  readonly d: number;
}

/**
 * Semispazi che contengono il tratto curvo tra gli angoli `t0` e `t1`
 * (radianti, ampiezza < 180°): i due piani radiali delle teste del tratto
 * (per il centro di curvatura, normale = tangente dell'asse) e i due piani
 * tangenti all'estradosso (raggio R + h/2) nelle stesse teste. Il legno del
 * tratto ci sta per intero; ritagliato con questi piani il box di settore
 * perde gli spigoli che sporgono oltre le teste radiali e oltre l'estradosso
 * (la "freccia" del box di corda ai piedi dell'arco).
 */
function curvedSectorWedge(p: Piece, t0: number, t1: number): HalfSpace[] {
  const C = applyToPoint(p.pose, vec3(0, 0, p.curve!.radius));
  const rOut = p.curve!.radius + p.section.h / 2;
  const tangent = (t: number) => applyToVector(p.pose, vec3(Math.cos(t), 0, Math.sin(t)));
  const outward = (t: number) => applyToVector(p.pose, vec3(Math.sin(t), 0, -Math.cos(t)));
  const n0 = scale(tangent(t0), -1);
  const n1 = tangent(t1);
  const out: HalfSpace[] = [
    { n: n0, d: dot(n0, C) },
    { n: n1, d: dot(n1, C) },
  ];
  // piani tangenti all'estradosso nelle teste del tratto: il disco di raggio R + h/2 sta dalla parte del centro
  for (const t of [t0, t1]) {
    const u = outward(t);
    out.push({ n: u, d: dot(u, C) + rOut });
  }
  return out;
}

/**
 * Box che contiene il settore anulare della sezione curva tra gli angoli
 * `t0` e `t1` (radianti) dell'asse, nel sistema locale del pezzo: assi = tangente,
 * +Y, normale radiale (verso il centro) all'angolo medio. Contiene esattamente
 * corda, freccia e teste radiali del tratto (raggi `R ± h/2`).
 */
function curvedSectorObb(p: Piece, t0: number, t1: number): OBB {
  const R = p.curve!.radius;
  const { b, h } = p.section;
  const tm = (t0 + t1) / 2;
  const half = (t1 - t0) / 2;
  const rOut = R + h / 2;
  const rIn = Math.max(0, R - h / 2);
  // coordinate rispetto al centro di curvatura: w lungo la tangente media, u radiale uscente
  const wHalf = half >= Math.PI / 2 ? rOut : rOut * Math.sin(half);
  const c = Math.cos(half);
  const uMin = c >= 0 ? rIn * c : rOut * c;
  const uMax = rOut;
  const tangent = vec3(Math.cos(tm), 0, Math.sin(tm));
  const outward = vec3(Math.sin(tm), 0, -Math.cos(tm));
  const uMid = (uMin + uMax) / 2;
  const localCenter = vec3(outward.x * uMid, 0, R + outward.z * uMid);
  const axes = [tangent, vec3(0, 1, 0), vec3(-outward.x, 0, -outward.z)].map((a) => applyToVector(p.pose, a));
  return {
    center: applyToPoint(p.pose, localCenter),
    axes: [axes[0], axes[1], axes[2]],
    halfSize: vec3(wHalf, b / 2, (uMax - uMin) / 2),
  };
}

/**
 * OBB del pezzo (sezione × lunghezza nella sua posa, lavorazioni ignorate).
 * Per i pezzi curvi è il box dell'intero arco (inviluppo conservativo): per
 * collisioni e misure usare `pieceObbs`.
 */
export const pieceObb = (p: Piece): OBB =>
  p.curve
    ? curvedSectorObb(p, 0, (p.curve.sweep * Math.PI) / 180)
    : obbFromPose(p.pose, vec3(p.length, p.section.b, p.section.h));

/**
 * Box che rappresentano il pezzo (E1): `[pieceObb]` per i pezzi dritti; per
 * quelli curvi `ceil(sweep / 15°)` box di segmento, ognuno costruito sulla
 * corda del tratto e allargato della freccia così da contenere tutto il legno.
 */
export function pieceObbs(p: Piece): OBB[] {
  if (!p.curve) return [pieceObb(p)];
  const sweep = (p.curve.sweep * Math.PI) / 180;
  const n = Math.max(1, Math.ceil(p.curve.sweep / CURVE_SEGMENT_DEG - 1e-9));
  return Array.from({ length: n }, (_, i) => curvedSectorObb(p, (sweep * i) / n, (sweep * (i + 1)) / n));
}

/** Celle del pezzo: box di `pieceObbs` con i semispazi che ne delimitano il legno (cuneo dei tratti curvi). */
function pieceCells(p: Piece): { readonly obb: OBB; readonly planes: readonly HalfSpace[] }[] {
  const obbs = pieceObbs(p);
  if (!p.curve) return obbs.map((obb) => ({ obb, planes: [] }));
  const sweep = (p.curve.sweep * Math.PI) / 180;
  const n = obbs.length;
  return obbs.map((obb, i) => ({ obb, planes: curvedSectorWedge(p, (sweep * i) / n, (sweep * (i + 1)) / n) }));
}

/** Vertici di tutti i box del pezzo (`pieceObbs`), lavorazioni ignorate. */
export const pieceVertices = (p: Piece) => pieceObbs(p).flatMap(obbVertices);

/** Tolleranza (mm) di appartenenza di un vertice ai semispazi nel ritaglio. */
const CLIP_EPS = 1e-6;

/**
 * Vertici del poliedro convesso `box ∩ semispazi`: intersezioni a tre a tre
 * dei piani (6 facce + tagli) che soddisfano tutti i vincoli. Con pochi tagli
 * (≤ 4 per pezzo) i piani sono ≤ 10, cioè ≤ 120 terne.
 */
function clipObb(o: OBB, cuts: readonly HalfSpace[]): Vec3[] {
  if (cuts.length === 0) return obbVertices(o);
  const half = [o.halfSize.x, o.halfSize.y, o.halfSize.z];
  const planes: HalfSpace[] = [...cuts];
  o.axes.forEach((a, i) => {
    const c = dot(a, o.center);
    planes.push({ n: a, d: c + half[i] }, { n: scale(a, -1), d: -c + half[i] });
  });
  const out: Vec3[] = [];
  for (let i = 0; i < planes.length; i++)
    for (let j = i + 1; j < planes.length; j++)
      for (let k = j + 1; k < planes.length; k++) {
        const [a, b, c] = [planes[i], planes[j], planes[k]];
        const bc = cross(b.n, c.n);
        const det = dot(a.n, bc);
        if (Math.abs(det) < 1e-12) continue;
        const p = scale(add(add(scale(bc, a.d), scale(cross(c.n, a.n), b.d)), scale(cross(a.n, b.n), c.d)), 1 / det);
        if (planes.every((h) => dot(h.n, p) <= h.d + CLIP_EPS)) out.push(p);
      }
  return out;
}

/**
 * Vertici del legno del pezzo: i box di `pieceObbs` ritagliati dai tagli di
 * testa (`taglio-testa`), che nel kernel asportano tutto il semispazio dal
 * lato della testa (`planeOfHeadCut`), e, per i pezzi curvi, dai piani radiali
 * delle teste di ogni tratto (il box di settore sporge oltre la testa radiale
 * di `(h/2)·tan(Δ/2)` circa). Le altre lavorazioni sono ignorate
 * (approssimazione conservativa). È l'ingombro usato da `pieceAabb`,
 * `assemblyBounds` e dal controllo dell'ingombro (`checkCollisions`): le teste
 * prolungate oltre il muro o il pavimento e poi tagliate non sono sforamenti.
 */
export function pieceHullVertices(p: Piece): Vec3[] {
  const cuts: HalfSpace[] = p.machinings
    .filter((m): m is TaglioTesta => m.type === "taglio-testa")
    .map((m) => {
      const pl = planeOfHeadCut(p, m);
      // normale verso il materiale asportato: si tiene n·x ≤ n·punto
      return { n: pl.normal, d: dot(pl.normal, pl.point) };
    });
  const out = pieceCells(p).flatMap((c) => clipObb(c.obb, [...c.planes, ...cuts]));
  // pezzo interamente asportato (configurazione degenere): si torna ai box interi
  return out.length > 0 ? out : pieceVertices(p);
}

/** AABB del legno del pezzo nel sistema assieme (`pieceHullVertices`). */
export const pieceAabb = (p: Piece): AABB => aabbFromPoints(pieceHullVertices(p));

/** AABB dell'intero assieme; `undefined` se l'assieme non ha pezzi. */
export function assemblyBounds(assembly: Pick<Assembly, "pieces">): AABB | undefined {
  let box: AABB | undefined;
  for (const p of assembly.pieces) {
    const b = pieceAabb(p);
    box = box ? aabbUnion(box, b) : b;
  }
  return box;
}

/** Quota massima raggiunta dall'assieme (mm); 0 se vuoto. */
export const maxHeight = (assembly: Pick<Assembly, "pieces">): number => assemblyBounds(assembly)?.max.z ?? 0;

/**
 * Tipi di pezzo che delimitano l'altezza libera "sotto le travi": tutta la
 * struttura di copertura. Pilastri, controventi (saette), archi e grigliati
 * sono esclusi.
 */
export const CLEAR_HEIGHT_TYPES: readonly PieceType[] = [
  "trave",
  "banchina",
  "colmo",
  "puntone",
  "travetto",
  // tipologie-estese (E8)
  "tavola",
  "cantonale",
  "mensola",
  "fascia",
  "monaco",
];

export interface ClearHeight {
  /** Altezza libera minima (mm) tra pavimento e intradosso del pezzo. */
  readonly value: number;
  /** Pezzo che determina il minimo. */
  readonly pieceId: string;
}

export interface ClearHeightOptions {
  readonly floorHeightAt?: FloorHeightFn;
  readonly types?: readonly PieceType[];
}

/**
 * Altezza libera minima sotto la copertura: minimo, sui vertici del legno
 * (`pieceHullVertices`: box ritagliati dai tagli di testa) dei pezzi dei tipi
 * indicati, di `z − quotaPavimento(x, y)`. `undefined` se nessun
 * pezzo di quei tipi.
 */
export function minClearHeight(assembly: Pick<Assembly, "pieces">, options: ClearHeightOptions = {}): ClearHeight | undefined {
  const floor = options.floorHeightAt ?? flatFloor;
  const types = options.types ?? CLEAR_HEIGHT_TYPES;
  let best: ClearHeight | undefined;
  for (const p of assembly.pieces) {
    if (!types.includes(p.type)) continue;
    for (const v of pieceHullVertices(p)) {
      const h = v.z - floor(v.x, v.y);
      if (!best || h < best.value) best = { value: h, pieceId: p.id };
    }
  }
  return best;
}
