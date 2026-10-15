import { assemblyBounds, flatFloor, pieceAabb } from "@/domain/assembly/bounds"
import type { Assembly, ParamValue } from "@/domain/components/types"
import { boxOfPlan, planFromDiagonals, PlanMeasuresError, type EnvelopePlan } from "@/domain/envelope/plan"
import { parseEnvelope, type Envelope, type EnvelopeInput, type Obstacle } from "@/domain/envelope/types"
import type { RuleSet } from "@/domain/rules/types"
import { generate, getTypology } from "@/domain/typologies/registry"
import { defaultParams, type NumberParamSpec, type TypologyTemplate } from "@/domain/typologies/template"
import { dimensionParam, prepareAssembly, type PreparedAssembly } from "@/lib/preventivo/pipeline"
import type { ConfigFile } from "@/stores/config-file"
import { clampMeasure, measureFields, OBSTACLE_INFO, type SimpleObstacle, type SpaceAnswers, type WizardAnswers } from "./answers"
import { simpleNotes } from "./notes"

/**
 * Dalle risposte del wizard alla configurazione del dominio (12.1, P9). Funzione pura:
 *
 * - centimetri → millimetri; parametri del **preset di riferimento** della tipologia
 *   (`answers.tipologia.baseParams`) con le misure del cliente sopra;
 * - campate scelte in automatico con il passo del preset ("oltre 6 m serve un pilastro in
 *   più");
 * - ingombro: pianta fuori squadra da `planFromDiagonals` o rettangolo che contiene la
 *   pergola (con il muro a filo per le addossate), pavimento in pendenza, ostacoli
 *   semplificati tradotti in `Obstacle` con valori di default per tipo;
 * - poi **sempre** adattamento all'ingombro e auto-dimensionamento (`prepareAssembly`,
 *   lo stesso flusso della stima sul server), collisioni, regole e note semplici.
 *
 * Il risultato contiene il file di configurazione (`ConfigFile`, con `commercial`) da
 * mandare a `POST /api/preventivo/stima` e da salvare con la richiesta.
 */

export interface PostsInfo {
  /** Numero di pilastri dell'assieme. */
  readonly count: number
  /** Distanza massima tra due pilastri vicini lungo il fronte (cm), `null` con un solo allineamento. */
  readonly spacingCm: number | null
  /** Misura (mm) oltre la quale serve un pilastro in più, se la tipologia aggiunge campate. */
  readonly nextPostAboveMm: number | null
  /** Quale misura aggiunge campate (`larghezza` o `profondita`). */
  readonly axis: "larghezza" | "profondita" | null
  /** Pilastri aggiunti da una campata in più (1 per le addossate, 2 per le autoportanti). */
  readonly extraPosts: number
}

/** File di configurazione prodotto dal wizard (`ConfigFileSchema`, con parametri e finiture sempre presenti). */
export type WizardConfigFile = ConfigFile & {
  readonly params: Record<string, number | string | boolean>
  readonly commercial: NonNullable<ConfigFile["commercial"]>
}

export interface WizardDerived {
  /** File di configurazione **dopo** adattamento e dimensionamento; `null` senza tipologia o se non generabile. */
  readonly config: WizardConfigFile | null
  readonly prepared: PreparedAssembly | null
  readonly envelope: Envelope | null
  readonly plan: EnvelopePlan | null
  /** Misure delle diagonali non coerenti (messaggio semplice per il passo spazio). */
  readonly planError: string | null
  readonly notes: readonly string[]
  readonly posts: PostsInfo | null
  /** Configurazione non generabile con queste risposte (messaggio per il cliente). */
  readonly error: string | null
}

export const EMPTY_DERIVED: WizardDerived = { config: null, prepared: null, envelope: null, plan: null, planError: null, notes: [], posts: null, error: null }

export const NOT_BUILDABLE = "Con queste misure il modello non si può costruire: prova a cambiarle oppure contattaci."
export const PLAN_ERROR = "Le misure dello spazio non tornano: ricontrolla le due diagonali (oppure scegli «Non so»)."

const ceil10 = (mm: number) => Math.ceil(mm / 10) * 10
const ceil100 = (mm: number) => Math.ceil(mm / 100) * 100
/** Spazio lasciato tra il legno e il muro quando l'ingombro è ricavato dalla pergola (mm). */
const WALL_GAP = 50

const isWallTypology = (t: Pick<TypologyTemplate, "category" | "wallPlanes">) => t.category === "addossata"

const pillars = (assembly: Assembly) => assembly.pieces.filter((p) => p.type === "pilastro")

function distinctCentres(assembly: Assembly, axis: "x" | "y"): number[] {
  const set = new Set<number>()
  for (const p of pillars(assembly)) {
    const b = pieceAabb(p)
    set.add(Math.round((b.min[axis] + b.max[axis]) / 20) * 10)
  }
  return [...set].sort((a, b) => a - b)
}

interface CampateInfo {
  readonly axis: "larghezza" | "profondita"
  readonly pitch: number
  readonly extraPosts: number
}
const campateCache = new Map<string, CampateInfo | null>()

/**
 * Lungo quale misura il parametro `campate` aggiunge pilastri, con quale passo (dal preset:
 * misura / campate) e quanti pilastri aggiunge una campata in più. Calcolato una volta per
 * tipologia e preset generando la tipologia con una campata in più.
 */
function campateInfo(template: TypologyTemplate, base: Readonly<Record<string, ParamValue>>): CampateInfo | null {
  const spec = template.params.find((p): p is NumberParamSpec => p.name === "campate" && p.kind === "number")
  if (!spec) return null
  const key = `${template.slug}:${JSON.stringify(base)}`
  if (campateCache.has(key)) return campateCache.get(key)!
  let info: CampateInfo | null = null
  try {
    const c = typeof base.campate === "number" ? base.campate : spec.default
    if (c + 1 <= spec.max) {
      const a = generate(template.slug, base)
      const b = generate(template.slug, { ...base, campate: c + 1 })
      const dx = distinctCentres(b, "x").length - distinctCentres(a, "x").length
      const dy = distinctCentres(b, "y").length - distinctCentres(a, "y").length
      const axis = dx > 0 ? "larghezza" : dy > 0 ? "profondita" : null
      const dimValue = axis ? base[dimensionParam(template, axis)] : undefined
      if (axis && typeof dimValue === "number") info = { axis, pitch: dimValue / c, extraPosts: pillars(b).length - pillars(a).length }
    }
  } catch {
    info = null
  }
  campateCache.set(key, info)
  return info
}

/** Campate per la misura: tante quante servono per non superare il passo del preset. */
export function campateFor(info: CampateInfo, dimMm: number, spec: NumberParamSpec): number {
  const n = Math.max(1, Math.ceil((dimMm - 1) / info.pitch))
  return Math.min(spec.max, Math.max(spec.min, n))
}

function floorCorners(space: SpaceAnswers): NonNullable<EnvelopeInput["floor"]>["corners"] {
  if (space.floor !== "dislivello" || !(space.floorDrop > 0)) return {}
  const d = -Math.round(space.floorDrop * 10)
  switch (space.floorDirection) {
    case "fronte":
      return { frontLeft: d, frontRight: d }
    case "muro":
      return { backLeft: d, backRight: d }
    case "sinistra":
      return { frontLeft: d, backLeft: d }
    case "destra":
      return { frontRight: d, backRight: d }
  }
}

/** Ostacolo del cliente → ostacolo del dominio sul lato del muro (valori di default per tipo). */
export type ObstacleInput = NonNullable<EnvelopeInput["obstacles"]>[number]

export function toObstacle(o: SimpleObstacle, boxHeight: number): ObstacleInput {
  const info = OBSTACLE_INFO[o.kind]
  const mm = (cm: number, min = 0) => Math.max(min, Math.round((Number.isFinite(cm) ? cm : 0) * 10))
  const has = (f: (typeof info.fields)[number]) => info.fields.includes(f)
  const projection = mm(has("projection") ? o.projection : info.defaults.projection, 10)
  const base = { id: o.id, side: "posteriore" as const, label: info.label, projection }
  switch (o.kind) {
    // grondaia e balcone: sopra c'è il tetto o il balcone, quindi lo spazio è occupato fino in cima
    case "grondaia":
      return { ...base, type: "grondaia", elevation: mm(o.elevation), height: Math.max(10, boxHeight - mm(o.elevation)) }
    case "balcone":
      return { ...base, type: "sporgenza", elevation: mm(o.elevation), height: Math.max(10, boxHeight - mm(o.elevation)) }
    case "pluviale":
      return { ...base, type: "generico", offset: mm(o.fromLeft), width: mm(info.defaults.width, 10), elevation: 0, height: Math.max(10, boxHeight) }
    case "porta":
      return { ...base, type: "finestra", offset: mm(o.fromLeft), width: mm(o.width, 10), elevation: 0, height: mm(o.height, 10) }
    case "finestra":
      return { ...base, type: "finestra", offset: mm(o.fromLeft), width: mm(o.width, 10), elevation: mm(o.elevation), height: mm(o.height, 10) }
    case "altro":
      return { ...base, type: "generico", offset: mm(o.fromLeft), width: mm(o.width, 10), elevation: mm(o.elevation), height: mm(o.height, 10) }
  }
}

/** Parametri della configurazione: preset + misure del cliente (mm) + campate automatiche. */
export function paramsFor(template: TypologyTemplate, answers: WizardAnswers): Record<string, ParamValue> {
  const base = { ...defaultParams(template), ...answers.tipologia.baseParams }
  const params: Record<string, ParamValue> = { ...base }
  for (const f of measureFields(template)) {
    const cm = answers.misure[f.key]
    if (typeof cm === "number") params[f.param] = clampMeasure(f, cm).value * 10
  }
  const info = campateInfo(template, base)
  const spec = template.params.find((p): p is NumberParamSpec => p.name === "campate" && p.kind === "number")
  if (info && spec) {
    const dim = params[dimensionParam(template, info.axis)]
    if (typeof dim === "number") params.campate = campateFor(info, dim, spec)
  }
  return params
}

function postsInfo(template: TypologyTemplate, answers: WizardAnswers, assembly: Assembly, params: Readonly<Record<string, ParamValue>>): PostsInfo {
  const xs = distinctCentres(assembly, "x")
  const gaps = xs.slice(1).map((x, i) => x - xs[i]!)
  const base = { ...defaultParams(template), ...answers.tipologia.baseParams }
  const info = campateInfo(template, base)
  const spec = template.params.find((p): p is NumberParamSpec => p.name === "campate" && p.kind === "number")
  const campate = typeof params.campate === "number" ? params.campate : null
  const next = info && spec && campate !== null && campate < spec.max ? Math.round(info.pitch * campate) : null
  return {
    count: pillars(assembly).length,
    spacingCm: gaps.length ? Math.round(Math.max(...gaps) / 10) : null,
    nextPostAboveMm: next,
    axis: info?.axis ?? null,
    extraPosts: info?.extraPosts ?? 0,
  }
}

/** Ingombro dalle risposte: pianta dalle diagonali o rettangolo che contiene la pergola richiesta. */
function envelopeFor(
  template: TypologyTemplate,
  answers: WizardAnswers,
  params: Record<string, ParamValue>,
): { envelope: Envelope; plan: EnvelopePlan | null; planError: string | null } {
  const space = answers.spazio
  const wall = space.againstWall || isWallTypology(template)
  let plan: EnvelopePlan | null = null
  let planError: string | null = null
  if (wall && space.wallShape === "diagonali") {
    const d = space.diagonals
    try {
      plan = planFromDiagonals({ front: d.front * 10, back: d.back * 10, left: d.left * 10, right: d.right * 10, d1: d.d1 * 10, d2: d.d2 * 10 })
    } catch (e) {
      if (!(e instanceof PlanMeasuresError)) throw e
      planError = PLAN_ERROR
    }
  }
  if (plan && isWallTypology(template)) {
    // la pergola addossata arriva al muro: profondità dalla pianta, l'adattamento la porta a filo
    const name = dimensionParam(template, "profondita")
    const spec = template.params.find((p): p is NumberParamSpec => p.name === name && p.kind === "number")
    if (spec) params[name] = Math.min(spec.max, Math.max(spec.min, Math.round(boxOfPlan(plan, 1).depth)))
  }
  // pergola richiesta su pavimento piano: misura del rettangolo che la contiene
  const probe = generate(template.slug, params, { floorHeightAt: flatFloor })
  const bounds = assemblyBounds(probe)
  const maxX = bounds?.max.x ?? 1000
  const maxY = bounds?.max.y ?? 1000
  const maxZ = bounds?.max.z ?? 3000
  const obstacleTop = Math.max(0, ...(wall ? space.obstacles : []).map((o) => (o.elevation + (OBSTACLE_INFO[o.kind].fields.includes("height") ? o.height : OBSTACLE_INFO[o.kind].defaults.height)) * 10))
  const floorDrop = space.floor === "dislivello" ? Math.max(0, space.floorDrop * 10) : 0
  const height = Math.max(ceil100(maxZ + floorDrop) + 500, ceil100(obstacleTop) + 100)
  const box = plan ? boxOfPlan(plan, height) : { width: ceil10(maxX + 10), depth: wall ? ceil10(maxY + WALL_GAP) : ceil100(maxY) + 100, height }
  const obstacles = wall ? space.obstacles.map((o) => toObstacle(o, height)) : []
  const envelope = parseEnvelope({
    box,
    ...(plan ? { plan } : {}),
    wallSide: "posteriore",
    obstacles,
    floor: { corners: floorCorners(space), points: [] },
  })
  return { envelope, plan, planError }
}

export function toConfig(answers: WizardAnswers, ruleSet: RuleSet): WizardDerived {
  const slug = answers.tipologia.slug
  if (!slug) return EMPTY_DERIVED
  let template: TypologyTemplate
  try {
    template = getTypology(slug)
  } catch {
    return { ...EMPTY_DERIVED, error: NOT_BUILDABLE }
  }
  let envelope: Envelope
  let plan: EnvelopePlan | null
  let planError: string | null
  let params: Record<string, ParamValue>
  try {
    params = paramsFor(template, answers)
    ;({ envelope, plan, planError } = envelopeFor(template, answers, params))
  } catch {
    return { ...EMPTY_DERIVED, error: NOT_BUILDABLE }
  }
  let prepared: PreparedAssembly
  try {
    prepared = prepareAssembly({ typology: slug, params, envelope, embedment: 0 }, ruleSet)
  } catch {
    return { ...EMPTY_DERIVED, envelope, plan, planError, error: NOT_BUILDABLE }
  }
  const space = answers.spazio
  const wall = space.againstWall || isWallTypology(template)
  const notes = simpleNotes({
    violations: prepared.violations,
    collisions: prepared.collisions,
    fitLimits: prepared.fitAdjustments,
    fitFailed: prepared.fitFailed,
    autosize: prepared.autosize,
    ...(plan ? { plan } : {}),
    obstacles: envelope.obstacles as Obstacle[],
    squareUnknown: wall && space.wallShape === "nonso",
  })
  const f = answers.finiture
  const config: WizardConfigFile = {
    schemaVersion: 1,
    typology: slug,
    params: prepared.config.params as Record<string, number | string | boolean>,
    envelope: envelope as ConfigFile["envelope"],
    embedment: 0,
    commercial: { species: f.species, quality: f.quality, treatment: f.treatment, covering: f.covering, access: space.access },
  }
  return { config, prepared, envelope, plan, planError, notes, posts: postsInfo(template, answers, prepared.assembly, prepared.config.params), error: null }
}
