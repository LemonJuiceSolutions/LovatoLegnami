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
import { MoneyError } from "./money";
import { EMPTY_STATE, line, type Phase, type PricingAssembly, type PricingContext } from "./phases/shared";
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
  /**
   * Voci manuali dell'ufficio (preventivo definitivo, 10.4): importi netti in centesimi
   * (anche negativi), categoria `manuali`, dopo i costi e prima di margini e sconti; non
   * hanno margine ma entrano nel subtotale su cui si calcolano sconti percentuali e IVA.
   */
  readonly manualLines?: readonly ManualLine[];
}

/** Voce manuale del preventivo definitivo. */
export interface ManualLine {
  readonly description: string;
  readonly amountCents: number;
}

/** Righe `manuale-<n>` delle voci manuali (descrizione su una riga, importo intero). */
export function manualQuoteLines(manual: readonly ManualLine[], versionLabel: string): QuoteLine[] {
  return manual.map((m, i) => {
    if (!Number.isInteger(m.amountCents)) throw new MoneyError(`voce manuale ${i + 1}: importo non intero (centesimi)`);
    return line({
      code: `manuale-${i + 1}`,
      category: "manuali",
      label: m.description.replace(/\s+/g, " ").trim() || `Voce ${i + 1}`,
      quantity: 1,
      unit: "pz",
      unitPriceCents: m.amountCents,
      amountCents: m.amountCents,
      explain: ["voce inserita dall'ufficio", versionLabel],
    });
  });
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
  manuali: "Voci aggiuntive",
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
  const costLines = input.manualLines?.length ? [...state.lines, ...manualQuoteLines(input.manualLines, ctx.versionLabel)] : state.lines;
  const totals = computeTotals(costLines, priceList, options, ctx.versionLabel);
  const lines = [...costLines, ...totals.lines];
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
