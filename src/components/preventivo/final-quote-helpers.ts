import { customerView, priceAssembly, type Assembly, type CustomerQuote, type Envelope } from "@/domain"
import type { CatalogState } from "@/stores/catalog"
import { pricingOptionsOf, type CommercialOptions } from "@/stores/config"

/**
 * Logica pura del dialogo "Salva preventivo definitivo" (10.4): importi in euro digitati,
 * etichette degli stati della richiesta e anteprima della vista cliente calcolata nel
 * browser con lo stesso motore del server (il server ricalcola comunque tutto al
 * salvataggio, con il listino attivo).
 */

export const LEAD_STATUS_LABELS: Readonly<Record<string, string>> = {
  nuovo: "Nuova",
  "in-lavorazione": "In lavorazione",
  "preventivo-inviato": "Preventivo inviato",
  accettato: "Accettata",
  rifiutato: "Rifiutata",
  archiviato: "Archiviata",
}

export const statusLabel = (s: string): string => LEAD_STATUS_LABELS[s] ?? s

/** Importo in euro come lo scrive l'ufficio ("1.234,50", "500", "-20,5") → centesimi; `undefined` se non valido. */
export function parseEuroInput(text: string): number | undefined {
  const t = text.trim().replace(/[\s€]/g, "")
  // con la virgola i punti sono migliaia; senza virgola un punto seguito da 3 cifre anche
  const plain = t.includes(",") || /^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t
  if (!/^-?\d+(\.\d{1,2})?$/.test(plain)) return undefined
  return Math.round(Number(plain) * 100)
}

export interface ManualLineDraft {
  readonly description: string
  readonly amount: string
}

export interface FinalDiscount {
  readonly kind: "percento" | "fisso"
  readonly value: number
}

/** Righe manuali valide (descrizione e importo); le incomplete sono escluse dall'anteprima e dal salvataggio. */
export function manualLinesOf(drafts: readonly ManualLineDraft[]): { description: string; amountCents: number }[] {
  return drafts.flatMap((d) => {
    const amountCents = parseEuroInput(d.amount)
    return d.description.trim() && amountCents !== undefined && amountCents !== 0 ? [{ description: d.description.trim(), amountCents }] : []
  })
}

/** Anteprima della vista cliente del definitivo; `null` senza assieme o se il calcolo fallisce. */
export function finalQuotePreview(input: {
  readonly assembly: Assembly | null
  readonly envelope: Envelope
  readonly commercial: CommercialOptions
  readonly catalog: Pick<CatalogState, "priceList" | "priceListVersion">
  readonly manualLines: readonly { description: string; amountCents: number }[]
  readonly discount: FinalDiscount | null
  readonly vat: string
}): CustomerQuote | null {
  if (!input.assembly) return null
  try {
    const quote = priceAssembly({
      assembly: input.assembly,
      envelope: input.envelope,
      options: {
        ...pricingOptionsOf(input.commercial),
        vat: input.vat,
        ...(input.discount ? { discounts: [{ id: "sconto-ufficio", label: "Sconto", kind: input.discount.kind, value: input.discount.value }] } : {}),
      },
      priceList: input.catalog.priceList,
      version: input.catalog.priceListVersion,
      manualLines: input.manualLines,
    })
    return customerView(quote)
  } catch {
    return null
  }
}
