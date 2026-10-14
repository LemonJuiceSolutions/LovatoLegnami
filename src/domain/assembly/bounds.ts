import type { Assembly, Piece, PieceType } from "../components/types";
import { type AABB, aabbFromPoints, aabbUnion } from "../math/aabb";
import { type OBB, obbFromPose, obbVertices } from "../math/obb";
import { vec3 } from "../math/vec3";

/** Quota del pavimento nel punto (x, y); default: pavimento piano a quota 0. */
export type FloorHeightFn = (x: number, y: number) => number;

export const flatFloor: FloorHeightFn = () => 0;

/** OBB del pezzo (sezione × lunghezza nella sua posa, lavorazioni ignorate). */
export const pieceObb = (p: Piece): OBB => obbFromPose(p.pose, vec3(p.length, p.section.b, p.section.h));

/** AABB del pezzo nel sistema assieme. */
export const pieceAabb = (p: Piece): AABB => aabbFromPoints(obbVertices(pieceObb(p)));

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
    for (const v of obbVertices(pieceObb(p))) {
      const h = v.z - floor(v.x, v.y);
      if (!best || h < best.value) best = { value: h, pieceId: p.id };
    }
  }
  return best;
}
