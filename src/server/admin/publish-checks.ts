import {
  listTypologies,
  MVP_VISIBLE_TYPOLOGIES,
  PRESET_CATALOG,
  priceAssembly,
  type Preset,
  type PriceList,
  type RuleSet,
  type TypologySettings,
} from "@/domain";
import { assemblyFromConfig } from "@/server/quotes/generate";
import { preparePublicAssembly } from "@/server/quotes/pipeline";
import { startingPriceConfig } from "@/server/quotes/starting-price";
import { presetAssemblyConfig } from "./preset-config";

/**
 * Prove eseguite prima di pubblicare un dataset (P10, 9.4; spec `regole-costruttive`,
 * `listini-versionati`). Funzioni pure sui documenti: la action le chiama con la bozza e
 * con le versioni attive degli altri dataset.
 */

export interface PublishCheck {
  /** Problemi che impediscono la pubblicazione (messaggio completo in italiano). */
  readonly blocking: readonly string[];
  /** Segnalazioni non bloccanti (es. tipologia non visibile non generabile). */
  readonly warnings: readonly string[];
}

const ok: PublishCheck = { blocking: [], warnings: [] };

/** Tipologie visibili sul sito secondo le impostazioni attive (senza dataset: quelle dell'MVP). */
export const visibleTypologies = (settings: TypologySettings | null | undefined): string[] =>
  settings ? settings.filter((t) => t.visible).map((t) => t.slug) : [...MVP_VISIBLE_TYPOLOGIES];

/**
 * Regole: ogni tipologia registrata nella configurazione che il cliente vede per prima
 * (preset di riferimento delle impostazioni, altrimenti il primo preset della tipologia,
 * altrimenti i default) passata **dallo stesso flusso del wizard e della stima pubblica**
 * (`preparePublicAssembly`: adattamento all'ingombro e auto-dimensionamento) e valutata
 * con il set in bozza. Errore di generazione o violazione bloccante **residua** su una
 * tipologia **visibile** ⇒ rifiuto "tipologie non generabili: …"; sulle altre è un avviso.
 *
 * Correzione C del gruppo 12: la prova generava i soli default **senza** auto-dimensionare,
 * quindi un interasse massimo più stretto (es. 700 mm) era rifiutato perché la bifalda di
 * default ne ha uno maggiore, mentre il wizard e la stima lo correggono da soli
 * ricalcolando il numero di travetti. Ora è bloccante solo ciò che il cliente non potrebbe
 * comunque ottenere (regole che l'auto-dimensionamento non risolve, parametri impossibili).
 */
export function checkRuleSet(
  ruleSet: RuleSet,
  visible: readonly string[],
  presets: readonly Preset[] = PRESET_CATALOG,
  settings: TypologySettings | null = null,
): PublishCheck {
  const broken: string[] = [];
  const hidden: string[] = [];
  for (const { slug } of listTypologies()) {
    let failed = false;
    try {
      const refId = settings?.find((t) => t.slug === slug)?.referencePresetId;
      const preset = (refId ? presets.find((p) => p.id === refId) : undefined) ?? presets.find((p) => p.typologySlug === slug);
      const prepared = preparePublicAssembly(startingPriceConfig(slug, preset), ruleSet);
      failed = prepared.violations.some((v) => v.severity === "errore");
    } catch {
      failed = true;
    }
    if (failed) (visible.includes(slug) ? broken : hidden).push(slug);
  }
  return {
    blocking: broken.length ? [`tipologie non generabili: ${broken.join(", ")}`] : [],
    warnings: hidden.length ? [`tipologie non visibili sul sito che con queste regole non sono realizzabili: ${hidden.join(", ")}`] : [],
  };
}

/** Opzioni commerciali di prova: abete lamellare (default del wizard) o le prime del listino, con il primo trattamento e la prima copertura. */
export function probeOptions(pl: PriceList) {
  const pick = (ids: readonly { id: string }[], preferred: string) => (ids.some((x) => x.id === preferred) ? preferred : ids[0]!.id);
  return {
    species: pick(pl.timber.species, "abete"),
    quality: pick(pl.timber.qualities, "lamellare"),
    ...(pl.treatments[0] ? { treatment: pl.treatments[0].id } : {}),
    ...(pl.coverings[0] ? { covering: pl.coverings[0].id } : {}),
  };
}

/**
 * Listino: preventivo di prova di ogni preset con le opzioni di prova; un avviso
 * `prezzo-mancante` ⇒ rifiuto con il preset e la voce. Un preset non più generabile è un
 * avviso (non dipende dal listino).
 */
export function checkPriceList(pl: PriceList, presets: readonly Preset[]): PublishCheck {
  const missing = new Map<string, string[]>();
  const warnings: string[] = [];
  const options = probeOptions(pl);
  const version = { id: "prova", version: 0, effectiveFrom: "2000-01-01", status: "bozza" as const };
  for (const preset of presets) {
    let quote;
    try {
      const config = presetAssemblyConfig(preset);
      const assembly = assemblyFromConfig(config);
      quote = priceAssembly({ assembly, envelope: config.envelope, options, priceList: pl, version });
    } catch (e) {
      warnings.push(`preset ${preset.id} non preventivabile: ${(e as Error).message}`);
      continue;
    }
    for (const w of quote.warnings) {
      if (w.code !== "prezzo-mancante") continue;
      missing.set(preset.id, [...(missing.get(preset.id) ?? []), w.ref ?? w.message]);
    }
  }
  const blocking = [...missing].map(([id, refs]) => `prezzo mancante nel preset ${id}: ${[...new Set(refs)].join(", ")}`);
  return { blocking, warnings };
}

/** Tipologie: i preset di riferimento devono esistere nel dataset dei preset in vigore. */
export function checkTypologySettings(settings: TypologySettings, presets: readonly Preset[]): PublishCheck {
  const ids = new Set(presets.map((p) => p.id));
  const bad = settings.filter((t) => t.referencePresetId && !ids.has(t.referencePresetId)).map((t) => `${t.slug} → ${t.referencePresetId}`);
  return bad.length ? { blocking: [`preset di riferimento inesistenti: ${bad.join(", ")}`], warnings: [] } : ok;
}

/** Preset: non si può togliere un preset usato come riferimento dalle tipologie in vigore. */
export function checkPresets(presets: readonly Preset[], settings: TypologySettings | null): PublishCheck {
  if (!settings) return ok;
  const ids = new Set(presets.map((p) => p.id));
  const bad = settings.filter((t) => t.referencePresetId && !ids.has(t.referencePresetId)).map((t) => `${t.referencePresetId} (tipologia ${t.slug})`);
  return bad.length ? { blocking: [`preset usati come riferimento dalle tipologie: ${bad.join(", ")}`], warnings: [] } : ok;
}

/** Preset in vigore (dataset attivo o catalogo statico se il dataset non esiste). */
export const presetsOrCatalog = (active: readonly Preset[] | null | undefined): readonly Preset[] => active ?? PRESET_CATALOG;
