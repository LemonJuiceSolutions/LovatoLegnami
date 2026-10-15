import { z } from "zod";
import { ACCESS_LEVELS, ANCHORING_KINDS, CustomerQuoteSchema } from "@/domain";
import { ConfigFileSchema } from "@/stores/config-file";

/**
 * Contratti delle API pubbliche del preventivo (P9). Tutti gli schemi sono **strict**:
 * una chiave in più è un errore, non un campo ignorato. La configurazione è quella del
 * file del configuratore (`ConfigFileSchema`); il server la rivalida per tipologia e
 * parametri (`parseConfigFile`) e rigenera l'assieme, senza fidarsi di altro dal client.
 */

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "identificativo non valido").max(64);

/** Dati del cantiere dichiarati dal cliente (fattori di cantiere non deducibili dalla geometria). */
export const DeclaredSiteSchema = z
  .object({
    access: z.enum(ACCESS_LEVELS).default("facile"),
    anchoring: z.enum(ANCHORING_KINDS).optional(),
    cap: z.string().regex(/^\d{5}$/, "CAP non valido (5 cifre)").optional(),
  })
  .strict();

/**
 * Finiture scelte nel wizard. Il task chiedeva solo `{ config, declared }`: le finiture
 * (`ConfiguratoreConfig.commercial` di 10.1) non sono ancora nel file di configurazione,
 * quindi viaggiano qui; assenti ⇒ abete lamellare senza trattamento né copertura.
 */
export const CommercialChoiceSchema = z
  .object({
    species: id.default("abete"),
    quality: id.default("lamellare"),
    treatment: id.nullable().default(null),
    covering: id.nullable().default(null),
  })
  .strict();

export const EstimateRequestSchema = z
  .object({
    config: ConfigFileSchema,
    declared: DeclaredSiteSchema.default({}),
    commercial: CommercialChoiceSchema.default({}),
  })
  .strict();
export type EstimateRequest = z.infer<typeof EstimateRequestSchema>;
export type EstimateRequestInput = z.input<typeof EstimateRequestSchema>;

/** Risposta della stima: vista cliente del preventivo + note semplici sulla costruzione. */
export const EstimateResponseSchema = z
  .object({
    quote: CustomerQuoteSchema,
    notes: z.array(z.string()),
  })
  .strict();
export type EstimateResponse = z.infer<typeof EstimateResponseSchema>;

/** Dimensione massima del corpo JSON della stima (una configurazione reale è ~5 KB). */
export const MAX_ESTIMATE_BODY_BYTES = 64 * 1024;

/**
 * Sottostringhe vietate nelle chiavi delle risposte pubbliche (stessa lista dei test della
 * vista cliente, 4.5): nessun margine, tariffa, costo, piano di taglio o regola interna.
 */
export const INTERNAL_KEY_BLACKLIST = ["margin", "hourly", "rate", "bars", "waste", "unitprice", "cost", "cut", "offcut", "kerf", "trim", "factor", "rule", "explain", "lines"] as const;

/** Percorsi delle chiavi vietate trovate in un valore JSON (vuoto = pulito). */
export function blacklistedKeys(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => blacklistedKeys(v, `${path}[${i}]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) => {
    const p = path ? `${path}.${k}` : k;
    const hit = INTERNAL_KEY_BLACKLIST.some((w) => k.toLowerCase().includes(w));
    return [...(hit ? [p] : []), ...blacklistedKeys(v, p)];
  });
}
