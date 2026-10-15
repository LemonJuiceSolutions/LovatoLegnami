import { HARDWARE_CATALOG } from "@/domain/hardware/catalog"
import { parseSectionLabel, sectionLabel } from "@/domain/components/sections"
import { FAMILY_OF, HARDWARE_KINDS, JOINT_TYPES, MACHINING_TYPES, PIECE_FAMILIES, PIECE_TYPES } from "@/domain/components/types"
import { PRICED_SECTIONS } from "@/domain/pricing/data/default-listino"
import type { PriceList } from "@/domain/pricing/types"
import type { ColumnOption } from "../editable-table"

/** Opzioni delle colonne a scelta dei form del listino (dal dominio e dal documento). */

const words = (s: string) => s.replace(/-/g, " ")
const opts = (values: readonly string[], label: (v: string) => string = words): ColumnOption[] => values.map((value) => ({ value, label: label(value) }))

export const PIECE_TYPE_OPTIONS = opts(PIECE_TYPES)
export const MACHINING_OPTIONS = opts(MACHINING_TYPES)
export const JOINT_OPTIONS = opts(JOINT_TYPES)
export const HARDWARE_KIND_OPTIONS = opts(HARDWARE_KINDS)
export const MACHINING_UNIT_OPTIONS: ColumnOption[] = [
  { value: "mm", label: "mm (lunghezza)" },
  { value: "cm2", label: "cm² (area)" },
  { value: "n", label: "n (numero)" },
]

/** Famiglie con i tipi di pezzo che ne fanno parte: "TVT – travetto". */
export const FAMILY_OPTIONS: ColumnOption[] = PIECE_FAMILIES.map((f) => {
  const types = PIECE_TYPES.filter((t) => FAMILY_OF[t] === f).map(words)
  return { value: f, label: types.length ? `${f} – ${types.join(", ")}` : f }
})

export const HARDWARE_OPTIONS: ColumnOption[] = HARDWARE_CATALOG.map((h) => ({ value: h.code, label: `${h.code} – ${h.name}` }))
const HARDWARE_NAMES = new Map(HARDWARE_CATALOG.map((h) => [h.code, h.name]))
export const hardwareName = (code: string): string => HARDWARE_NAMES.get(code) ?? "codice non a catalogo"

const bySection = (a: string, b: string) => {
  const sa = parseSectionLabel(a)
  const sb = parseSectionLabel(b)
  return sa && sb ? sa.b - sb.b || sa.h - sb.h : a.localeCompare(b)
}

/** Sezioni note: catalogo prezzato più quelle già presenti nel listino, ordinate. */
export function sectionOptions(pl: PriceList): ColumnOption[] {
  const keys = new Set<string>(PRICED_SECTIONS.map(sectionLabel))
  for (const rec of [pl.timber.stockLengths, pl.timber.minReusableOffcut, pl.timber.curvedPerMl, pl.timber.pricePerMl ?? {}]) for (const k of Object.keys(rec)) keys.add(k)
  return [...keys].sort(bySection).map((value) => ({ value, label: value }))
}

export const speciesOptions = (pl: PriceList): ColumnOption[] => pl.timber.species.map((s) => ({ value: s.id, label: s.label }))
export const qualityOptions = (pl: PriceList): ColumnOption[] => pl.timber.qualities.map((q) => ({ value: q.id, label: q.label }))
export { bySection }
