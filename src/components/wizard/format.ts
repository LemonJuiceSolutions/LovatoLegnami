/** Formati del wizard (italiano, deterministici in Node e nel browser). */

/** Euro senza decimali: `690000` → `6.900 €`. */
export function euro(cents: number): string {
  const v = Math.round(cents / 100)
  const s = Math.abs(v)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return `${v < 0 ? "-" : ""}${s} €`
}

/** Metri con al massimo due decimali e senza zeri inutili: `4000` → `4 m`, `2950` → `2,95 m`. */
export function metres(mm: number): string {
  const m = Math.round(mm / 10) / 100
  return `${m.toFixed(2).replace(/\.?0+$/, "").replace(".", ",")} m`
}

/** `4 × 3 m` */
export const footprint = (widthMm: number, depthMm: number): string => `${metres(widthMm).replace(" m", "")} × ${metres(depthMm)}`

/** Centimetri con il punto delle migliaia: `1200` → `1.200 cm`. */
export const cm = (v: number): string => `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} cm`
