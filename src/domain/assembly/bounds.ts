import type { Assembly, Piece, PieceType } from "../components/types";
import { type AABB, aabbFromPoints, aabbUnion } from "../math/aabb";
import { type OBB, obbFromPose, obbVertices } from "../math/obb";
import { applyToPoint, applyToVector } from "../math/mat4";
import { vec3 } from "../math/vec3";

/** Quota del pavimento nel punto (x, y); default: pavimento piano a quota 0. */
export type FloorHeightFn = (x: number, y: number) => number;

export const flatFloor: FloorHeightFn = () => 0;

/** Ampiezza angolare massima (gradi) di un segmento di pezzo curvo in `pieceObbs` (E1). */
export const CURVE_SEGMENT_DEG = 15;

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

/** Vertici di tutti i box del pezzo (`pieceObbs`). */
export const pieceVertices = (p: Piece) => pieceObbs(p).flatMap(obbVertices);

/** AABB del pezzo nel sistema assieme (dai box di `pieceObbs`). */
export const pieceAabb = (p: Piece): AABB => aabbFromPoints(pieceVertices(p));

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
 * struttura di copertura. Pilastri e controventi (saette) sono esclusi.
 */
export const CLEAR_HEIGHT_TYPES: readonly PieceType[] = ["trave", "banchina", "colmo", "puntone", "travetto"];

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
 * Altezza libera minima sotto la copertura: minimo, sui vertici dell'OBB dei
 * pezzi dei tipi indicati, di `z − quotaPavimento(x, y)`. `undefined` se nessun
 * pezzo di quei tipi.
 */
export function minClearHeight(assembly: Pick<Assembly, "pieces">, options: ClearHeightOptions = {}): ClearHeight | undefined {
  const floor = options.floorHeightAt ?? flatFloor;
  const types = options.types ?? CLEAR_HEIGHT_TYPES;
  let best: ClearHeight | undefined;
  for (const p of assembly.pieces) {
    if (!types.includes(p.type)) continue;
    for (const v of pieceVertices(p)) {
      const h = v.z - floor(v.x, v.y);
      if (!best || h < best.value) best = { value: h, pieceId: p.id };
    }
  }
  return best;
}
