import {
  NUMERIC_SITE_FACTORS,
  SITE_FACTOR_LABELS,
  SITE_FACTOR_UNITS,
  formatEuro,
  type OfficeCutGroup,
  type QuoteLine,
  type SiteFactors,
} from "@/domain"

/**
 * Logica pura del pannello preventivo (10.2): testi delle righe, barre del piano di
 * taglio raggruppate, fattori di cantiere leggibili. Nessun calcolo di prezzo: tutto
 * viene dalla vista ufficio (`officeView`).
 */

const qty = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 })
const one = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 })

export const formatQuantity = (n: number): string => qty.format(n)

/** Calcolo della riga: "0,512 m³ × 650,00 €", "15% di 1.234,00 €", "3 pz". */
export function lineDetail(l: Pick<QuoteLine, "quantity" | "unit" | "unitPriceCents">): string {
  if (l.unit === "%") return `${formatQuantity(l.quantity)}% di ${formatEuro(l.unitPriceCents)}`
  const q = `${formatQuantity(l.quantity)} ${l.unit}`
  return l.unitPriceCents > 0 ? `${q} × ${formatEuro(l.unitPriceCents)}` : q
}

export interface BarRow {
  readonly key: string
  readonly count: number
  readonly length: number
  readonly cuts: readonly { readonly id: string; readonly length: number }[]
  readonly offcut: number
  readonly reusable: boolean
}

/** Barre identiche (lunghezza e tagli) raggruppate con il conteggio, nell'ordine del piano. */
export function groupBars(bars: OfficeCutGroup["bars"]): BarRow[] {
  const rows: BarRow[] = []
  const index = new Map<string, number>()
  for (const b of bars) {
    const key = `${b.length}|${b.cuts.map((c) => c.length).join(",")}`
    const i = index.get(key)
    if (i === undefined) {
      index.set(key, rows.length)
      rows.push({ key, count: 1, length: b.length, cuts: b.cuts, offcut: b.offcut, reusable: b.reusable })
    } else rows[i] = { ...rows[i], count: rows[i].count + 1, cuts: [...rows[i].cuts, ...b.cuts] }
  }
  return rows
}

/** Tagli della prima barra di una riga raggruppata (le altre sono identiche). */
export const cutsPerBar = (row: BarRow): BarRow["cuts"] => row.cuts.slice(0, row.cuts.length / row.count)

/** Percentuale con un decimale ("12,4%"). */
export const formatPct = (v: number): string => `${one.format(v)}%`

/** Millimetri con separatore delle migliaia anche sotto 10 000 ("6.000 mm", come `formatEuro`). */
export const formatMm = (v: number): string => `${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} mm`

export const ACCESS_LABELS: Record<SiteFactors["access"], string> = { facile: "Facile", medio: "Medio", difficile: "Difficile" }
export const ANCHORING_LABELS: Record<SiteFactors["anchoring"], string> = { terra: "A terra", muro: "A muro", misto: "Misto (terra e muro)" }

/** Fattori di cantiere come righe etichetta/valore (con la prima lettera maiuscola). */
export function siteFactorRows(f: SiteFactors): { key: string; label: string; value: string }[] {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const numeric = NUMERIC_SITE_FACTORS.map((k) => {
    const unit = SITE_FACTOR_UNITS[k]
    const v = f[k]
    const value = unit === " mm" ? formatMm(v) : `${one.format(v)}${unit}`
    return { key: k, label: cap(SITE_FACTOR_LABELS[k]), value }
  })
  return [
    ...numeric,
    { key: "access", label: cap(SITE_FACTOR_LABELS.access), value: ACCESS_LABELS[f.access] },
    { key: "anchoring", label: cap(SITE_FACTOR_LABELS.anchoring), value: ANCHORING_LABELS[f.anchoring] },
  ]
}
