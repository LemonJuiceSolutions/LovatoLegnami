import { z } from "zod";
import type { CutGroup } from "./assembly-cuts";
import { percent, roundToStep, sub, type Cents } from "./money";
import { LABOUR_CATEGORIES, MATERIAL_CATEGORIES } from "./phases/totals";
import {
  IsoDateSchema,
  versionLabel,
  type PricingWarning,
  type Quote,
  type QuoteCategory,
  type QuoteGroup,
  type QuoteLine,
  type QuoteTotals,
  type SiteFactors,
} from "./types";

/**
 * Viste del preventivo (P1, spec "Viste cliente e ufficio"). Entrambe sono **proiezioni**
 * dello stesso `Quote`, mai un calcolo diverso: la vista cliente raggruppa le righe in
 * poche voci, ridistribuisce i margini nelle voci (centesimo per centesimo) e non espone
 * margini, tariffe, prezzi unitari né piano di taglio.
 */

// ---------------------------------------------------------------------------
// Vista ufficio

export interface OfficeCutGroup {
  readonly key: string;
  readonly sectionLabel: string;
  readonly pricing: CutGroup["pricing"];
  readonly wastePct: number;
  readonly costCents: Cents;
  readonly piecesVolumeM3: number;
  readonly barsVolumeM3: number;
  readonly bars: readonly { readonly length: number; readonly cuts: readonly { readonly id: string; readonly length: number }[]; readonly offcut: number; readonly reusable: boolean }[];
  readonly nonRicavabili: readonly { readonly id: string; readonly length: number }[];
}

export interface FiredRule {
  readonly id: string;
  readonly label: string;
  readonly amountCents: Cents;
  readonly explain: readonly string[];
}

export interface OfficeView {
  readonly status: Quote["status"];
  readonly typologySlug?: string;
  readonly versionLabel: string;
  readonly ruleSetVersion?: string;
  /** Tutte le righe, raggruppate per categoria. */
  readonly groups: readonly QuoteGroup[];
  readonly totals: QuoteTotals;
  readonly cutPlan: {
    readonly groups: readonly OfficeCutGroup[];
    readonly curved: Quote["cutPlan"]["curved"];
    readonly panels: Quote["cutPlan"]["panels"];
    readonly totals: Quote["cutPlan"]["totals"];
  };
  readonly siteFactors: SiteFactors;
  /** Regole di complicazione scattate con la loro riga, in ordine. */
  readonly firedRules: readonly FiredRule[];
  readonly warnings: readonly PricingWarning[];
}

/** Vista ufficio: tutte le righe per categoria, piano di taglio, fattori, regole scattate, avvisi. */
export function officeView(quote: Quote): OfficeView {
  const byRule = new Map(quote.lines.filter((l) => l.ruleId).map((l) => [l.ruleId!, l]));
  return {
    status: quote.status,
    ...(quote.typologySlug !== undefined ? { typologySlug: quote.typologySlug } : {}),
    versionLabel: versionLabel(quote.priceListVersion),
    ...(quote.ruleSetVersion !== undefined ? { ruleSetVersion: quote.ruleSetVersion } : {}),
    groups: quote.groups,
    totals: quote.totals,
    cutPlan: {
      groups: quote.cutPlan.groups.map((g) => ({
        key: g.key,
        sectionLabel: g.sectionLabel,
        pricing: g.pricing,
        wastePct: g.wastePct,
        costCents: g.costCents,
        piecesVolumeM3: g.piecesVolumeM3,
        barsVolumeM3: g.barsVolumeM3,
        bars: g.plan.bars.map((b) => ({ length: b.length, cuts: b.cuts.map((c) => ({ id: c.id, length: c.length })), offcut: b.offcut, reusable: b.reusable })),
        nonRicavabili: g.plan.nonRicavabili.map((d) => ({ id: d.id, length: d.length })),
      })),
      curved: quote.cutPlan.curved,
      panels: quote.cutPlan.panels,
      totals: quote.cutPlan.totals,
    },
    siteFactors: quote.siteFactors,
    firedRules: quote.firedRules.map((id) => {
      const l = byRule.get(id);
      return { id, label: l?.label ?? id, amountCents: l?.amountCents ?? 0, explain: l?.explain ?? [] };
    }),
    warnings: quote.warnings,
  };
}

// ---------------------------------------------------------------------------
// Vista cliente

export const CUSTOMER_GROUPS = ["struttura", "ferramenta-finiture", "copertura", "montaggio-trasporto", "altre-voci"] as const;
export type CustomerGroupId = (typeof CUSTOMER_GROUPS)[number];

/** Voci della vista cliente e categorie che raccolgono. */
export const CUSTOMER_GROUP_CATEGORIES: Readonly<Record<CustomerGroupId, readonly QuoteCategory[]>> = {
  struttura: ["legno", "sfrido", "lavorazioni"],
  "ferramenta-finiture": ["ferramenta", "trattamenti"],
  copertura: ["copertura"],
  "montaggio-trasporto": ["montaggio", "complicazioni", "trasporto"],
  /** Voci manuali del preventivo definitivo (mai presenti nel preventivo online). */
  "altre-voci": ["manuali"],
};

export const CUSTOMER_GROUP_LABELS: Readonly<Record<CustomerGroupId, string>> = {
  struttura: "Struttura in legno",
  "ferramenta-finiture": "Ferramenta e finiture",
  copertura: "Copertura",
  "montaggio-trasporto": "Montaggio e trasporto",
  "altre-voci": "Altre voci",
};

const cents = z.number().int();

/** Forma esatta (strict) della vista cliente: è anche la forma della risposta pubblica. */
export const CustomerQuoteSchema = z
  .object({
    status: z.enum(["completo", "incompleto"]),
    priceList: z.object({ version: z.number().int().min(1), effectiveFrom: IsoDateSchema }).strict(),
    groups: z.array(z.object({ id: z.enum(CUSTOMER_GROUPS), label: z.string(), amountCents: cents }).strict()),
    discountCents: cents.max(0),
    minimumAdjustmentCents: cents.min(0),
    taxableCents: cents,
    vatPct: z.number().min(0).max(100),
    vatCents: cents,
    roundingCents: cents,
    /** Totale IVA inclusa (uguale a quello della vista ufficio). */
    totalCents: cents,
    /** Fascia di indicatività: totale ∓ `pct`% arrotondati al passo. */
    range: z.object({ pct: z.number().min(0).max(100), minCents: cents, maxCents: cents }).strict(),
    notes: z.array(z.string()),
  })
  .strict();
export type CustomerQuote = z.infer<typeof CustomerQuoteSchema>;

const sumOf = (lines: readonly QuoteLine[], cats: readonly QuoteCategory[]): Cents =>
  lines.filter((l) => cats.includes(l.category)).reduce((s, l) => s + l.amountCents, 0);

/**
 * Ripartizione esatta di `total` sulle voci in proporzione ai pesi (resti più grandi:
 * la somma delle quote è sempre `total`; a parità, l'ordine delle voci).
 */
export function allocate(total: Cents, weights: readonly number[]): Cents[] {
  const positive = weights.map((w) => Math.max(0, w));
  const W = positive.reduce((s, w) => s + w, 0);
  if (W <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = positive.map((w) => (abs * w) / W);
  const shares = raw.map(Math.floor);
  let rest = abs - shares.reduce((s, x) => s + x, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    shares[i] += 1;
    rest -= 1;
  }
  return shares.map((s) => (s === 0 ? 0 : sign * s));
}

const NOTE_INDICATIVE = (pct: number) => `Prezzo indicativo (±${String(pct).replace(".", ",")}%), soggetto a sopralluogo.`;

/** Vista cliente: poche voci con i margini già distribuiti, sconti, minimo, IVA, totale e fascia. */
export function customerView(quote: Quote): CustomerQuote {
  const { lines, totals, indicativityPct, roundingStepCents } = quote;
  const present = CUSTOMER_GROUPS.filter((g) => lines.some((l) => CUSTOMER_GROUP_CATEGORIES[g].includes(l.category)));
  const base = present.map((g) => sumOf(lines, CUSTOMER_GROUP_CATEGORIES[g]));
  const materialsMargin = sumOf(lines.filter((l) => l.code === "margine-materiali"), ["margine"]);
  const labourMargin = sumOf(lines.filter((l) => l.code === "margine-manodopera"), ["margine"]);
  const matShares = allocate(materialsMargin, present.map((g) => sumOf(lines, CUSTOMER_GROUP_CATEGORIES[g].filter((c) => MATERIAL_CATEGORIES.includes(c)))));
  const labShares = allocate(labourMargin, present.map((g) => sumOf(lines, CUSTOMER_GROUP_CATEGORIES[g].filter((c) => LABOUR_CATEGORIES.includes(c)))));
  const groups = present.map((id, i) => ({ id, label: CUSTOMER_GROUP_LABELS[id], amountCents: base[i] + matShares[i] + labShares[i] }));

  const delta = percent(totals.totalCents, indicativityPct);
  const range = {
    pct: indicativityPct,
    minCents: roundToStep(sub(totals.totalCents, delta), roundingStepCents),
    maxCents: roundToStep(totals.totalCents + delta, roundingStepCents),
  };

  const notes = [NOTE_INDICATIVE(indicativityPct)];
  if (quote.status === "incompleto") notes.push("Alcune voci vanno verificate dal nostro ufficio: il prezzo definitivo è su richiesta.");
  if (quote.warnings.some((w) => w.code === "zona-da-verificare")) notes.push("Il costo del trasporto va verificato per la zona di consegna.");
  const site = lines.filter((l) => l.category === "complicazioni").map((l) => l.label.replace(/^Complicazione:\s*/, "").toLowerCase());
  if (site.length) notes.push(`Il prezzo comprende le lavorazioni di cantiere per: ${site.join(", ")}.`);
  if (totals.minimumAdjustmentCents > 0) notes.push("È applicato l'importo minimo d'ordine.");

  return {
    status: quote.status,
    priceList: { version: quote.priceListVersion.version, effectiveFrom: quote.priceListVersion.effectiveFrom },
    groups,
    discountCents: totals.discountCents,
    minimumAdjustmentCents: totals.minimumAdjustmentCents,
    taxableCents: totals.taxableCents,
    vatPct: totals.vatPct,
    vatCents: totals.vatCents,
    roundingCents: totals.roundingCents,
    totalCents: totals.totalCents,
    range,
    notes,
  };
}
