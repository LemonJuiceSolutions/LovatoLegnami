import { percent, roundToStep, sub, sum, type Cents } from "../money";
import type { Discount, PriceList, PricingOptions, PricingWarning, QuoteCategory, QuoteLine, QuoteTotals } from "../types";
import { fmt, fmtPrice, line } from "./shared";

/**
 * Fase `totals` (spec "Margini, sconti, IVA, arrotondamenti e minimo d'ordine"), in ordine
 * fisso: costi → margini (materiali e manodopera, righe `ufficio`) → sconti → minimo
 * d'ordine → imponibile → IVA → arrotondamento al passo. Ogni passaggio è una riga.
 */

/** Categorie a cui si applica il margine materiali (produzione in officina compresa). */
export const MATERIAL_CATEGORIES: readonly QuoteCategory[] = ["legno", "sfrido", "lavorazioni", "ferramenta", "trattamenti", "copertura"];
/** Categorie a cui si applica il margine manodopera (cantiere). */
export const LABOUR_CATEGORIES: readonly QuoteCategory[] = ["montaggio", "complicazioni"];
/** Categorie di costo (tutto ciò che precede i margini). Il trasporto non ha margine. */
export const COST_CATEGORIES: readonly QuoteCategory[] = [...MATERIAL_CATEGORIES, ...LABOUR_CATEGORIES, "trasporto"];

export interface TotalsResult {
  readonly lines: readonly QuoteLine[];
  readonly warnings: readonly PricingWarning[];
  readonly totals: QuoteTotals;
}

const amountOf = (lines: readonly QuoteLine[], cats: readonly QuoteCategory[]): Cents =>
  sum(lines.filter((l) => cats.includes(l.category)).map((l) => l.amountCents));

/**
 * Totali dalle righe di costo: restituisce le righe aggiunte (margini, sconti, minimo,
 * IVA, arrotondamento), gli avvisi e i totali. Pura: usata dalla fase e nei test.
 */
export function computeTotals(costLines: readonly QuoteLine[], priceList: PriceList, options: Pick<PricingOptions, "discounts" | "vat">, versionLabel: string): TotalsResult {
  const out: QuoteLine[] = [];
  const warnings: PricingWarning[] = [];
  const costCents = amountOf(costLines, COST_CATEGORIES);

  // 1. margini (solo vista ufficio)
  const margins: [string, string, QuoteCategory[], number][] = [
    ["margine-materiali", "Margine materiali", [...MATERIAL_CATEGORIES], priceList.margins.materialsPct],
    ["margine-manodopera", "Margine manodopera", [...LABOUR_CATEGORIES], priceList.margins.labourPct],
  ];
  for (const [code, label, cats, pct] of margins) {
    if (pct <= 0) continue;
    const base = amountOf(costLines, cats);
    out.push(
      line({
        code,
        category: "margine",
        label,
        quantity: pct,
        unit: "%",
        unitPriceCents: base,
        amountCents: percent(base, pct),
        explain: [`${fmt(pct)}% di ${fmtPrice(base)} (${cats.join(", ")})`, versionLabel],
        visibility: "ufficio",
      }),
    );
  }
  const marginCents = sum(out.map((l) => l.amountCents));
  const subtotal = costCents + marginCents;

  // 2. sconti: percentuali sul subtotale (non cumulativi), fissi in centesimi; mai oltre il subtotale
  const discounts: Discount[] = [];
  for (const d of options.discounts ?? []) {
    if (typeof d !== "string") {
      discounts.push(d);
      continue;
    }
    const found = priceList.discounts.find((x) => x.id === d);
    if (found) discounts.push(found);
    else warnings.push({ code: "opzione-sconosciuta", message: `sconto "${d}" non presente nel listino: ignorato`, ref: d, blocking: false });
  }
  let discounted = 0;
  for (const d of discounts) {
    const wanted = d.kind === "percento" ? percent(subtotal, d.value) : d.value;
    const amount = Math.min(wanted, Math.max(0, subtotal - discounted));
    discounted += amount;
    out.push(
      line({
        code: `sconto-${d.id}`,
        category: "sconti",
        label: `Sconto – ${d.label}`,
        quantity: d.kind === "percento" ? d.value : 1,
        unit: d.kind === "percento" ? "%" : "€",
        unitPriceCents: d.kind === "percento" ? subtotal : d.value,
        amountCents: -amount,
        explain: [
          d.kind === "percento" ? `${fmt(d.value)}% di ${fmtPrice(subtotal)}` : `sconto fisso ${fmtPrice(d.value)}`,
          ...(amount < wanted ? [`limitato a ${fmtPrice(amount)} (lo sconto non supera il totale)`] : []),
          versionLabel,
        ],
      }),
    );
  }
  const discountCents = -discounted;
  const afterDiscounts = subtotal + discountCents;

  // 3. minimo d'ordine
  const min = priceList.minimumOrderCents;
  const minimumAdjustmentCents = afterDiscounts < min ? min - afterDiscounts : 0;
  if (minimumAdjustmentCents > 0) {
    out.push(
      line({
        code: "minimo-ordine",
        category: "adeguamenti",
        label: "Adeguamento al minimo d'ordine",
        quantity: 1,
        unit: "€",
        unitPriceCents: minimumAdjustmentCents,
        amountCents: minimumAdjustmentCents,
        explain: [`imponibile ${fmtPrice(afterDiscounts)} inferiore al minimo d'ordine ${fmtPrice(min)}`, versionLabel],
      }),
    );
  }
  const taxableCents = afterDiscounts + minimumAdjustmentCents;

  // 4. IVA
  let vat = priceList.vatRates.find((v) => v.id === (options.vat ?? priceList.defaultVat));
  if (!vat) {
    warnings.push({ code: "opzione-sconosciuta", message: `aliquota IVA "${options.vat}" non presente nel listino: usata "${priceList.defaultVat}"`, ref: options.vat, blocking: true });
    vat = priceList.vatRates.find((v) => v.id === priceList.defaultVat)!;
  }
  const vatCents = percent(taxableCents, vat.pct);
  out.push(
    line({
      code: `iva-${vat.id}`,
      category: "iva",
      label: vat.label,
      quantity: vat.pct,
      unit: "%",
      unitPriceCents: taxableCents,
      amountCents: vatCents,
      explain: [`${fmt(vat.pct)}% di ${fmtPrice(taxableCents)} di imponibile`, versionLabel],
    }),
  );

  // 5. arrotondamento del totale IVA inclusa al passo
  const gross = taxableCents + vatCents;
  const totalCents = roundToStep(gross, priceList.roundingStepCents);
  const roundingCents = sub(totalCents, gross);
  if (roundingCents !== 0) {
    out.push(
      line({
        code: "arrotondamento",
        category: "adeguamenti",
        label: "Arrotondamento",
        quantity: 1,
        unit: "€",
        unitPriceCents: roundingCents,
        amountCents: roundingCents,
        explain: [`totale ${fmtPrice(gross)} arrotondato al passo di ${fmtPrice(priceList.roundingStepCents)}: ${fmtPrice(totalCents)}`, versionLabel],
      }),
    );
  }

  return {
    lines: out,
    warnings,
    totals: { costCents, marginCents, discountCents, minimumAdjustmentCents, taxableCents, vatPct: vat.pct, vatCents, roundingCents, totalCents },
  };
}
