import {
  DEFAULT_LOVATO_RULES,
  FIT_DIMENSIONS,
  SECTION_CATALOG,
  autoSize,
  fitToEnvelope,
  floorFunction,
  getTypology,
  type Assembly,
  type ParamSpec,
  type ParamValue,
  type RuleSet,
} from "@/domain"
import type { ConfiguratoreConfig } from "@/stores/config"
import { formatNumberInput, unitLabel } from "./form-helpers"

/**
 * Logica pura del pannello esiti: riepilogo delle modifiche proposte da
 * "Auto-dimensiona" (`autoSize`) e "Adatta all'ingombro" (`fitToEnvelope`)
 * prima di applicarle al form.
 */

export interface ParamChange {
  readonly param: string
  readonly label: string
  readonly from: string
  readonly to: string
}

export type Review =
  | {
      readonly kind: "changes"
      readonly title: string
      /** Modifiche da confermare (vuoto = nulla da cambiare). */
      readonly changes: readonly ParamChange[]
      /** Parametri da scrivere nello store con `setParams`. */
      readonly patch: Readonly<Record<string, ParamValue>>
      /** Note informative (limiti raggiunti, violazioni non risolvibili). */
      readonly notes: readonly string[]
    }
  | {
      readonly kind: "none"
      readonly title: string
      readonly message: string
      /** Regole, ostacoli o collisioni bloccanti. */
      readonly causes: readonly string[]
    }

/** Valore leggibile di un parametro (con unità). */
export function formatParamValue(spec: ParamSpec | undefined, value: ParamValue | undefined): string {
  if (value === undefined) return "—"
  if (typeof value === "boolean") return value ? "sì" : "no"
  if (typeof value === "number") {
    const u = spec?.kind === "number" ? unitLabel(spec.unit) : ""
    return `${formatNumberInput(Math.round(value * 100) / 100)}${u ? ` ${u}` : ""}`
  }
  return spec?.kind === "section" ? `${value} mm` : value
}

function diff(
  config: ConfiguratoreConfig,
  target: Readonly<Record<string, ParamValue>>,
  names: readonly string[]
): { changes: ParamChange[]; patch: Record<string, ParamValue> } {
  const template = getTypology(config.typology)
  const specs = new Map(template.params.map((p) => [p.name, p]))
  const changes: ParamChange[] = []
  const patch: Record<string, ParamValue> = {}
  for (const name of names) {
    const spec = specs.get(name)
    const from = config.params[name] ?? spec?.default
    const to = target[name]
    if (to === undefined || to === from) continue
    patch[name] = to
    changes.push({ param: name, label: spec?.label ?? name, from: formatParamValue(spec, from), to: formatParamValue(spec, to) })
  }
  return { changes, patch }
}

/** Proposte di auto-dimensionamento per l'assieme corrente. */
export function reviewAutoSize(
  config: ConfiguratoreConfig,
  assembly: Assembly | null,
  ruleSet: RuleSet = DEFAULT_LOVATO_RULES
): Review {
  const title = "Auto-dimensiona"
  if (!assembly) return { kind: "none", title, message: "Nessun assieme valido da dimensionare.", causes: [] }
  const result = autoSize(assembly, ruleSet, SECTION_CATALOG, { floorHeightAt: floorFunction(config.envelope) })
  const { changes, patch } = diff(config, result.params, result.proposals.map((p) => p.param))
  const unresolved = result.unresolved.filter((v) => v.severity === "errore").map((v) => v.message)
  if (changes.length === 0)
    return {
      kind: "none",
      title,
      message: unresolved.length > 0 ? "Nessuna modifica automatica risolve le violazioni rimaste." : "Nessuna violazione da risolvere: la configurazione è già dimensionata.",
      causes: unresolved,
    }
  return {
    kind: "changes",
    title,
    changes,
    patch,
    notes: [...result.proposals.map((p) => p.message), ...unresolved.map((m) => `Resta da risolvere: ${m}`)],
  }
}

/** Dimensioni (altezza, profondità, larghezza) adattate all'ingombro del cliente. */
export function reviewFit(config: ConfiguratoreConfig, ruleSet: RuleSet = DEFAULT_LOVATO_RULES): Review {
  const title = "Adatta all'ingombro"
  const locked: Record<string, ParamValue> = { ...config.params }
  for (const d of FIT_DIMENSIONS) delete locked[d]
  let result: ReturnType<typeof fitToEnvelope>
  try {
    result = fitToEnvelope(config.typology, config.envelope, locked, ruleSet, 50, { embedment: config.embedment })
  } catch (e) {
    return { kind: "none", title, message: e instanceof Error ? e.message : String(e), causes: [] }
  }
  if (!result.ok)
    return {
      kind: "none",
      title,
      message: result.message,
      causes: [
        ...result.violations.map((v) => `Regola: ${v.message}`),
        ...result.collisions.map((c) => `Collisione: ${c.message}`),
        ...result.limits.map((l) => l.message),
      ],
    }
  const { changes, patch } = diff(config, result.params, FIT_DIMENSIONS)
  return { kind: "changes", title, changes, patch, notes: result.limits.map((l) => l.message) }
}
