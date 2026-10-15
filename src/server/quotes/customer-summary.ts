import { getTypology } from "@/domain/typologies/registry"
import type { CustomerQuote } from "@/domain"
import { measureFields } from "@/components/wizard/answers"
import { planDeviations } from "@/domain/envelope/plan"
import { get as getLead } from "@/server/repositories/leads"
import { resolveToken } from "@/server/repositories/tokens"
import { parseConfigFile } from "@/stores/config-file"
import { StoredQuoteSchema } from "./snapshot"

/**
 * Riepilogo del preventivo per il cliente (12.8, spec `richieste-preventivo` "Collegamento
 * per il cliente"): dal token (90 giorni) all'**istantanea** salvata, senza ricalcolare
 * nulla. Solo dati destinati al cliente: vista cliente del prezzo, misure, note, nessun
 * dato interno né contatti. Token sconosciuto, scaduto, richiesta anonimizzata o
 * istantanea illeggibile ⇒ `null` (la pagina invita a contattare l'ufficio).
 */

export interface CustomerSummary {
  readonly code: string
  readonly createdAt: string
  readonly kind: "indicativo" | "definitivo"
  readonly firstName: string
  readonly typologyTitle: string
  readonly measures: readonly { readonly label: string; readonly cm: number }[]
  readonly outOfSquareDeg: number | null
  readonly quote: CustomerQuote
  readonly notes: readonly string[]
  readonly pdfUrl: string
  readonly expiresAt: string
}

export async function loadCustomerSummary(token: string, now: Date = new Date()): Promise<CustomerSummary | null> {
  const resolved = await resolveToken(token, now)
  if (!resolved) return null
  const { lead, quotes } = await getLead(resolved.leadId)
  const customer = lead.customer as { name?: string; anonymized?: boolean }
  if (customer.anonymized) return null
  const row = quotes.find((q) => q.kind === "definitivo") ?? quotes[0]
  if (!row) return null
  const stored = StoredQuoteSchema.safeParse(row.quote)
  if (!stored.success) return null
  let measures: CustomerSummary["measures"] = []
  let outOfSquareDeg: number | null = null
  try {
    const config = parseConfigFile(row.config, { keepInvalidParams: true })
    measures = measureFields(getTypology(config.typology)).flatMap((f) => {
      const v = config.params[f.param]
      return typeof v === "number" ? [{ label: f.label, cm: Math.round(v / 10) }] : []
    })
    if (config.envelope.plan) {
      const dev = Math.abs(planDeviations(config.envelope.plan).maxCornerDeg)
      outOfSquareDeg = dev >= 0.5 ? Math.round(dev) : null
    }
  } catch {
    // configurazione non più leggibile: il riepilogo resta con prezzo e note
  }
  return {
    code: lead.code,
    createdAt: row.createdAt.toISOString(),
    kind: row.kind === "definitivo" ? "definitivo" : "indicativo",
    firstName: (customer.name ?? "").trim().split(/\s+/)[0] ?? "",
    typologyTitle: stored.data.typology.title,
    measures,
    outOfSquareDeg,
    quote: stored.data.customerQuote,
    notes: stored.data.notes,
    pdfUrl: `/api/preventivo/${encodeURIComponent(token)}/pdf`,
    expiresAt: resolved.expiresAt.toISOString(),
  }
}
