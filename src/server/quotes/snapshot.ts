import { z } from "zod";
import { CustomerQuoteSchema, type CustomerQuote } from "@/domain";
import { CommercialChoiceSchema, DeclaredSiteSchema } from "@/server/public-dto";

/**
 * Istantanea del preventivo salvata in `quotes.quote` (P5, spec `richieste-preventivo`):
 * tutto ciò che serve per riprodurre riepilogo e PDF **senza** ricalcolare il prezzo —
 * vista cliente e note già calcolate, preventivo completo (vista ufficio, per l'admin),
 * tipologia con il titolo commerciale del momento, scelte del cliente, immagine della scena.
 * Configurazione, versioni di listino e regole, fattori e totale sono nelle colonne di
 * `quotes`.
 */
export const STORED_QUOTE_SCHEMA = 1 as const;

export const StoredQuoteSchema = z.object({
  schema: z.literal(STORED_QUOTE_SCHEMA),
  typology: z.object({ slug: z.string(), title: z.string() }),
  customerQuote: CustomerQuoteSchema,
  notes: z.array(z.string()),
  commercial: CommercialChoiceSchema,
  declared: DeclaredSiteSchema,
  sceneImageId: z.string().nullable(),
  /** Preventivo completo (`quoteToJSON`), solo per l'area interna. */
  office: z.unknown(),
});
export type StoredQuote = z.infer<typeof StoredQuoteSchema>;

/** Vista cliente di un'istantanea (per `/p/[token]`, gruppo 12); `null` se illeggibile. */
export function customerQuoteOf(stored: unknown): CustomerQuote | null {
  const r = StoredQuoteSchema.safeParse(stored);
  return r.success ? r.data.customerQuote : null;
}
