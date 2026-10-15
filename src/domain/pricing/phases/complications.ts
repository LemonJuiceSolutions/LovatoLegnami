import { percent, roundHalfUp } from "../money";
import { SITE_FACTOR_LABELS, SITE_FACTOR_UNITS } from "../site-factors";
import type { ComplicationCondition, ComplicationRule, QuoteLine, SiteFactors } from "../types";
import { append, fmt, fmtPrice, line, round6, type Phase } from "./shared";

/**
 * Fase `complications` (P3, spec "Montaggio e complicazioni"): regole del listino valutate
 * **in ordine**, condizioni in AND sui fattori di cantiere; ogni regola scattata produce una
 * riga con la condizione soddisfatta nella spiegazione. Effetti: `ore` (ore aggiuntive),
 * `percento-ore` (percentuale delle **ore base**, non cumulativa sulle regole precedenti),
 * `fisso` (centesimi), `percento-legno` (percentuale del costo legno + sfrido). In coda la
 * soglia di ponteggio del listino (`labour.scaffoldHeightMm`).
 */

const factorValue = (factors: SiteFactors, c: ComplicationCondition): number | string => factors[c.factor];

/** `true` se la condizione è soddisfatta dai fattori. */
export function conditionHolds(factors: SiteFactors, c: ComplicationCondition): boolean {
  const v = factorValue(factors, c);
  switch (c.op) {
    case ">":
      return typeof v === "number" && typeof c.value === "number" && v > c.value;
    case ">=":
      return typeof v === "number" && typeof c.value === "number" && v >= c.value;
    case "==":
      return v === c.value;
    case "in":
      return Array.isArray(c.value) && typeof v === "string" && c.value.includes(v);
  }
}

/** Regola scattata: tutte le condizioni vere (e regola attiva). */
export const ruleFires = (rule: ComplicationRule, factors: SiteFactors): boolean =>
  rule.enabled && rule.conditions.every((c) => conditionHolds(factors, c));

const show = (factor: keyof SiteFactors, v: number | string | readonly string[]): string => {
  if (Array.isArray(v)) return v.join(", ");
  return typeof v === "number" ? `${fmt(v, 1)}${SITE_FACTOR_UNITS[factor]}` : String(v);
};

/** Valore attuale del fattore: `6°`, `180 mm`, `medio`. */
const actual = (factors: SiteFactors, c: ComplicationCondition): string => show(c.factor, factorValue(factors, c));

/** Condizione soddisfatta in parole: `deviazione dallo squadro 6° > 3°`. */
export function describeCondition(factors: SiteFactors, c: ComplicationCondition): string {
  const op = c.op === "in" ? "tra" : c.op === "==" ? "=" : c.op === ">=" ? "≥" : ">";
  return `${SITE_FACTOR_LABELS[c.factor]} ${actual(factors, c)} ${op} ${show(c.factor, c.value)}`;
}

export const complicationsPhase: Phase = (ctx, state) => {
  const factors = ctx.siteFactors;
  const lab = ctx.priceList.labour;
  const rate = lab.hourlyRateCents;
  const base = state.labourBaseHours;
  const timberCost = state.lines.filter((l) => l.category === "legno" || l.category === "sfrido").reduce((s, l) => s + l.amountCents, 0);
  const lines: QuoteLine[] = [];
  const fired: string[] = [];
  let extraHours = 0;

  for (const rule of ctx.priceList.complications) {
    if (!ruleFires(rule, factors)) continue;
    fired.push(rule.id);
    const values = rule.conditions.map((c) => actual(factors, c)).join(", ");
    const condition = rule.conditions.length
      ? `condizione: ${rule.conditions.map((c) => describeCondition(factors, c)).join(" e ")}`
      : "regola sempre attiva";
    const e = rule.effect;
    let quantity: number;
    let unit: string;
    let unitPriceCents: number;
    let amountCents: number;
    let how: string;
    switch (e.kind) {
      case "ore":
        quantity = e.value;
        unit = "h";
        unitPriceCents = rate;
        amountCents = roundHalfUp(rate * e.value);
        extraHours += e.value;
        how = `${fmt(e.value)} h aggiuntive × ${fmtPrice(rate, "h")}`;
        break;
      case "percento-ore": {
        const hours = round6((base * e.value) / 100);
        quantity = hours;
        unit = "h";
        unitPriceCents = rate;
        amountCents = roundHalfUp(rate * hours);
        extraHours += hours;
        how = `${fmt(e.value)}% delle ore base (${fmt(base)} h) = ${fmt(hours)} h × ${fmtPrice(rate, "h")}`;
        break;
      }
      case "fisso":
        quantity = 1;
        unit = "pz";
        unitPriceCents = e.value;
        amountCents = e.value;
        how = `importo fisso ${fmtPrice(e.value)}`;
        break;
      case "percento-legno":
        quantity = e.value;
        unit = "%";
        unitPriceCents = timberCost;
        amountCents = percent(timberCost, e.value);
        how = `${fmt(e.value)}% del costo del legno (${fmtPrice(timberCost)})`;
        break;
    }
    lines.push(
      line({
        code: `complicazione-${rule.id}`,
        category: "complicazioni",
        label: `Complicazione: ${rule.label.toLowerCase()}${values ? ` ${values}` : ""}`,
        quantity,
        unit,
        unitPriceCents,
        amountCents,
        explain: [condition, how, ...(rule.explain ? [rule.explain] : []), ctx.versionLabel],
        ruleId: rule.id,
      }),
    );
  }

  if (factors.maxHeightMm > lab.scaffoldHeightMm) {
    lines.push(
      line({
        code: "ponteggio",
        category: "complicazioni",
        label: "Trabattello/ponteggio",
        quantity: 1,
        unit: "pz",
        unitPriceCents: lab.scaffoldCents,
        amountCents: lab.scaffoldCents,
        explain: [
          `altezza massima ${fmt(factors.maxHeightMm, 0)} mm > soglia di ponteggio ${fmt(lab.scaffoldHeightMm, 0)} mm`,
          `importo fisso ${fmtPrice(lab.scaffoldCents)}`,
          ctx.versionLabel,
        ],
      }),
    );
  }
  return append(state, lines, [], { firedRules: [...state.firedRules, ...fired], labourExtraHours: round6(state.labourExtraHours + extraHours) });
};
