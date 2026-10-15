import type { Collision } from "@/domain/envelope/collisions"
import type { FitDimension } from "@/domain/envelope/fit"
import { planDeviations, type EnvelopePlan } from "@/domain/envelope/plan"
import type { Obstacle, ObstacleType } from "@/domain/envelope/types"
import type { Proposal } from "@/domain/rules/autosize"
import type { Violation } from "@/domain/rules/types"
import type { FitAdjustment } from "@/lib/preventivo/pipeline"

/**
 * Note semplici per il cliente (12.2, spec `wizard-preventivo` "Violazioni in linguaggio
 * semplice"): traduce adattamenti all'ingombro, auto-dimensionamento, pianta fuori
 * squadra, collisioni e violazioni residue in frasi italiane senza gergo. La stessa
 * funzione produce le note del wizard nel browser e quelle della stima sul server.
 * Funzione pura, nessun dato interno (id di regole o di pezzi) nelle frasi.
 */

export interface SimpleNotesInput {
  readonly violations: readonly Violation[]
  readonly collisions: readonly Collision[]
  /** Dimensioni ridotte dall'adattamento all'ingombro (`PreparedAssembly.fitAdjustments`). */
  readonly fitLimits: readonly FitAdjustment[]
  /** Proposte dell'auto-dimensionamento applicate. */
  readonly autosize: readonly Proposal[]
  readonly plan?: EnvelopePlan
  /** Ostacoli dell'ingombro, per nominare la causa di un adattamento ("la grondaia"). */
  readonly obstacles?: readonly Obstacle[]
  /** L'adattamento serviva ma non ha trovato misure valide. */
  readonly fitFailed?: boolean
  /** Il cliente non sa se il muro è in squadra: si verifica al sopralluogo. */
  readonly squareUnknown?: boolean
}

export const REVIEW_NOTE = "Questa soluzione richiede una verifica del nostro ufficio: puoi comunque inviare la richiesta e ti ricontatteremo."
export const SECTIONS_NOTE = "Le sezioni del legno sono state adeguate automaticamente alle misure scelte."
export const SQUARE_UNKNOWN_NOTE = "Controlleremo la squadra del muro durante il sopralluogo."
/** Sotto mezzo grado la differenza dalla squadra non è significativa per il cliente. */
export const OUT_OF_SQUARE_MIN_DEG = 0.5

const DIM_LABELS: Readonly<Record<FitDimension, string>> = { altezza: "l'altezza", profondita: "la profondità", larghezza: "la larghezza" }

/** Metri senza zeri inutili: 2900 → "2,9 m", 2950 → "2,95 m", 3000 → "3 m". */
export function simpleMetres(mm: number): string {
  const m = Math.round(mm / 10) / 100
  return `${m.toFixed(2).replace(/\.?0+$/, "").replace(".", ",")} m`
}

const TYPE_ARTICLES: Readonly<Record<ObstacleType, string>> = {
  grondaia: "la grondaia",
  finestra: "la finestra",
  sottomuro: "il sottomuro",
  sporgenza: "la sporgenza",
  generico: "l'ostacolo",
}
const ABOVE_TYPES: readonly ObstacleType[] = ["grondaia", "sporgenza"]

/** Nome dell'ostacolo con articolo: dall'etichetta del wizard ("Porta" → "la porta") o dal tipo. */
function obstacleName(o: Obstacle | undefined): { name: string; above: boolean } {
  if (!o) return { name: "un ostacolo", above: false }
  const label = o.label?.trim()
  const fromLabel = label ? LABEL_ARTICLES[label.toLowerCase()] : undefined
  return { name: fromLabel ?? TYPE_ARTICLES[o.type], above: ABOVE_TYPES.includes(o.type) }
}

const LABEL_ARTICLES: Readonly<Record<string, string>> = {
  grondaia: "la grondaia",
  finestra: "la finestra",
  porta: "la porta",
  pluviale: "il pluviale",
  "balcone sopra": "il balcone",
  balcone: "il balcone",
  altro: "l'ostacolo",
}

function reason(adj: FitAdjustment, obstacles: readonly Obstacle[]): string {
  const cause = adj.cause
  if (cause?.kind === "ostacolo") {
    const first = obstacles.find((o) => cause.obstacleIds.includes(o.id))
    const { name, above } = obstacleName(first)
    return above ? `per passare sotto ${name}` : `per non toccare ${name}`
  }
  if (cause?.kind === "regola") return "per rispettare le regole di costruzione"
  return "per stare nello spazio disponibile"
}

function autosizeNotes(proposals: readonly Proposal[]): string[] {
  const out: string[] = []
  const spacing = proposals.filter((p) => typeof p.to === "number")
  const sections = proposals.filter((p) => typeof p.to === "string")
  if (sections.length) out.push(SECTIONS_NOTE)
  const last = spacing.at(-1)
  if (last) out.push(`Abbiamo avvicinato i travetti (uno ogni ${Math.round((last.to as number) / 10)} cm) per reggere bene la copertura.`)
  return out
}

export function simpleNotes(input: SimpleNotesInput): string[] {
  const notes: string[] = []
  const obstacles = input.obstacles ?? []
  for (const adj of input.fitLimits) {
    if (adj.to >= adj.from) continue
    notes.push(`Abbiamo ridotto ${DIM_LABELS[adj.dimension]} a ${simpleMetres(adj.to)} ${reason(adj, obstacles)}.`)
  }
  notes.push(...autosizeNotes(input.autosize))
  if (input.plan) {
    const dev = planDeviations(input.plan).maxCornerDeg
    if (Math.abs(dev) >= OUT_OF_SQUARE_MIN_DEG) notes.push(`Muro fuori squadra di circa ${Math.round(Math.abs(dev))}°: ne teniamo conto nel progetto e nel prezzo.`)
  }
  if (input.squareUnknown) notes.push(SQUARE_UNKNOWN_NOTE)

  const blocking = input.violations.filter((v) => v.severity === "errore")
  if (input.collisions.length > 0 || blocking.length > 0 || input.fitFailed) {
    if (blocking.some((v) => v.kind === "min-clear-height")) notes.push("Lo spazio in altezza è poco per questo modello.")
    else if (input.collisions.length > 0 || input.fitFailed) notes.push("Con questi ostacoli la pergola non sta nello spazio indicato.")
    notes.push(REVIEW_NOTE)
  }
  return notes
}
