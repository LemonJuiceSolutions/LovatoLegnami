import { Matrix4, Quaternion, Vector3 } from "three"
import { PIECE_FAMILIES, pieceObbs, type Assembly, type Mat4, type OBB, type Piece, type PieceFamily } from "@/domain"
import { pieceCacheKey } from "@/geometry/cache"
import type { PieceMesh as PieceMeshData, PieceResult } from "@/geometry/protocol"

/**
 * Funzioni pure del visualizzatore (nessun React): conversione delle pose,
 * legenda. Le unità della scena sono millimetri, Z verso l'alto.
 */

/** Posa (Mat4 per righe, p' = M·p) → `Matrix4` di Three (`set` accetta l'ordine per righe). */
export function poseToMatrix4(pose: Mat4, target = new Matrix4()): Matrix4 {
  if (pose.length !== 16) throw new Error(`posa non valida: attesi 16 valori, ricevuti ${pose.length}`)
  const p = pose
  return target.set(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], p[12], p[13], p[14], p[15])
}

export interface Transform {
  readonly position: [number, number, number]
  readonly quaternion: [number, number, number, number]
}

/** Posa rigida → posizione e quaternione (props di un `<group>` r3f). */
export function poseToTransform(pose: Mat4): Transform {
  const position = new Vector3()
  const quaternion = new Quaternion()
  poseToMatrix4(pose).decompose(position, quaternion, new Vector3())
  return {
    position: [position.x, position.y, position.z],
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
  }
}

export interface LegendEntry {
  readonly family: PieceFamily
  readonly count: number
}

/** Famiglie presenti nell'assieme, nell'ordine canonico, con il numero di pezzi. */
export function familyLegend(assembly: Pick<Assembly, "pieces"> | null): LegendEntry[] {
  if (!assembly) return []
  const counts = new Map<PieceFamily, number>()
  for (const p of assembly.pieces) counts.set(p.family, (counts.get(p.family) ?? 0) + 1)
  return PIECE_FAMILIES.flatMap((family) => {
    const count = counts.get(family)
    return count ? [{ family, count }] : []
  })
}

/**
 * Mesh del kernel utilizzabile per il pezzo: solo se il risultato esiste, è
 * senza errori e la sua chiave di cache corrisponde al pezzo corrente (stessa
 * sezione, lunghezza e lavorazioni). Altrimenti il pezzo resta un box.
 */
export function usableKernelMesh(piece: Piece, result: PieceResult | undefined): PieceMeshData | undefined {
  if (!result || result.error || !result.mesh) return undefined
  if (result.mesh.indices.length === 0 || result.mesh.positions.length === 0) return undefined
  return result.cacheKey === pieceCacheKey(piece) ? result.mesh : undefined
}

export interface BoxTransform extends Transform {
  /** Dimensioni del box (scala di un box unitario centrato). */
  readonly scale: [number, number, number]
}

/** OBB (sistema assieme) → posizione, rotazione e scala di un box unitario centrato. */
export function obbTransform(o: OBB): BoxTransform {
  const [a, b, c] = o.axes
  const basis = new Matrix4().makeBasis(new Vector3(a.x, a.y, a.z), new Vector3(b.x, b.y, b.z), new Vector3(c.x, c.y, c.z))
  const q = new Quaternion().setFromRotationMatrix(basis)
  return {
    position: [o.center.x, o.center.y, o.center.z],
    quaternion: [q.x, q.y, q.z, q.w],
    scale: [2 * o.halfSize.x, 2 * o.halfSize.y, 2 * o.halfSize.z],
  }
}

/**
 * Box della modalità semplificata di un pezzo curvo (spec `visualizzatore-3d`,
 * "Pezzi curvi nel viewer"): i tratti di `pieceObbs` (`ceil(sweep/15°)`), nel
 * sistema assieme. Per i pezzi dritti `[]` (si usa il box sezione × lunghezza).
 */
export function curvedFallbackBoxes(piece: Piece): BoxTransform[] {
  return piece.curve ? pieceObbs(piece).map(obbTransform) : []
}
