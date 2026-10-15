import type { CustomerQuote, OfficeView } from "@/domain/pricing/views"

/** Dati serializzabili delle pagine richieste (9.9). */

export const LEAD_STATUS_VALUES = ["nuovo", "in-lavorazione", "preventivo-inviato", "accettato", "rifiutato", "archiviato"] as const
export type LeadStatusValue = (typeof LEAD_STATUS_VALUES)[number]

export const LEAD_STATUS_LABELS: Readonly<Record<LeadStatusValue, string>> = {
  nuovo: "nuovo",
  "in-lavorazione": "in lavorazione",
  "preventivo-inviato": "preventivo inviato",
  accettato: "accettato",
  rifiutato: "rifiutato",
  archiviato: "archiviato",
}

export interface LeadRowView {
  readonly id: string
  readonly code: string
  /** "15/10/2026, 10:32". */
  readonly createdAt: string
  readonly customer: string
  readonly typology: string
  /** "4,00 × 6,00 m" o "". */
  readonly dimensions: string
  readonly totalCents: number | null
  readonly status: LeadStatusValue
  readonly assignee: string | null
  readonly anonymized: boolean
}

export interface LeadDetailView {
  readonly id: string
  readonly code: string
  readonly status: LeadStatusValue
  readonly createdAt: string
  readonly anonymized: boolean
  readonly assignee: string | null
  readonly assigneeId: string | null
  readonly customer: readonly { readonly label: string; readonly value: string }[]
  readonly consent: string
  readonly notes: string | null
  readonly photos: readonly { readonly id: string; readonly kind: string }[]
  readonly config: {
    readonly typology: string
    readonly params: readonly { readonly name: string; readonly value: string }[]
    readonly envelope: string
  } | null
  readonly quoteKind: string | null
  readonly office: OfficeView | null
  readonly customerQuote: CustomerQuote | null
  readonly events: readonly { readonly at: string; readonly by: string | null; readonly from: string | null; readonly to: string | null; readonly note: string | null }[]
  readonly emails: readonly { readonly template: string; readonly status: string; readonly attempts: number; readonly lastError: string | null }[]
}
