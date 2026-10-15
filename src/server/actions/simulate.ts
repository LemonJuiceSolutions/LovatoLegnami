"use server";

import { z } from "zod";
import { ACCESS_LEVELS, ANCHORING_KINDS, NUMERIC_SITE_FACTORS, type PricingOptionsInput, type SiteFactors } from "@/domain";
import { parseConfigFile } from "@/stores/config-file";
import { presetAssemblyConfig } from "@/server/admin/preset-config";
import { presetsOrCatalog } from "@/server/admin/publish-checks";
import { simulate, type PriceSource, type Simulation } from "@/server/admin/simulate";
import { ForbiddenError, requireUser } from "@/server/auth";
import { canPublishPriceList } from "@/server/auth/permissions";
import { getActive, getDraft, type DatasetVersion } from "@/server/repositories/datasets";
import { NotFoundError } from "@/server/repositories/errors";
import { get as getLead } from "@/server/repositories/leads";
import { StoredQuoteSchema } from "@/server/quotes/snapshot";
import type { AssemblyConfig } from "@/server/quotes/generate";
import { runAction, type ActionResult } from "./result";

/**
 * `simulateQuote` (9.8): preventivo di un preset o di una richiesta salvata con il listino
 * in bozza e con quello attivo, fattori di cantiere e CAP modificabili. Riservato a chi
 * modifica il listino; i dati del cliente della richiesta non escono (solo configurazione e
 * scelte commerciali).
 */

const factorShape = Object.fromEntries(NUMERIC_SITE_FACTORS.map((k) => [k, z.number().finite().min(0).max(1_000_000).optional()])) as Record<(typeof NUMERIC_SITE_FACTORS)[number], z.ZodOptional<z.ZodNumber>>;

const id = z.string().min(1).max(100);
const SimulateSchema = z
  .object({
    source: z.discriminatedUnion("kind", [z.object({ kind: z.literal("preset"), id }).strict(), z.object({ kind: z.literal("lead"), id }).strict()]),
    factors: z
      .object({ ...factorShape, access: z.enum(ACCESS_LEVELS).optional(), anchoring: z.enum(ANCHORING_KINDS).optional() })
      .strict()
      .default({}),
    options: z
      .object({
        species: id.optional(),
        quality: id.optional(),
        treatment: id.nullable().optional(),
        covering: id.nullable().optional(),
        cap: z.string().regex(/^\d{5}$/, "CAP non valido (5 cifre)").optional(),
      })
      .strict()
      .default({}),
  })
  .strict();

export type SimulateInput = z.input<typeof SimulateSchema>;
export type { Simulation, SimulationSide, LineDelta } from "@/server/admin/simulate";

const priceSource = (v: DatasetVersion<"listino"> | null): PriceSource | null =>
  v ? { priceList: v.data, version: { id: v.id, version: v.version, effectiveFrom: v.effectiveFrom, status: v.status } } : null;

async function configOf(source: z.infer<typeof SimulateSchema>["source"]): Promise<{ config: AssemblyConfig; commercial: Partial<PricingOptionsInput> }> {
  if (source.kind === "preset") {
    const presets = presetsOrCatalog((await getActive("preset"))?.data);
    const preset = presets.find((p) => p.id === source.id);
    if (!preset) throw new NotFoundError(`preset ${source.id} non trovato`);
    return { config: presetAssemblyConfig(preset), commercial: {} };
  }
  const detail = await getLead(source.id);
  const row = detail.quotes.find((q) => q.kind === "definitivo") ?? detail.quotes[0];
  if (!row) throw new NotFoundError("la richiesta non ha un preventivo salvato");
  const config = parseConfigFile(row.config, { keepInvalidParams: true });
  const stored = StoredQuoteSchema.safeParse(row.quote);
  const c = stored.success ? stored.data.commercial : null;
  const d = stored.success ? stored.data.declared : null;
  return {
    config: { typology: config.typology, params: config.params, envelope: config.envelope, embedment: config.embedment },
    commercial: {
      ...(c ? { species: c.species, quality: c.quality, treatment: c.treatment, covering: c.covering } : {}),
      ...(d ? { access: d.access, ...(d.anchoring ? { anchoring: d.anchoring } : {}), ...(d.cap ? { cap: d.cap } : {}) } : {}),
    },
  };
}

export async function simulateQuote(input: SimulateInput): Promise<ActionResult<Simulation>> {
  return runAction(async () => {
    const user = await requireUser();
    if (!canPublishPriceList(user)) throw new ForbiddenError("listino:scrivi");
    const v = SimulateSchema.parse(input);
    const [draft, active] = await Promise.all([getDraft("listino"), getActive("listino")]);
    const base = active ?? draft;
    if (!base) throw new NotFoundError("nessun listino da simulare");
    const { config, commercial } = await configOf(v.source);
    const pl = base.data;
    const pick = (ids: readonly { id: string }[], preferred: string) => (ids.some((x) => x.id === preferred) ? preferred : ids[0]!.id);
    const options: PricingOptionsInput = {
      species: pick(pl.timber.species, "abete"),
      quality: pick(pl.timber.qualities, "lamellare"),
      ...commercial,
      ...Object.fromEntries(Object.entries(v.options).filter(([, x]) => x !== undefined)),
      ...(v.factors.access ? { access: v.factors.access } : {}),
      ...(v.factors.anchoring ? { anchoring: v.factors.anchoring } : {}),
    };
    const factors = Object.fromEntries(Object.entries(v.factors).filter(([, x]) => x !== undefined)) as Partial<SiteFactors>;
    return simulate(config, options, factors, priceSource(draft), priceSource(active));
  });
}
