import { parseConfigFile } from "@/stores/config-file";
import { quotePdfData, type QuotePdfSource } from "@/server/pdf/data";
import { renderQuotePdf } from "@/server/pdf/quote-pdf";
import { get, type LeadCustomer } from "@/server/repositories/leads";
import { NotFoundError } from "@/server/repositories/errors";
import { getFileStorage, uploadKey } from "@/server/storage/storage";
import { StoredQuoteSchema } from "./snapshot";

/**
 * PDF della richiesta dall'istantanea salvata (allegato della conferma, download col
 * token): preventivo `definitivo` più recente se c'è, altrimenti l'indicativo. Gli importi
 * sono quelli salvati: un nuovo listino non li cambia.
 */
export async function leadPdf(leadId: string): Promise<{ code: string; pdf: Uint8Array } | null> {
  let detail;
  try {
    detail = await get(leadId);
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
  const candidates = [...detail.quotes.filter((q) => q.kind === "definitivo"), ...detail.quotes.filter((q) => q.kind === "indicativo")];
  for (const row of candidates) {
    const stored = StoredQuoteSchema.safeParse(row.quote);
    if (!stored.success) continue;
    const config = parseConfigFile(row.config, { keepInvalidParams: true });
    const customer = detail.lead.customer as LeadCustomer & { cap?: string; comune?: string };
    let image: QuotePdfSource["image"] = null;
    if (stored.data.sceneImageId) {
      const file = await getFileStorage().get(uploadKey("scena", stored.data.sceneImageId)).catch(() => null);
      if (file && (file.contentType === "image/png" || file.contentType === "image/jpeg"))
        image = { format: file.contentType === "image/png" ? ("png" as const) : ("jpg" as const), data: file.bytes };
    }
    const source: QuotePdfSource = {
      code: detail.lead.code,
      createdAt: row.createdAt,
      kind: row.kind,
      customer: {
        name: String(customer.name ?? ""),
        ...(customer.email ? { email: String(customer.email) } : {}),
        ...(customer.phone ? { phone: String(customer.phone) } : {}),
        ...(customer.cap ? { cap: String(customer.cap) } : {}),
        ...(customer.comune ? { comune: String(customer.comune) } : {}),
      },
      config,
      customerQuote: stored.data.customerQuote,
      customerNotes: detail.lead.notes,
      image,
      typologyLabel: stored.data.typology.title,
    };
    let pdf: Uint8Array;
    try {
      pdf = await renderQuotePdf(quotePdfData(source));
    } catch (e) {
      // immagine della scena illeggibile (caricata dal client): si ripiega sull'assonometria
      if (!image) throw e;
      pdf = await renderQuotePdf(quotePdfData({ ...source, image: null }));
    }
    return { code: detail.lead.code, pdf };
  }
  return null;
}

/** Fornitore per l'outbox (allegato della conferma). */
export async function pdfForLead(leadId: string): Promise<Uint8Array | null> {
  return (await leadPdf(leadId))?.pdf ?? null;
}
