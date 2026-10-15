import {
  customerView,
  DEFAULT_LOVATO_RULES,
  formatEuro,
  priceAssembly,
  type CustomerQuote,
  type Preset,
  type PriceList,
  type PriceListVersion,
  type RuleSet,
} from "@/domain";
import { presetAssemblyConfig } from "@/server/admin/preset-config";
import { defaultConfig } from "@/stores/config";
import type { AssemblyConfig } from "./generate";
import { preparePublicAssembly, type PublicAssembly } from "./pipeline";

/**
 * Prezzo "a partire da" (unica definizione, correzione B del gruppo 12): lo usano il
 * back-office (scheda della tipologia, 9.7), le pagine pubbliche (11.2/11.3) e quindi il
 * passo 1 del wizard, così l'ufficio vede lo stesso numero che vede il cliente.
 *
 * - **Configurazione**: il preset di riferimento (parametri risolti, ingombro del preset o
 *   contenitore dell'assieme, `presetAssemblyConfig`), altrimenti i default della tipologia.
 * - **Flusso**: lo stesso della stima pubblica (`preparePublicAssembly`: adattamento
 *   all'ingombro e auto-dimensionamento con le regole indicate).
 * - **Finitura di base onesta**: abete lamellare (o la prima specie / qualità del listino
 *   se mancano), il trattamento **meno caro** del listino (il legno grezzo non si vende per
 *   esterni), nessuna copertura, accesso facile, nessun CAP.
 * - `null` se il preventivo non è `completo` o la configurazione non è generabile.
 */

export interface StartingFinish {
  readonly species: string;
  readonly quality: string;
  readonly treatment: string | null;
  readonly covering: null;
}

export interface StartingPriceCatalog {
  readonly priceList: PriceList;
  readonly priceListVersion: PriceListVersion;
  readonly ruleSet?: RuleSet;
  readonly ruleSetVersionId?: string;
}

export interface StartingPrice {
  readonly totalCents: number;
  /** "a partire da 4.300,00 €" */
  readonly label: string;
  readonly finish: StartingFinish;
  readonly quote: CustomerQuote;
  readonly prepared: PublicAssembly;
}

const prefer = (items: readonly { id: string }[], id: string): string | undefined => (items.some((x) => x.id === id) ? id : items[0]?.id);

/** Finitura del prezzo "a partire da" per il listino; `null` se il listino non ha specie o qualità. */
export function startingFinish(priceList: PriceList): StartingFinish | null {
  const species = prefer(priceList.timber.species, "abete");
  const quality = prefer(priceList.timber.qualities, "lamellare");
  if (!species || !quality) return null;
  const cheapest = [...priceList.treatments].sort((a, b) => a.pricePerM2Cents - b.pricePerM2Cents)[0];
  return { species, quality, treatment: cheapest?.id ?? null, covering: null };
}

/** Configurazione del prezzo "a partire da": preset di riferimento o default della tipologia. */
export function startingPriceConfig(typology: string, preset?: Preset): AssemblyConfig {
  if (preset) return presetAssemblyConfig(preset);
  const { params, envelope, embedment } = defaultConfig(typology);
  return { typology, params, envelope, embedment };
}

export function computeStartingPrice(config: AssemblyConfig, catalog: StartingPriceCatalog): StartingPrice | null {
  const finish = startingFinish(catalog.priceList);
  if (!finish) return null;
  try {
    const prepared = preparePublicAssembly(config, catalog.ruleSet ?? DEFAULT_LOVATO_RULES);
    const quote = priceAssembly({
      assembly: prepared.assembly,
      envelope: config.envelope,
      options: { ...finish, access: "facile" },
      priceList: catalog.priceList,
      version: catalog.priceListVersion,
      ...(catalog.ruleSetVersionId ? { ruleSetVersion: catalog.ruleSetVersionId } : {}),
    });
    if (quote.status !== "completo") return null;
    const view = customerView(quote);
    return { totalCents: view.totalCents, label: `a partire da ${formatEuro(view.totalCents)}`, finish, quote: view, prepared };
  } catch {
    return null;
  }
}
