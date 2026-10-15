/** Formati del sito pubblico (italiano, deterministici in Node e nel browser). */

/** Euro senza decimali: `690000` → `6.900 €` (spazio non separabile). */
export function euroRounded(cents: number): string {
  const euro = Math.round(cents / 100)
  const s = Math.abs(euro)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return `${euro < 0 ? "-" : ""}${s} €`
}

/** Metri con due decimali: `4000` → `4,00 m`. */
export function metres(mm: number): string {
  return `${(Math.round(mm / 10) / 100).toFixed(2).replace(".", ",")} m`
}

/** Misure in pianta: `4,00 × 3,00 m`. */
export function footprint(widthMm: number, depthMm: number): string {
  return `${metres(widthMm).replace(" m", "")} × ${metres(depthMm)}`
}
