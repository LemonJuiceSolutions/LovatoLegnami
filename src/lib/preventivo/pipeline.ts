import type { Assembly, ParamValue } from "@/domain/components/types"
import { checkCollisions, type Collision } from "@/domain/envelope/collisions"
import { fitToEnvelope, FIT_DIMENSIONS, type FitCause, type FitDimension, type FitLimit } from "@/domain/envelope/fit"
import { floorFunction } from "@/domain/envelope/floor"
import { wallBuildOptions } from "@/domain/envelope/plan"
import type { Envelope } from "@/domain/envelope/types"
import { autoSize, type Proposal } from "@/domain/rules/autosize"
import { evaluateRules } from "@/domain/rules/engine"
import type { RuleSet, Violation } from "@/domain/rules/types"
import { generate, getTypology } from "@/domain/typologies/registry"
import type { NumberParamSpec, TypologyTemplate } from "@/domain/typologies/template"

/**
 * Flusso del preventivo pubblico (P9), **puro e condiviso** tra il wizard nel browser e la
 * stima sul server (`server/quotes/pipeline.ts`): dalla configurazione all'assieme da
 * prezzare con adattamento all'ingombro e auto-dimensionamento sempre applicati (il
 * cliente non sceglie le sezioni).
 *
 * 1. assieme dalla configurazione; se collide con l'ingombro o gli ostacoli,
 *    `fitToEnvelope` sulle sole dimensioni (altri parametri bloccati) **senza mai superare
 *    le misure chieste** (il massimo di ogni dimensione è il valore della configurazione:
 *    l'adattamento riduce, non allarga la pergola fino a riempire lo spazio);
 * 2. `autoSize` ripetuto finché propone modifiche (max 3 passate);
 * 3. assieme finale, collisioni e violazioni residue.
 *
 * Importa solo sottomoduli del dominio (mai il barile `@/domain`, che porterebbe il
 * listino seed nel bundle del wizard). Deterministico e idempotente: una configurazione
 * già adattata e dimensionata ritorna identica.
 */

/** Configurazione minima per rigenerare l'assieme (sottoinsieme di `ConfiguratoreConfig`). */
export interface AssemblyConfig {
  readonly typology: string
  readonly params: Readonly<Record<string, ParamValue>>
  readonly envelope: Envelope
  readonly embedment: number
}

/**
 * Assieme dalla configurazione come nel configuratore (`computeDerived`): pavimento reale,
 * affondamento e muri reali della pianta (`wallBuildOptions`). Il server **non** si fida
 * dell'assieme del client: lo rigenera sempre da qui.
 */
export function assemblyFromConfig(config: AssemblyConfig): Assembly {
  const template = getTypology(config.typology)
  return generate(config.typology, config.params, {
    floorHeightAt: floorFunction(config.envelope),
    embedment: config.embedment,
    ...wallBuildOptions(template, config.envelope),
  })
}

/** Dimensione ridotta dall'adattamento all'ingombro. */
export interface FitAdjustment {
  readonly dimension: FitDimension
  /** Nome reale del parametro (es. `sbalzo` per la profondità della pensilina). */
  readonly param: string
  readonly from: number
  readonly to: number
  readonly cause?: FitCause
}

export interface PreparedAssembly {
  readonly config: AssemblyConfig
  readonly assembly: Assembly
  readonly collisions: readonly Collision[]
  readonly violations: readonly Violation[]
  /** Dimensioni ridotte per stare nello spazio (vuoto se non serviva o non è riuscito). */
  readonly fitAdjustments: readonly FitAdjustment[]
  /** Limiti trovati dall'adattamento (vuoto se non è stato tentato). */
  readonly fitLimits: readonly FitLimit[]
  /** `true` se serviva l'adattamento ma nessuna misura entro quelle chieste evita gli ostacoli. */
  readonly fitFailed: boolean
  /** Proposte dell'auto-dimensionamento applicate (tutte le passate). */
  readonly autosize: readonly Proposal[]
  /** `true` se restano collisioni o violazioni bloccanti: serve la verifica dell'ufficio. */
  readonly needsReview: boolean
}

/** Nome reale del parametro di una dimensione (alias della tipologia, es. profondità → sbalzo). */
export const dimensionParam = (template: Pick<TypologyTemplate, "fitAliases">, dim: FitDimension): string => template.fitAliases?.[dim] ?? dim

/** Template con il massimo delle dimensioni pari ai valori chiesti (l'adattamento non allarga). */
function cappedTemplate(template: TypologyTemplate, params: Readonly<Record<string, ParamValue>>): TypologyTemplate {
  const caps = new Map<string, number>()
  for (const d of FIT_DIMENSIONS) {
    const name = dimensionParam(template, d)
    const v = params[name]
    if (typeof v === "number") caps.set(name, v)
  }
  return {
    ...template,
    params: template.params.map((p) => {
      const cap = caps.get(p.name)
      if (p.kind !== "number" || cap === undefined) return p
      const spec = p as NumberParamSpec
      return { ...spec, max: Math.max(spec.min, Math.min(spec.max, cap)) }
    }),
  }
}

export function prepareAssembly(input: AssemblyConfig, ruleSet: RuleSet): PreparedAssembly {
  const template = getTypology(input.typology)
  const floorHeightAt = floorFunction(input.envelope)
  let params: Record<string, ParamValue> = { ...input.params }
  const build = () => assemblyFromConfig({ ...input, params })
  const dimParams = new Map(FIT_DIMENSIONS.map((d) => [dimensionParam(template, d), d] as const))

  let assembly = build()
  const fitAdjustments: FitAdjustment[] = []
  let fitLimits: readonly FitLimit[] = []
  let fitFailed = false
  if (checkCollisions(assembly, input.envelope).length > 0) {
    const locked = Object.fromEntries(Object.entries(params).filter(([k]) => !dimParams.has(k)))
    const fit = fitToEnvelope(cappedTemplate(template, params), input.envelope, locked, ruleSet, 50, { embedment: input.embedment })
    if (fit.ok) {
      fitLimits = fit.limits
      for (const [name, dim] of dimParams) {
        const from = params[name]
        const to = fit.params[name]
        if (typeof from === "number" && typeof to === "number" && to !== from)
          fitAdjustments.push({ dimension: dim, param: name, from, to, cause: fit.limits.find((l) => l.param === dim)?.cause })
      }
      params = { ...params, ...fit.params }
      assembly = build()
    } else {
      fitFailed = true
      fitLimits = fit.limits
    }
  }

  const autosize: Proposal[] = []
  for (let pass = 0; pass < 3; pass++) {
    const sized = autoSize(assembly, ruleSet, undefined, { floorHeightAt })
    const changes = sized.proposals.filter((p) => params[p.param] !== p.to)
    if (changes.length === 0) break
    for (const p of changes) params[p.param] = p.to
    autosize.push(...changes)
    assembly = build()
  }

  const collisions = checkCollisions(assembly, input.envelope)
  const { violations } = evaluateRules(assembly, ruleSet, { floorHeightAt })
  const needsReview = collisions.length > 0 || violations.some((v) => v.severity === "errore")
  return { config: { ...input, params }, assembly, collisions, violations, fitAdjustments, fitLimits, fitFailed, autosize, needsReview }
}
