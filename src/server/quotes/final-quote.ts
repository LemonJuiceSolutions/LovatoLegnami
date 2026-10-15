import { z } from "zod";
import {
  GeometryError,
  HardwareError,
  JointError,
  MachiningError,
  ParamError,
  TemplateError,
  customerView,
  formatEuro,
  getTypology,
  priceAssembly,
  quoteToJSON,
  type Quote,
} from "@/domain";
import { commercialOf, pricingOptionsOf, type ConfiguratoreConfig } from "@/stores/config";
import { ConfigFileError, parseConfigFile, serializeConfig } from "@/stores/config-file";
import { enqueue, flush } from "@/server/email/outbox";
import { getEnv } from "@/server/env";
import { getActive } from "@/server/repositories/datasets";
import { ConflictError, RepositoryError } from "@/server/repositories/errors";
import { addFinalQuote, changeStatus, get, type LeadCustomer, type LeadDetail } from "@/server/repositories/leads";
import { issueCustomerToken } from "@/server/repositories/tokens";
import { assemblyFromConfig } from "./generate";
import { STORED_QUOTE_SCHEMA, StoredQuoteSchema, type StoredQuote } from "./snapshot";

/**
 * Preventivo definitivo dal configuratore interno (10.4, spec `configuratore-ui` "Apertura
 * di una richiesta"): la configurazione rivista dall'ufficio è rivalidata e l'assieme
 * rigenerato sul server (mai quello del client), prezzato con il listino **attivo** più
 * voci manuali, sconto e aliquota IVA scelti; l'istantanea (stessa forma di quella del
 * sito, `StoredQuote`) va in `quotes` come `definitivo`. Facoltativi: stato
 * `preventivo-inviato` ed email al cliente con il PDF (rigenerato dall'istantanea).
 */

export const MAX_MANUAL_LINES = 20;

export const ManualLineSchema = z
  .object({
    description: z.string().trim().min(1, "descrizione obbligatoria").max(200, "descrizione: al massimo 200 caratteri"),
    /** Importo netto (IVA esclusa) in centesimi; negativo = riduzione. */
    amountCents: z.number().int("importo in centesimi interi").min(-100_000_000).max(100_000_000),
  })
  .strict();

export const FinalQuoteInputSchema = z
  .object({
    leadId: z.string().min(1).max(100),
    config: z.unknown(),
    manualLines: z.array(ManualLineSchema).max(MAX_MANUAL_LINES).default([]),
    /** Sconto dell'ufficio: percentuale sul subtotale o importo fisso in centesimi. */
    discount: z
      .object({ kind: z.enum(["percento", "fisso"]), value: z.number().positive("lo sconto deve essere maggiore di 0") })
      .strict()
      .refine((d) => d.kind === "fisso" ? Number.isInteger(d.value) : d.value <= 100, "sconto non valido")
      .nullable()
      .default(null),
    /** Id dell'aliquota IVA del listino (`ordinaria` 22%, `ristrutturazione` 10%). */
    vat: z.string().min(1).max(64),
    markSent: z.boolean().default(false),
    sendEmail: z.boolean().default(false),
  })
  .strict();
export type FinalQuoteInput = z.input<typeof FinalQuoteInputSchema>;

export interface FinalQuoteResult {
  readonly quoteId: string;
  readonly totalCents: number;
  readonly status: string;
  /** Email al cliente accodata (l'invio può fallire senza annullare il salvataggio). */
  readonly emailQueued: boolean;
}

const invalid = (message: string) => new RepositoryError("non-valido", message);
const DOMAIN_ERRORS = [GeometryError, HardwareError, JointError, MachiningError, ParamError, TemplateError] as const;

/** Istantanea più recente salvata della richiesta (titolo commerciale, immagine della scena). */
function latestStored(detail: LeadDetail): StoredQuote | null {
  for (const q of detail.quotes) {
    const r = StoredQuoteSchema.safeParse(q.quote);
    if (r.success) return r.data;
  }
  return null;
}

/** Prezzo del definitivo (puro rispetto al DB: il listino arriva dal chiamante). */
export function priceFinalQuote(
  config: ConfiguratoreConfig,
  input: Pick<z.infer<typeof FinalQuoteInputSchema>, "manualLines" | "discount" | "vat">,
  catalog: Pick<Parameters<typeof priceAssembly>[0], "priceList" | "version" | "ruleSetVersion">,
): Quote {
  if (!catalog.priceList.vatRates.some((v) => v.id === input.vat)) throw invalid(`aliquota IVA "${input.vat}" non presente nel listino`);
  let assembly;
  try {
    assembly = assemblyFromConfig(config);
  } catch (e) {
    if (DOMAIN_ERRORS.some((E) => e instanceof E)) throw invalid(`configurazione non generabile: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
  return priceAssembly({
    assembly,
    envelope: config.envelope,
    options: {
      ...pricingOptionsOf(commercialOf(config)),
      vat: input.vat,
      ...(input.discount ? { discounts: [{ id: "sconto-ufficio", label: "Sconto", kind: input.discount.kind, value: input.discount.value }] } : {}),
    },
    priceList: catalog.priceList,
    version: catalog.version,
    ...(catalog.ruleSetVersion ? { ruleSetVersion: catalog.ruleSetVersion } : {}),
    manualLines: input.manualLines,
  });
}

export async function saveFinalQuote(raw: FinalQuoteInput, userId: string): Promise<FinalQuoteResult> {
  const input = FinalQuoteInputSchema.parse(raw);
  const detail = await get(input.leadId);

  let config: ConfiguratoreConfig;
  try {
    config = parseConfigFile(input.config);
  } catch (e) {
    if (e instanceof ConfigFileError) throw invalid(`configurazione non valida: ${e.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    throw e;
  }

  const [listino, regole] = await Promise.all([getActive("listino"), getActive("regole")]);
  if (!listino) throw new ConflictError("nessun listino attivo: pubblica un listino prima di salvare il preventivo definitivo");
  const quote = priceFinalQuote(config, input, {
    priceList: listino.data,
    version: { id: listino.id, version: listino.version, effectiveFrom: listino.effectiveFrom, status: "attiva" },
    ruleSetVersion: regole?.id,
  });

  const previous = latestStored(detail);
  const commercial = commercialOf(config);
  const title = previous?.typology.slug === config.typology ? previous.typology.title : getTypology(config.typology).name;
  const customerQuote = customerView(quote);
  const stored: StoredQuote = {
    schema: STORED_QUOTE_SCHEMA,
    typology: { slug: config.typology, title },
    customerQuote,
    notes: [],
    commercial: { species: commercial.species, quality: commercial.quality, treatment: commercial.treatment, covering: commercial.covering },
    declared: { access: commercial.access, ...(commercial.anchoring ? { anchoring: commercial.anchoring } : {}), ...(commercial.cap ? { cap: commercial.cap } : {}) },
    sceneImageId: previous?.sceneImageId ?? null,
    office: JSON.parse(quoteToJSON(quote)),
  };
  const saved = await addFinalQuote(
    detail.lead.id,
    {
      config: JSON.parse(serializeConfig(config)),
      quote: stored,
      totalCents: quote.totals.totalCents,
      priceListVersionId: listino.id,
      ruleSetVersionId: regole?.id ?? null,
      siteFactors: quote.siteFactors,
    },
    input.manualLines,
    userId,
  );

  let status: string = detail.lead.status;
  if (input.markSent && status !== "preventivo-inviato") status = (await changeStatus(detail.lead.id, "preventivo-inviato", userId, "preventivo definitivo inviato")).status;

  let emailQueued = false;
  const customer = detail.lead.customer as LeadCustomer;
  if (input.sendEmail && customer.email) {
    try {
      const env = getEnv();
      const { token, expiresAt } = await issueCustomerToken(detail.lead.id);
      const entry = await enqueue({
        template: "preventivo-definitivo",
        to: customer.email,
        leadId: detail.lead.id,
        payload: {
          leadId: detail.lead.id,
          code: detail.lead.code,
          name: customer.name,
          typology: title,
          total: formatEuro(customerQuote.totalCents),
          link: `${env.siteUrl}/p/${token}`,
          expiresOn: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(expiresAt),
        },
      });
      emailQueued = true;
      await flush({ ids: [entry.id] }).catch((e) => console.error("[preventivo] invio email non riuscito", e instanceof Error ? e.message : e));
    } catch (e) {
      console.error("[preventivo] accodamento email non riuscito", e instanceof Error ? `${e.name}: ${e.message}` : e);
    }
  }
  return { quoteId: saved.id, totalCents: saved.totalCents, status, emailQueued };
}
