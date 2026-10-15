import { customerView, formatEuro, priceAssembly, type Preset, type PriceList, type PriceListVersion } from "@/domain";
import { assemblyFromConfig } from "@/server/quotes/generate";
import { presetAssemblyConfig } from "./preset-config";

/**
 * Prezzo "a partire da" di un preset (9.7, spec `back-office-admin`): totale della vista
 * cliente con il listino indicato, nelle finiture di base (abete lamellare o le prime del
 * listino, senza trattamento né copertura), arrotondato al passo del listino.
 * `null` se il preventivo è incompleto o il preset non è generabile.
 */
export function startingPrice(preset: Preset, priceList: PriceList, version: PriceListVersion): { cents: number; label: string } | null {
  try {
    const pick = (ids: readonly { id: string }[], preferred: string) => (ids.some((x) => x.id === preferred) ? preferred : ids[0]!.id);
    const config = presetAssemblyConfig(preset);
    const quote = priceAssembly({
      assembly: assemblyFromConfig(config),
      envelope: config.envelope,
      options: { species: pick(priceList.timber.species, "abete"), quality: pick(priceList.timber.qualities, "lamellare") },
      priceList,
      version,
    });
    if (quote.status !== "completo") return null;
    const total = customerView(quote).totalCents;
    return { cents: total, label: `a partire da ${formatEuro(total)}` };
  } catch {
    return null;
  }
}
