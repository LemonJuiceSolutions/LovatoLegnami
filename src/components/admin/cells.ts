import { parseDecimal } from "@/domain/pricing/csv"

/**
 * Lettura e scrittura delle celle dei form admin (9.2): numeri con la virgola decimale,
 * importi in euro salvati in centesimi, messaggi di errore in italiano. Puro e testato.
 */

export type CellKind = "text" | "number" | "money" | "select" | "switch" | "readonly"

export interface CellRules {
  readonly kind: CellKind
  readonly min?: number
  readonly max?: number
  readonly integer?: boolean
  /** Campo vuoto ammesso (valore `undefined`). */
  readonly optional?: boolean
}

export type CellParse = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string }

/** Numero con la virgola e senza zeri inutili: `0,5`, `13500`. */
export const formatNumber = (n: number): string => String(Math.round(n * 1e6) / 1e6).replace(".", ",")

/** Centesimi → euro con due decimali: `650,00`. */
export const formatMoney = (cents: number): string => (cents / 100).toFixed(2).replace(".", ",")

/** Testo mostrato nella cella per il valore. */
export function formatCell(rules: Pick<CellRules, "kind">, value: unknown): string {
  if (value === undefined || value === null) return ""
  if (rules.kind === "money" && typeof value === "number") return formatMoney(value)
  if (rules.kind === "number" && typeof value === "number") return formatNumber(value)
  return String(value)
}

const show = (n: number, money: boolean) => (money ? formatMoney(n * 100).replace(/,00$/, "") : formatNumber(n))

/** "inserire un numero tra 0 e 100", "inserire un numero intero maggiore o uguale a 1", … */
export function rangeMessage(rules: CellRules): string {
  const money = rules.kind === "money"
  const what = rules.integer ? "un numero intero" : money ? "un importo" : "un numero"
  const { min, max } = rules
  if (min !== undefined && max !== undefined) return `inserire ${what} tra ${show(min, money)} e ${show(max, money)}`
  if (min !== undefined) return `inserire ${what} maggiore o uguale a ${show(min, money)}`
  if (max !== undefined) return `inserire ${what} minore o uguale a ${show(max, money)}`
  return `inserire ${what}`
}

/**
 * Valore della cella dal testo inserito. Numeri: `parseDecimal` (virgola o punto, migliaia
 * col punto), limiti `min`/`max` (per gli importi in euro); importi convertiti in centesimi.
 */
export function parseCell(rules: CellRules, text: string): CellParse {
  const t = text.trim()
  if (rules.kind === "text" || rules.kind === "select") {
    if (!t) return rules.optional ? { ok: true, value: undefined } : { ok: false, error: "campo obbligatorio" }
    return { ok: true, value: t }
  }
  if (rules.kind !== "number" && rules.kind !== "money") return { ok: true, value: text }
  if (!t) return rules.optional ? { ok: true, value: undefined } : { ok: false, error: rules.min !== undefined || rules.max !== undefined ? rangeMessage(rules) : "campo obbligatorio" }
  const n = parseDecimal(t)
  const bad = n === undefined || !Number.isFinite(n) || (rules.min !== undefined && n < rules.min) || (rules.max !== undefined && n > rules.max) || (rules.integer && !Number.isInteger(n))
  if (bad) return { ok: false, error: rangeMessage(rules) }
  if (rules.kind === "money") {
    if (Math.round(n * 100) !== Math.round(n * 100 * 1e6) / 1e6) return { ok: false, error: "inserire un importo con al massimo due decimali" }
    return { ok: true, value: Math.round(n * 100) }
  }
  return { ok: true, value: n }
}
