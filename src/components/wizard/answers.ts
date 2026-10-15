import type { ParamValue } from "@/domain/components/types"
import type { FitDimension } from "@/domain/envelope/fit"
import type { NumberParamSpec, TypologyTemplate } from "@/domain/typologies/template"
import { dimensionParam } from "@/lib/preventivo/pipeline"

/**
 * Risposte del wizard del preventivo (P9): domande semplici in **centimetri**, una sezione
 * per passo. Solo dati serializzabili (persistiti in `sessionStorage`): la traduzione nel
 * dominio (mm, ingombro, ostacoli) è di `to-config.ts`.
 */

export const WIZARD_STEPS = ["tipologia", "misure", "spazio", "finiture", "riepilogo", "contatti"] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

export const STEP_LABELS: Readonly<Record<WizardStep, string>> = {
  tipologia: "Modello",
  misure: "Misure",
  spazio: "Spazio",
  finiture: "Finiture",
  riepilogo: "Prezzo",
  contatti: "Contatti",
}

/** Percorso del passo: `/preventivo` (passo 1) e `/preventivo/<passo>` per gli altri. */
export const stepPath = (step: WizardStep): string => (step === "tipologia" ? "/preventivo" : `/preventivo/${step}`)
export const stepIndex = (step: WizardStep): number => WIZARD_STEPS.indexOf(step)
export function stepFromSegments(segments: readonly string[] | undefined): WizardStep | null {
  if (!segments || segments.length === 0) return "tipologia"
  if (segments.length > 1) return null
  const s = segments[0] as WizardStep
  return WIZARD_STEPS.includes(s) && s !== "tipologia" ? s : null
}

export type WallShape = "dritto" | "diagonali" | "nonso"
export type FloorSlope = "piano" | "dislivello"
/** Dove il pavimento è più basso. */
export type FloorDirection = "fronte" | "muro" | "sinistra" | "destra"
export type AccessLevel = "facile" | "medio" | "difficile"
export const OBSTACLE_KINDS = ["grondaia", "finestra", "porta", "pluviale", "balcone", "altro"] as const
export type ObstacleKind = (typeof OBSTACLE_KINDS)[number]

/** Ostacolo descritto dal cliente (cm). I campi significativi dipendono dal tipo (`OBSTACLE_FIELDS`). */
export interface SimpleObstacle {
  readonly id: string
  readonly kind: ObstacleKind
  /** Distanza dal bordo sinistro del muro (cm). */
  readonly fromLeft: number
  /** Larghezza (cm). */
  readonly width: number
  /** Altezza da terra del bordo inferiore (cm). */
  readonly elevation: number
  /** Altezza dell'ostacolo (cm). */
  readonly height: number
  /** Quanto sporge dal muro (cm). */
  readonly projection: number
}

export type ObstacleField = "fromLeft" | "width" | "elevation" | "height" | "projection"

export interface ObstacleKindInfo {
  readonly label: string
  /** Con articolo, per le note: "la grondaia". */
  readonly withArticle: string
  readonly hint: string
  readonly fields: readonly ObstacleField[]
  /** Valori iniziali (cm). */
  readonly defaults: Omit<SimpleObstacle, "id" | "kind">
  /** `true` se sta sopra la pergola (le note dicono "passare sotto"). */
  readonly above: boolean
}

export const OBSTACLE_INFO: Readonly<Record<ObstacleKind, ObstacleKindInfo>> = {
  grondaia: {
    label: "Grondaia",
    withArticle: "la grondaia",
    hint: "Misura da terra al bordo più basso della grondaia e quanto sporge dal muro.",
    fields: ["elevation", "projection"],
    defaults: { fromLeft: 0, width: 0, elevation: 270, height: 15, projection: 15 },
    above: true,
  },
  balcone: {
    label: "Balcone sopra",
    withArticle: "il balcone",
    hint: "Misura da terra al fondo del balcone e quanto sporge dal muro.",
    fields: ["elevation", "projection"],
    defaults: { fromLeft: 0, width: 0, elevation: 280, height: 30, projection: 120 },
    above: true,
  },
  finestra: {
    label: "Finestra",
    withArticle: "la finestra",
    hint: "Indica dove si trova sul muro: distanza dal bordo sinistro, larghezza e altezza da terra.",
    fields: ["fromLeft", "width", "elevation", "height"],
    defaults: { fromLeft: 100, width: 120, elevation: 100, height: 140, projection: 10 },
    above: false,
  },
  porta: {
    label: "Porta",
    withArticle: "la porta",
    hint: "Indica la distanza dal bordo sinistro del muro, la larghezza e l'altezza della porta.",
    fields: ["fromLeft", "width", "height"],
    defaults: { fromLeft: 100, width: 90, elevation: 0, height: 220, projection: 10 },
    above: false,
  },
  pluviale: {
    label: "Pluviale",
    withArticle: "il pluviale",
    hint: "Il tubo che scende dalla grondaia: distanza dal bordo sinistro del muro.",
    fields: ["fromLeft", "projection"],
    defaults: { fromLeft: 0, width: 12, elevation: 0, height: 0, projection: 12 },
    above: false,
  },
  altro: {
    label: "Altro",
    withArticle: "l'ostacolo",
    hint: "Qualunque cosa sporga dal muro: posizione, dimensioni e quanto sporge.",
    fields: ["fromLeft", "width", "elevation", "height", "projection"],
    defaults: { fromLeft: 100, width: 50, elevation: 150, height: 50, projection: 20 },
    above: false,
  },
}

export const OBSTACLE_FIELD_LABELS: Readonly<Record<ObstacleField, string>> = {
  fromLeft: "Distanza dal bordo sinistro",
  width: "Larghezza",
  elevation: "Altezza da terra",
  height: "Altezza",
  projection: "Quanto sporge dal muro",
}

/** Misure dello spazio con il metodo delle diagonali (cm): fronte, muro, lati e due diagonali. */
export interface DiagonalMeasures {
  readonly front: number
  readonly back: number
  readonly left: number
  readonly right: number
  /** Anteriore sinistro → posteriore destro. */
  readonly d1: number
  /** Anteriore destro → posteriore sinistro. */
  readonly d2: number
}

export interface TypologyAnswer {
  readonly slug: string | null
  /** Preset di riferimento applicato (id) e suoi parametri: il punto di partenza della configurazione. */
  readonly presetId: string | null
  readonly baseParams: Readonly<Record<string, ParamValue>>
}

/** Misure della pergola in cm: chiave = dimensione (`larghezza`, `profondita`, `altezza`) o parametro (`larghezzaA`). */
export type MeasureAnswers = Readonly<Record<string, number>>

export interface SpaceAnswers {
  readonly againstWall: boolean
  readonly wallShape: WallShape
  readonly diagonals: DiagonalMeasures
  readonly floor: FloorSlope
  readonly floorDrop: number
  readonly floorDirection: FloorDirection
  readonly obstacles: readonly SimpleObstacle[]
  readonly access: AccessLevel
}

export interface FinishAnswers {
  readonly species: string
  readonly quality: string
  readonly treatment: string | null
  /** Tinta scelta (solo per i trattamenti colorati): va nelle note della richiesta. */
  readonly tint: string | null
  readonly covering: string | null
}

export interface ContactDraft {
  readonly name: string
  readonly email: string
  readonly phone: string
  readonly cap: string
  readonly comune: string
  readonly notes: string
}

export interface WizardAnswers {
  readonly tipologia: TypologyAnswer
  readonly misure: MeasureAnswers
  readonly spazio: SpaceAnswers
  readonly finiture: FinishAnswers
  readonly contatti: ContactDraft
}

export const EMPTY_DIAGONALS: DiagonalMeasures = { front: 0, back: 0, left: 0, right: 0, d1: 0, d2: 0 }

export const DEFAULT_ANSWERS: WizardAnswers = {
  tipologia: { slug: null, presetId: null, baseParams: {} },
  misure: {},
  spazio: {
    againstWall: true,
    wallShape: "dritto",
    diagonals: EMPTY_DIAGONALS,
    floor: "piano",
    floorDrop: 0,
    floorDirection: "fronte",
    obstacles: [],
    access: "facile",
  },
  finiture: { species: "abete", quality: "lamellare", treatment: null, tint: null, covering: null },
  contatti: { name: "", email: "", phone: "", cap: "", comune: "", notes: "" },
}

// ---------------------------------------------------------------------------
// Misure: quali dimensioni chiedere per la tipologia, con limiti in cm

export interface MeasureField {
  /** Chiave nelle risposte (dimensione o nome del parametro). */
  readonly key: string
  /** Parametro reale del template. */
  readonly param: string
  readonly label: string
  readonly hint: string
  readonly minCm: number
  readonly maxCm: number
}

const DIMENSION_COPY: Readonly<Record<FitDimension, { label: string; hint: string }>> = {
  larghezza: { label: "Larghezza", hint: "Lungo il fronte, da un pilastro esterno all'altro." },
  profondita: { label: "Profondità", hint: "Dal fronte fino al muro (o al lato opposto)." },
  altezza: { label: "Altezza sotto trave", hint: "Lo spazio libero per passare, da terra alla trave." },
}

const EXTRA_WIDTHS: Readonly<Record<string, { label: string; hint: string }>> = {
  larghezzaA: { label: "Lato A", hint: "Il primo lato della L, lungo il primo muro." },
  larghezzaB: { label: "Lato B", hint: "Il secondo lato della L, lungo l'altro muro." },
}

const cmRange = (spec: NumberParamSpec) => ({ minCm: Math.ceil(spec.min / 10), maxCm: Math.floor(spec.max / 10) })

/** Campi del passo misure per la tipologia: larghezza (o lati A/B), profondità o sbalzo, altezza. */
export function measureFields(template: TypologyTemplate): MeasureField[] {
  const spec = (name: string) => template.params.find((p): p is NumberParamSpec => p.name === name && p.kind === "number" && p.unit === "mm")
  const out: MeasureField[] = []
  const widthSpec = spec(dimensionParam(template, "larghezza"))
  if (widthSpec) out.push({ key: "larghezza", param: widthSpec.name, ...DIMENSION_COPY.larghezza, ...cmRange(widthSpec) })
  for (const [name, copy] of Object.entries(EXTRA_WIDTHS)) {
    const s = spec(name)
    if (s) out.push({ key: name, param: name, ...copy, ...cmRange(s) })
  }
  const depthName = dimensionParam(template, "profondita")
  const depthSpec = spec(depthName)
  if (depthSpec)
    out.push({
      key: "profondita",
      param: depthName,
      ...(depthName === "profondita" ? DIMENSION_COPY.profondita : { label: "Sbalzo", hint: "Quanto sporge la pensilina dal muro." }),
      ...cmRange(depthSpec),
    })
  const heightSpec = spec(dimensionParam(template, "altezza"))
  if (heightSpec) out.push({ key: "altezza", param: heightSpec.name, ...DIMENSION_COPY.altezza, ...cmRange(heightSpec) })
  return out
}

/** Misure iniziali (cm) dai parametri del preset (o dai default del template). */
export function measuresFromParams(template: TypologyTemplate, params: Readonly<Record<string, ParamValue>>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of measureFields(template)) {
    const spec = template.params.find((p) => p.name === f.param) as NumberParamSpec
    const v = params[f.param]
    out[f.key] = Math.round((typeof v === "number" ? v : spec.default) / 10)
  }
  return out
}

/** Valore limitato all'intervallo del campo: `limited` se è stato fermato al massimo o al minimo. */
export function clampMeasure(field: Pick<MeasureField, "minCm" | "maxCm">, value: number): { value: number; limited: "max" | "min" | null } {
  if (!Number.isFinite(value)) return { value: field.minCm, limited: "min" }
  if (value > field.maxCm) return { value: field.maxCm, limited: "max" }
  if (value < field.minCm) return { value: field.minCm, limited: "min" }
  return { value: Math.round(value), limited: null }
}

export const newObstacle = (kind: ObstacleKind, id: string): SimpleObstacle => ({ id, kind, ...OBSTACLE_INFO[kind].defaults })
