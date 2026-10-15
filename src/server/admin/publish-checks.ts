import {
  evaluateRules,
  generate,
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
 * Regole: ogni tipologia registrata generata con i parametri di default e valutata con il
 * set in bozza. Errore di generazione o violazione bloccante su una tipologia **visibile**
 * ⇒ rifiuto "tipologie non generabili: …"; sulle altre è solo un avviso.
 */
export function checkRuleSet(ruleSet: RuleSet, visible: readonly string[]): PublishCheck {
  const broken: string[] = [];
  const hidden: string[] = [];
  for (const { slug } of listTypologies()) {
    let failed = false;
    try {
      const assembly = generate(slug);
      failed = !evaluateRules(assembly, ruleSet).valid;
    } catch {
      failed = true;
    }
    if (failed) (visible.includes(slug) ? broken : hidden).push(slug);
  }
  return {
    blocking: broken.length ? [`tipologie non generabili: ${broken.join(", ")}`] : [],
    warnings: hidden.length ? [`tipologie non visibili sul sito che con i default violano le regole: ${hidden.join(", ")}`] : [],
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
