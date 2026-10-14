import {
  ENVELOPE_ID,
  aabbUnion,
  pieceAabb,
  pieceObb,
  type AABB,
  type Collision,
  type Envelope,
  type Piece,
  type Violation,
} from "@/domain"
import { formatMm } from "./layer-helpers"

/**
 * Informazioni sui pezzi per evidenziazione, etichette e inquadratura
 * (funzioni pure, senza Three).
 */

/** Id dei pezzi da evidenziare come problema: in collisione o coinvolti in violazioni `errore`. */
export function problemPieceIds(collisions: readonly Collision[], violations: readonly Violation[]): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const c of collisions) ids.add(c.pieceId)
  for (const v of violations) if (v.severity === "errore") for (const id of v.pieceIds) ids.add(id)
  return ids
}

export interface PieceMessage {
  readonly tone: "errore" | "avviso"
  readonly text: string
}

const fmt1 = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",")

/** Messaggi associati al pezzo: collisioni (sempre errore) e violazioni che lo coinvolgono. */
export function pieceMessages(
  pieceId: string,
  collisions: readonly Collision[],
  violations: readonly Violation[],
  envelope: Pick<Envelope, "obstacles">
): PieceMessage[] {
  const out: PieceMessage[] = []
  for (const c of collisions) {
    if (c.pieceId !== pieceId) continue
    if (c.obstacleId === ENVELOPE_ID) {
      out.push({ tone: "errore", text: `Esce dall'ingombro${c.side ? ` (lato ${c.side})` : ""} di ${fmt1(c.depth)} mm` })
    } else {
      const o = envelope.obstacles.find((x) => x.id === c.obstacleId)
      const what = o ? `${o.type} ${o.id}${o.label ? ` – ${o.label}` : ""}` : c.obstacleId
      out.push({ tone: "errore", text: `Collisione con ${what} (${fmt1(c.depth)} mm)` })
    }
  }
  for (const v of violations) if (v.pieceIds.includes(pieceId)) out.push({ tone: v.severity, text: v.message })
  return out
}

export interface PieceSummary {
  readonly id: string
  readonly type: string
  readonly section: string
  readonly length: string
}

/** Dati descrittivi del pezzo per l'etichetta. */
export function pieceSummary(p: Piece): PieceSummary {
  return {
    id: p.id,
    type: p.type,
    section: `${p.section.b}×${p.section.h} mm`,
    length: formatMm(p.length),
  }
}

/** Centro del pezzo (centro dell'OBB sezione × lunghezza) nel sistema assieme. */
export function pieceCenter(p: Piece): [number, number, number] {
  const c = pieceObb(p).center
  return [c.x, c.y, c.z]
}

/** AABB dei pezzi indicati; `undefined` se nessuno è presente. */
export function piecesBounds(pieces: readonly Piece[], ids: readonly string[]): AABB | undefined {
  const wanted = new Set(ids)
  let box: AABB | undefined
  for (const p of pieces) {
    if (!wanted.has(p.id)) continue
    const b = pieceAabb(p)
    box = box ? aabbUnion(box, b) : b
  }
  return box
}
