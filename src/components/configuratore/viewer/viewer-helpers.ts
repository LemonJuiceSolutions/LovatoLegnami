import { Matrix4, Quaternion, Vector3 } from "three"
import { PIECE_FAMILIES, type Assembly, type Mat4, type PieceFamily } from "@/domain"

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
