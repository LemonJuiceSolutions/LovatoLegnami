import { Matrix4, Quaternion, Vector3 } from "three"
import { applyToPoint, vec3, type HardwareItem } from "@/domain"
import { poseToMatrix4 } from "./viewer-helpers"

/**
 * Simboli della ferramenta nel viewer (spec `visualizzatore-3d`, "Livello
 * ferramenta"), funzioni pure: cilindri per i bulloni lungo il loro asse,
 * box per staffe, giunti, cuspidi e piastre dalla posa e dall'ingombro della
 * voce. Le voci senza posa (viti, tasselli: solo conteggi) non hanno simbolo.
 */

interface SymbolBase {
  /** Id della voce (`BUL-01`, `STM-01`, …). */
  readonly id: string
  readonly code: string
  readonly description: string
  readonly pieceIds: readonly string[]
  readonly position: [number, number, number]
  readonly quaternion: [number, number, number, number]
}

export interface CylinderSymbol extends SymbolBase {
  readonly shape: "cylinder"
  readonly radius: number
  /** Lunghezza lungo l'asse Y del cilindro di Three (ruotato sull'asse del bullone). */
  readonly length: number
}

export interface BoxSymbol extends SymbolBase {
  readonly shape: "box"
  readonly size: [number, number, number]
}

export type HardwareSymbol = CylinderSymbol | BoxSymbol

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined)

/** Rotazione che porta l'asse Y del cilindro di Three sull'asse X locale della voce. */
const Y_TO_X = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2)

function poseQuaternion(item: HardwareItem): Quaternion {
  const q = new Quaternion()
  poseToMatrix4(item.pose!).decompose(new Vector3(), q, new Vector3())
  return q
}

const tuple = (q: Quaternion): [number, number, number, number] => [q.x, q.y, q.z, q.w]

/** Simbolo della voce; `null` se non ha posa o ingombro. */
export function hardwareSymbol(item: HardwareItem): HardwareSymbol | null {
  if (!item.pose) return null
  const base = { id: item.id, code: item.code, description: item.description, pieceIds: item.pieceIds }
  if (item.kind === "bullone") {
    const length = num(item.params.length) ?? item.dims?.x
    const diameter = num(item.params.diameter) ?? item.dims?.y
    if (!length || !diameter) return null
    // la posa ha l'origine all'ingresso nel primo strato: il bullone è centrato sullo spessore serrato
    const grip = num(item.params.grip) ?? length
    const c = applyToPoint(item.pose, vec3(grip / 2, 0, 0))
    return {
      ...base,
      shape: "cylinder",
      position: [c.x, c.y, c.z],
      quaternion: tuple(poseQuaternion(item).multiply(Y_TO_X)),
      radius: diameter / 2,
      length,
    }
  }
  if (!item.dims) return null
  const o = new Vector3()
  poseToMatrix4(item.pose, new Matrix4()).decompose(o, new Quaternion(), new Vector3())
  return {
    ...base,
    shape: "box",
    position: [o.x, o.y, o.z],
    quaternion: tuple(poseQuaternion(item)),
    size: [item.dims.x, item.dims.y, item.dims.z],
  }
}

/** Simboli della ferramenta dell'assieme, nell'ordine delle voci. */
export function hardwareSymbols(hardware: readonly HardwareItem[]): HardwareSymbol[] {
  return hardware.flatMap((h) => {
    const s = hardwareSymbol(h)
    return s ? [s] : []
  })
}
