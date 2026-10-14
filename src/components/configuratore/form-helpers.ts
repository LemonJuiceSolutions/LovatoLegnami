import { SECTION_CATALOG, sectionLabel, type NumberParamSpec, type ParamSpec } from "@/domain";

/**
 * Funzioni pure dei form del configuratore (testabili senza DOM).
 */

/** Numero da un campo di testo: accetta la virgola decimale; `undefined` se vuoto o non numerico. */
export function parseNumberInput(text: string): number | undefined {
  const t = text.trim().replace(",", ".")
  if (t === "" || t === "-" || t === "." || t === "-.") return undefined
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

/** Numero per un campo di testo, con la virgola decimale (formato italiano). */
export const formatNumberInput = (v: number): string => String(v).replace(".", ",")

/** Etichetta dell'unità (`mm`, `°`, niente per i conteggi). */
export const unitLabel = (unit: NumberParamSpec["unit"] | "mm" | undefined): string =>
  unit === "n" || unit === undefined ? "" : unit

/** Intervallo ammesso leggibile: `3–45 °`, `2000–12000 mm`, `1–8`. */
export function formatRange(min: number, max: number, unit?: NumberParamSpec["unit"]): string {
  const u = unitLabel(unit)
  return `${formatNumberInput(min)}–${formatNumberInput(max)}${u ? ` ${u}` : ""}`
}

/** Errore inline di un parametro numerico (fuori limite, non intero); `undefined` se valido. */
export function numberParamError(spec: NumberParamSpec, value: number): string | undefined {
  if (!Number.isFinite(value)) return "Inserire un numero"
  if (value < spec.min || value > spec.max) return `Fuori limite: ammesso ${formatRange(spec.min, spec.max, spec.unit)}`
  if (spec.integer && !Number.isInteger(value)) return "Inserire un numero intero"
  return undefined
}

/** Parametri del template raggruppati per il form: geometria/struttura e sezioni per famiglia. */
export function groupParams(params: readonly ParamSpec[]): {
  readonly main: readonly ParamSpec[]
  readonly sections: readonly ParamSpec[]
} {
  return {
    main: params.filter((p) => p.kind !== "section"),
    sections: params.filter((p) => p.kind === "section"),
  }
}

/** Opzioni del select di una sezione: catalogo commerciale, più il valore corrente se fuori catalogo. */
export function sectionOptions(current: string | undefined): string[] {
  const labels = SECTION_CATALOG.map(sectionLabel)
  return current && !labels.includes(current) ? [current, ...labels] : labels
}
