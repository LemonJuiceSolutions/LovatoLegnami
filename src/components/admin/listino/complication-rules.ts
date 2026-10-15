import { parseDecimal } from "@/domain/pricing/csv"
import { SITE_FACTOR_LABELS, SITE_FACTOR_UNITS } from "@/domain/pricing/site-factors"
import {
  ComplicationRuleSchema,
  ENUM_SITE_FACTORS,
  SITE_FACTOR_KEYS,
  type ComplicationEffectKind,
  type ComplicationOp,
  type ComplicationRule,
  type SiteFactorKey,
} from "@/domain/pricing/types"

/**
 * Regole di complicazione come frasi (P3, 9.3): "Se <fattore> <confronto> <soglia> [e …]
 * allora <effetto> <valore>". Conversione pura tra la regola del listino e lo stato del
 * form (testi digitati), con validazione dallo schema del dominio. Nessun parser di
 * espressioni: ogni parte è una scelta o un numero.
 */

export interface ConditionDraft {
  readonly factor: SiteFactorKey
  readonly op: ComplicationOp
  /** Soglia digitata (fattori numerici). */
  readonly number: string
  /** Valori scelti (accesso, ancoraggio). */
  readonly values: readonly string[]
}

export interface RuleDraft {
  /** Id stabile della regola (vuoto per una regola nuova: derivato dall'etichetta). */
  readonly id: string
  readonly label: string
  readonly enabled: boolean
  readonly conditions: readonly ConditionDraft[]
  readonly effect: ComplicationEffectKind
  /** Valore digitato: ore, percentuale o euro (per `fisso`). */
  readonly amount: string
  readonly explain: string
}

export const isEnumFactor = (f: SiteFactorKey): f is keyof typeof ENUM_SITE_FACTORS => f in ENUM_SITE_FACTORS
export const enumValues = (f: SiteFactorKey): readonly string[] => (isEnumFactor(f) ? ENUM_SITE_FACTORS[f] : [])

export const FACTOR_OPTIONS = SITE_FACTOR_KEYS.map((value) => ({ value, label: SITE_FACTOR_LABELS[value] }))
export const factorUnit = (f: SiteFactorKey): string => SITE_FACTOR_UNITS[f].trim()

export const NUMERIC_OPS: readonly { value: ComplicationOp; label: string }[] = [
  { value: ">", label: "maggiore di" },
  { value: ">=", label: "almeno" },
  { value: "==", label: "uguale a" },
]
export const ENUM_OPS: readonly { value: ComplicationOp; label: string }[] = [
  { value: "==", label: "è" },
  { value: "in", label: "è uno tra" },
]

export const EFFECT_OPTIONS: readonly { value: ComplicationEffectKind; label: string; unit: string }[] = [
  { value: "ore", label: "aggiungi ore di montaggio", unit: "ore" },
  { value: "percento-ore", label: "aumenta le ore di montaggio del", unit: "%" },
  { value: "fisso", label: "aggiungi un importo fisso di", unit: "€" },
  { value: "percento-legno", label: "aumenta il costo del legno del", unit: "%" },
]
export const effectUnit = (k: ComplicationEffectKind): string => EFFECT_OPTIONS.find((e) => e.value === k)?.unit ?? ""

const num = (n: number) => String(Math.round(n * 1e6) / 1e6).replace(".", ",")

export const emptyCondition = (): ConditionDraft => ({ factor: "floorRangeMm", op: ">=", number: "", values: [] })
export const emptyRule = (): RuleDraft => ({ id: "", label: "", enabled: true, conditions: [emptyCondition()], effect: "ore", amount: "", explain: "" })

/** Condizione con il fattore cambiato: confronto e valore ripartono dal tipo del fattore. */
export function withFactor(c: ConditionDraft, factor: SiteFactorKey): ConditionDraft {
  if (isEnumFactor(factor) === isEnumFactor(c.factor)) return { ...c, factor, values: isEnumFactor(factor) ? [] : c.values }
  return isEnumFactor(factor) ? { factor, op: "in", number: "", values: [] } : { factor, op: ">=", number: "", values: [] }
}

export function draftFromRule(rule: ComplicationRule): RuleDraft {
  return {
    id: rule.id,
    label: rule.label,
    enabled: rule.enabled,
    conditions: rule.conditions.map((c) => ({
      factor: c.factor,
      op: c.op,
      number: typeof c.value === "number" ? num(c.value) : "",
      values: Array.isArray(c.value) ? [...c.value] : typeof c.value === "string" ? [c.value] : [],
    })),
    effect: rule.effect.kind,
    amount: num(rule.effect.kind === "fisso" ? rule.effect.value / 100 : rule.effect.value),
    explain: rule.explain ?? "",
  }
}

/** Id kebab dall'etichetta: "Pavimento non in piano" → `pavimento-non-in-piano`. */
export function slugify(label: string): string {
  const s = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return s || "regola"
}

/** Id libero: `base`, poi `base-2`, `base-3`, … */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
}

export type RuleParse = { readonly ok: true; readonly rule: ComplicationRule } | { readonly ok: false; readonly errors: readonly string[] }

/** Regola del listino dal form, validata con lo schema del dominio. */
export function ruleFromDraft(d: RuleDraft, id: string = d.id || slugify(d.label)): RuleParse {
  const errors: string[] = []
  if (!d.label.trim()) errors.push("etichetta per il cliente obbligatoria")
  if (!d.conditions.length) errors.push("almeno una condizione")
  const conditions = d.conditions.map((c, i) => {
    const n = i + 1
    if (isEnumFactor(c.factor)) {
      if (!c.values.length) errors.push(`condizione ${n}: scegliere almeno un valore`)
      return c.op === "in" ? { factor: c.factor, op: "in" as const, value: [...c.values] } : { factor: c.factor, op: "==" as const, value: c.values[0] ?? "" }
    }
    const v = parseDecimal(c.number)
    if (v === undefined || v < 0) errors.push(`condizione ${n}: inserire una soglia numerica ≥ 0`)
    return { factor: c.factor, op: c.op === "in" ? (">=" as const) : c.op, value: v ?? 0 }
  })
  const amount = parseDecimal(d.amount)
  if (amount === undefined || amount < 0) errors.push("effetto: inserire un valore numerico ≥ 0")
  const value = d.effect === "fisso" ? Math.round((amount ?? 0) * 100) : (amount ?? 0)
  if (errors.length) return { ok: false, errors }
  const parsed = ComplicationRuleSchema.safeParse({
    id,
    label: d.label.trim(),
    enabled: d.enabled,
    conditions,
    effect: { kind: d.effect, value },
    ...(d.explain.trim() ? { explain: d.explain.trim() } : {}),
  })
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) }
  return { ok: true, rule: parsed.data }
}

/** Elenco delle regole con id unici (le nuove prendono l'id dall'etichetta). */
export function rulesFromDrafts(drafts: readonly RuleDraft[]): { rules: ComplicationRule[]; errors: Map<number, readonly string[]> } {
  const taken = new Set(drafts.map((d) => d.id).filter(Boolean))
  const rules: ComplicationRule[] = []
  const errors = new Map<number, readonly string[]>()
  drafts.forEach((d, i) => {
    let id = d.id
    if (!id) {
      id = uniqueId(slugify(d.label), taken)
      taken.add(id)
    }
    const r = ruleFromDraft(d, id)
    if (r.ok) rules.push(r.rule)
    else errors.set(i, r.errors)
  })
  return { rules, errors }
}

/** Frase della regola: "Se dislivello del pavimento ≥ 100 mm allora +2 ore". */
export function sentence(rule: ComplicationRule): string {
  const conds = rule.conditions.map((c) => {
    const unit = factorUnit(c.factor)
    const v = Array.isArray(c.value) ? c.value.join(" o ") : typeof c.value === "number" ? `${num(c.value)}${unit ? ` ${unit}` : ""}` : c.value
    const op = c.op === ">" ? ">" : c.op === ">=" ? "≥" : c.op === "in" ? "è" : "="
    return `${SITE_FACTOR_LABELS[c.factor]} ${op} ${v}`
  })
  const e = rule.effect
  const effect =
    e.kind === "ore" ? `+${num(e.value)} ore` : e.kind === "percento-ore" ? `+${num(e.value)}% ore di montaggio` : e.kind === "fisso" ? `+${num(e.value / 100)} €` : `+${num(e.value)}% costo del legno`
  return `Se ${conds.join(" e ") || "sempre"} allora ${effect}`
}
