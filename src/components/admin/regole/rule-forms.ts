import { SECTION_CATALOG, sectionLabel } from "@/domain/components/sections"
import { PIECE_TYPES, type PieceType } from "@/domain/components/types"
import { loadRuleSet, RULE_KINDS, RuleSetError, type Rule, type RuleKind, type RuleSet, type Severity } from "@/domain/rules/types"

/**
 * Regole costruttive come form (9.6): stato piatto modificabile per ogni regola e
 * conversione verso il `Rule` del dominio, validato con `loadRuleSet` (gli stessi controlli
 * del file dati: tipi ammessi, sezioni normalizzate, id univoci). I tipi di vincolo
 * proposti sono **solo** quelli di `RULE_KINDS`: una regola di tipo sconosciuto non si può
 * comporre dal form.
 */

export const KIND_LABELS: Readonly<Record<RuleKind, string>> = {
  "max-span-by-section": "Luce massima per sezione",
  "max-joist-spacing": "Interasse massimo dei travetti",
  "max-overhang": "Sbalzo massimo",
  "min-clear-height": "Altezza libera minima",
  "slope-range": "Pendenza ammessa",
  "min-section": "Sezione minima",
}

export const KIND_OPTIONS = RULE_KINDS.map((value) => ({ value, label: KIND_LABELS[value] }))
export const SEVERITY_OPTIONS: readonly { value: Severity; label: string }[] = [
  { value: "errore", label: "errore (bloccante)" },
  { value: "avviso", label: "avviso" },
]
export const PIECE_TYPE_OPTIONS = PIECE_TYPES.map((value) => ({ value, label: value.replace(/-/g, " ") }))
export const CATALOG_SECTIONS = SECTION_CATALOG.map(sectionLabel)

export interface SpanRow {
  readonly pieceType: PieceType
  readonly section: string
  readonly max: number | undefined
}

export interface RuleForm {
  readonly uid: number
  readonly kind: RuleKind
  readonly id: string
  readonly name: string
  readonly severity: Severity
  readonly description: string
  /** Massimo (mm per interasse/sbalzo, gradi per la pendenza). */
  readonly max: number | undefined
  /** Minimo (mm per l'altezza libera, gradi per la pendenza). */
  readonly min: number | undefined
  readonly allowFlat: boolean
  /** Sbalzo: tipi a cui si applica (vuoto = tutti i pezzi con appoggi). */
  readonly pieceTypes: readonly PieceType[]
  /** Sezione minima: tipo e sezione. */
  readonly pieceType: PieceType
  readonly section: string
  /** Tabella luci. */
  readonly spans: readonly SpanRow[]
}

let uid = 1

export function formFromRule(r: Rule): RuleForm {
  const base = { uid: uid++, kind: r.kind, id: r.id, name: r.name, severity: r.severity, description: r.description ?? "", max: undefined, min: undefined, allowFlat: false, pieceTypes: [], pieceType: "travetto" as PieceType, section: "80×160", spans: [] }
  switch (r.kind) {
    case "max-span-by-section":
      return {
        ...base,
        spans: Object.entries(r.table).flatMap(([pieceType, bySection]) => Object.entries(bySection ?? {}).map(([section, max]) => ({ pieceType: pieceType as PieceType, section, max }))),
      }
    case "max-joist-spacing":
      return { ...base, max: r.max }
    case "max-overhang":
      return { ...base, max: r.max, pieceTypes: [...(r.pieceTypes ?? [])] }
    case "min-clear-height":
      return { ...base, min: r.min }
    case "slope-range":
      return { ...base, min: r.min, max: r.max, allowFlat: r.allowFlat ?? false }
    case "min-section":
      return { ...base, pieceType: r.pieceType, section: r.section }
  }
}

/** Regola nuova del tipo scelto, con valori di partenza ragionevoli. */
export function newRuleForm(kind: RuleKind, taken: ReadonlySet<string>): RuleForm {
  let id: string = kind
  for (let i = 2; taken.has(id); i++) id = `${kind}-${i}`
  const base: RuleForm = { uid: uid++, kind, id, name: KIND_LABELS[kind], severity: "errore", description: "", max: undefined, min: undefined, allowFlat: false, pieceTypes: [], pieceType: "travetto", section: "80×160", spans: [] }
  switch (kind) {
    case "max-span-by-section":
      return { ...base, spans: [{ pieceType: "travetto", section: "80×160", max: 3500 }] }
    case "max-joist-spacing":
      return { ...base, max: 800 }
    case "max-overhang":
      return { ...base, max: 600 }
    case "min-clear-height":
      return { ...base, min: 2200 }
    case "slope-range":
      return { ...base, min: 5, max: 30, allowFlat: false }
    case "min-section":
      return base
  }
}

/** Oggetto regola (ancora da validare) dal form. */
export function ruleFromForm(f: RuleForm): Record<string, unknown> {
  const base = { id: f.id.trim(), name: f.name.trim(), kind: f.kind, severity: f.severity, ...(f.description.trim() ? { description: f.description.trim() } : {}) }
  switch (f.kind) {
    case "max-span-by-section": {
      const table: Record<string, Record<string, number | undefined>> = {}
      for (const s of f.spans) (table[s.pieceType] ??= {})[s.section] = s.max
      return { ...base, table }
    }
    case "max-joist-spacing":
      return { ...base, max: f.max }
    case "max-overhang":
      return { ...base, max: f.max, ...(f.pieceTypes.length ? { pieceTypes: [...f.pieceTypes] } : {}) }
    case "min-clear-height":
      return { ...base, min: f.min }
    case "slope-range":
      return { ...base, min: f.min, max: f.max, ...(f.allowFlat ? { allowFlat: true } : {}) }
    case "min-section":
      return { ...base, pieceType: f.pieceType, section: f.section }
  }
}

export type RulesParse = { readonly ok: true; readonly ruleSet: RuleSet } | { readonly ok: false; readonly errors: readonly string[] }

/** Set di regole dai form, validato come il file dati. */
export function ruleSetFromForms(id: string, name: string | undefined, forms: readonly RuleForm[]): RulesParse {
  try {
    return { ok: true, ruleSet: loadRuleSet({ id, ...(name !== undefined ? { name } : {}), rules: forms.map(ruleFromForm) }) }
  } catch (e) {
    if (e instanceof RuleSetError) return { ok: false, errors: e.issues.map((i) => i.message) }
    throw e
  }
}
