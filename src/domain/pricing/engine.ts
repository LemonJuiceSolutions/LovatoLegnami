import type { ZodType } from "zod";
import type { Envelope } from "../envelope/types";
import { parseWith } from "../components/schemas";
import { canonicalJson } from "../math/canonical";
import { planAssemblyCuts } from "./assembly-cuts";
import type { PlanTuning } from "./cutting-stock";
import { complicationsPhase } from "./phases/complications";
import { coveringPhase } from "./phases/covering";
import { hardwarePhase } from "./phases/hardware";
import { labourPhase } from "./phases/labour";
import { machiningPhase } from "./phases/machining";
import { EMPTY_STATE, type Phase, type PricingAssembly, type PricingContext } from "./phases/shared";
import { timberPhase } from "./phases/timber";
import { computeTotals } from "./phases/totals";
import { transportPhase } from "./phases/transport";
import { treatmentsPhase } from "./phases/treatments";
import { siteFactors as computeSiteFactors, type SiteFactorsOptions } from "./site-factors";
import {
  PricingOptionsSchema,
  QUOTE_CATEGORIES,
  versionLabel,
  type PriceList,
  type PriceListVersion,
  type PricingOptions,
  type PricingOptionsInput,
  type Quote,
  type QuoteCategory,
  type QuoteGroup,
  type QuoteLine,
  type SiteFactors,
} from "./types";

/**
 * Motore di preventivazione (P1): funzione pura `assieme + ingombro + opzioni + listino →
 * Quote`. Esegue le fasi di costo in ordine fisso, poi i totali (margini → sconti →
 * minimo d'ordine → imponibile → IVA → arrotondamento). Nessun valore cablato: tutto dal
 * listino; prezzi o tariffe mancanti diventano avvisi e lo stato `incompleto`.
 */

/** Fasi di costo nell'ordine di esecuzione (nome → fase); i totali seguono sempre. */
export const COST_PHASES: readonly (readonly [string, Phase])[] = [
  ["legno", timberPhase],
  ["lavorazioni", machiningPhase],
  ["ferramenta", hardwarePhase],
  ["trattamenti", treatmentsPhase],
  ["copertura", coveringPhase],
  ["montaggio", labourPhase],
  ["complicazioni", complicationsPhase],
  ["trasporto", transportPhase],
];

export interface PriceAssemblyInput {
  readonly assembly: PricingAssembly;
  readonly envelope: Envelope;
  /** Opzioni commerciali (validate con `PricingOptionsSchema`). */
  readonly options: PricingOptionsInput;
  readonly priceList: PriceList;
  readonly version: PriceListVersion;
  /** Versione del set di regole costruttive usato per l'assieme (solo registrata). */
  readonly ruleSetVersion?: string;
  /** Sostituzioni dei fattori di cantiere calcolati (simulatore admin, test). */
  readonly siteFactors?: Partial<SiteFactors>;
  /** Opzioni del calcolo dei fattori (provider delle deviazioni della pianta, gruppo 5). */
  readonly siteFactorsOptions?: SiteFactorsOptions;
  /** Limiti del miglioramento del taglio (default di `planCuts`). */
  readonly cutTuning?: PlanTuning;
}

/** Etichette dei gruppi per categoria. */
export const CATEGORY_LABELS: Readonly<Record<QuoteCategory, string>> = {
  legno: "Legno",
  sfrido: "Sfrido e recuperi",
  lavorazioni: "Lavorazioni CNC",
  ferramenta: "Ferramenta",
  trattamenti: "Trattamenti",
  copertura: "Copertura",
  montaggio: "Montaggio",
  complicazioni: "Complicazioni di cantiere",
  trasporto: "Trasporto",
  sconti: "Sconti",
  margine: "Margini",
  adeguamenti: "Adeguamenti",
  iva: "IVA",
};

/** Righe raggruppate per categoria, nell'ordine di `QUOTE_CATEGORIES` (solo categorie presenti). */
export function groupLines(lines: readonly QuoteLine[]): QuoteGroup[] {
  return QUOTE_CATEGORIES.flatMap((category) => {
    const ls = lines.filter((l) => l.category === category);
    return ls.length ? [{ category, label: CATEGORY_LABELS[category], amountCents: ls.reduce((s, l) => s + l.amountCents, 0), lines: ls }] : [];
  });
}

/** Valida le opzioni commerciali; `ValidationError` con il percorso del campo. */
export const parsePricingOptions = (data: unknown): PricingOptions =>
  parseWith(PricingOptionsSchema as unknown as ZodType<PricingOptions>, data, "opzioni commerciali non valide");

/** Preventivo deterministico dell'assieme. */
export function priceAssembly(input: PriceAssemblyInput): Quote {
  const options = parsePricingOptions(input.options);
  const { assembly, envelope, priceList, version } = input;
  const factors: SiteFactors = {
    ...computeSiteFactors(envelope, assembly, { access: options.access, anchoring: options.anchoring }, input.siteFactorsOptions),
    ...input.siteFactors,
  };
  const ctx: PricingContext = {
    assembly,
    envelope,
    options,
    priceList,
    version,
    versionLabel: versionLabel(version),
    siteFactors: factors,
    cutPlan: planAssemblyCuts(assembly, priceList, options, input.cutTuning),
  };
  const state = COST_PHASES.reduce((s, [, phase]) => phase(ctx, s), EMPTY_STATE);
  const totals = computeTotals(state.lines, priceList, options, ctx.versionLabel);
  const lines = [...state.lines, ...totals.lines];
  const warnings = [...state.warnings, ...totals.warnings];
  return {
    status: warnings.some((w) => w.blocking) ? "incompleto" : "completo",
    ...(assembly.typologySlug !== undefined ? { typologySlug: assembly.typologySlug } : {}),
    priceListVersion: version,
    ...(input.ruleSetVersion !== undefined ? { ruleSetVersion: input.ruleSetVersion } : {}),
    options,
    lines,
    groups: groupLines(lines),
    totals: totals.totals,
    warnings,
    siteFactors: factors,
    firedRules: state.firedRules,
    cutPlan: ctx.cutPlan,
    indicativityPct: priceList.indicativityPct,
    roundingStepCents: priceList.roundingStepCents,
  };
}

/** Serializzazione canonica del preventivo (chiavi ordinate, numeri a 1e-6): byte per byte stabile. */
export const quoteToJSON = (quote: Quote): string => canonicalJson(quote);
