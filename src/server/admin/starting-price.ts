import type { Preset, PriceList, PriceListVersion, RuleSet } from "@/domain";
import { computeStartingPrice, startingPriceConfig } from "@/server/quotes/starting-price";

/**
 * Prezzo "a partire da" di un preset nella scheda della tipologia (9.7, spec
 * `back-office-admin`): delega alla definizione unica di `server/quotes/starting-price.ts`
 * (stessa configurazione, flusso e finitura delle pagine pubbliche e del wizard).
 * `null` se il preventivo è incompleto o il preset non è generabile.
 */
export function startingPrice(
  preset: Preset,
  priceList: PriceList,
  version: PriceListVersion,
  ruleSet?: RuleSet,
): { cents: number; label: string } | null {
  const price = computeStartingPrice(startingPriceConfig(preset.typologySlug, preset), { priceList, priceListVersion: version, ...(ruleSet ? { ruleSet } : {}) });
  return price ? { cents: price.totalCents, label: price.label } : null;
}
