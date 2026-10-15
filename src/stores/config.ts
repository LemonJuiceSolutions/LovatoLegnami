import {
  DEFAULT_LOVATO_RULES,
  ParamError,
  TypologyNotFoundError,
  assemblyBounds,
  checkCollisions,
  defaultParams,
  evaluateRules,
  floorFunction,
  generate,
  getTypology,
  isParamVisible,
  listTypologies,
  loadPreset,
  parseEnvelope,
  resolveParams,
  wallBuildOptions,
  type Assembly,
  type Collision,
  type Envelope,
  type Measures,
  type ParamValue,
  type RuleSet,
  type TypologyTemplate,
  type Violation,
} from "@/domain";
import { hardwareRows, type HardwareRow } from "@/export/csv/distinta";
import { DEFAULT_SAT_OPTIONS, type SatExportOptions } from "@/export/sat/options";

/**
 * Configurazione del configuratore (D10, slice `config`) e calcolo dei dati
 * derivati (slice `derived`). Solo funzioni pure: lo store zustand
 * (`configuratore-store.ts`) le usa a ogni cambio di `config`.
 */

export const CONFIG_SCHEMA_VERSION = 1 as const;

export interface ExportOptions {
  readonly sat: SatExportOptions;
}

export interface ConfiguratoreConfig {
  readonly schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  /** Slug della tipologia. */
  readonly typology: string;
  /** Valori dei parametri come inseriti (anche fuori limite: l'errore va in `derived.paramErrors`). */
  readonly params: Readonly<Record<string, ParamValue>>;
  /** Ingombro del cliente, sempre valido (`parseEnvelope`). */
  readonly envelope: Envelope;
  /** Affondamento dei pilastri sotto il pavimento (mm, `BuildOptions.embedment`). */
  readonly embedment: number;
  readonly exportOptions: ExportOptions;
}

export interface Derived {
  /** Ultimo assieme generato con successo (`null` solo se nessuna generazione è mai riuscita). */
  readonly assembly: Assembly | null;
  readonly violations: readonly Violation[];
  readonly collisions: readonly Collision[];
  readonly measures: Measures | null;
  /**
   * Ferramenta dell'assieme raggruppata per codice (la tabella ferramenta di
   * `buildDistinta`, E7), coerente con `assembly`.
   */
  readonly hardwareRows: readonly HardwareRow[];
  /** Errori per parametro (fuori limite, tipo errato): l'assieme non viene rigenerato. */
  readonly paramErrors: Readonly<Record<string, string>>;
  /** Errore di generazione non legato a un singolo parametro (tipologia sconosciuta, lavorazione impossibile…). */
  readonly error: string | null;
  /** `true` se `assembly` non corrisponde più a `config` (parametri non validi o errore). */
  readonly stale: boolean;
}

export const DEFAULT_TYPOLOGY = "addossata-monofalda";

/** Ingombro di default: contiene la monofalda di default con il muro 50 mm dietro la banchina. */
export const DEFAULT_ENVELOPE: Envelope = parseEnvelope({ box: { width: 6000, depth: 3600, height: 3700 } });

const ceil100 = (mm: number) => Math.ceil(mm / 100) * 100;
const envelopeCache = new Map<string, Envelope>();

/**
 * `DEFAULT_ENVELOPE` se contiene l'assieme senza collisioni, altrimenti
 * allargato (ai 100 mm superiori, con 100 mm di margine in profondità e
 * altezza) fino a contenerlo. I limiti sono quelli del legno
 * (`assemblyBounds`: box ritagliati dai tagli di testa), gli stessi del
 * controllo collisioni. L'ingombro ha l'origine nell'angolo anteriore
 * sinistro dell'assieme: i template generano il legno in x, y ≥ 0 (verificato
 * da `default-collisions.test.ts`), quindi basta allargare verso i massimi.
 */
function envelopeContaining(assembly: Assembly): Envelope {
  const bounds = assemblyBounds(assembly);
  if (!bounds || checkCollisions(assembly, DEFAULT_ENVELOPE).length === 0) return DEFAULT_ENVELOPE;
  const { max } = bounds;
  const box = DEFAULT_ENVELOPE.box;
  return parseEnvelope({
    box: {
      width: Math.max(box.width, ceil100(max.x)),
      depth: Math.max(box.depth, ceil100(max.y) + 100),
      height: Math.max(box.height, ceil100(max.z) + 100),
    },
  });
}

/**
 * Ingombro di default della tipologia: `DEFAULT_ENVELOPE` se contiene
 * l'assieme di default senza collisioni, altrimenti allargato fino a
 * contenerlo, così "Ripristina" non parte mai da una configurazione in
 * collisione (es. bifalda 5 × 4 m).
 */
export function defaultEnvelopeFor(typology: string): Envelope {
  const cached = envelopeCache.get(typology);
  if (cached) return cached;
  const envelope = envelopeContaining(generate(typology));
  envelopeCache.set(typology, envelope);
  return envelope;
}

export function defaultConfig(typology: string = DEFAULT_TYPOLOGY): ConfiguratoreConfig {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    typology,
    params: { ...defaultParams(getTypology(typology)) },
    envelope: defaultEnvelopeFor(typology),
    embedment: 0,
    exportOptions: { sat: DEFAULT_SAT_OPTIONS },
  };
}

/**
 * Configurazione di un preset commerciale (`loadPreset` del dominio):
 * tipologia, parametri risolti (completi), ingombro del preset o, se assente,
 * l'ingombro di default allargato fino a contenere l'assieme del preset (come
 * `defaultEnvelopeFor`); affondamento 0 e opzioni export di default. Lancia
 * `PresetNotFoundError` / `ParamError`.
 */
export function presetConfig(id: string): ConfiguratoreConfig {
  const { typologySlug, params, envelope } = loadPreset(id);
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    typology: typologySlug,
    params: { ...params },
    envelope: envelope ?? presetEnvelope(id, typologySlug, params),
    embedment: 0,
    exportOptions: { sat: DEFAULT_SAT_OPTIONS },
  };
}

const presetEnvelopeCache = new Map<string, Envelope>();
function presetEnvelope(id: string, typology: string, params: Readonly<Record<string, ParamValue>>): Envelope {
  let envelope = presetEnvelopeCache.get(id);
  if (!envelope) {
    envelope = envelopeContaining(generate(typology, params));
    presetEnvelopeCache.set(id, envelope);
  }
  return envelope;
}

/**
 * Nomi dei parametri da nascondere nel form (`visibleWhen` falso, E4). La
 * condizione è valutata sui parametri risolti; i valori non validi (es. un
 * numero appena digitato fuori limite) sono sostituiti dal default, così la
 * visibilità non "salta" mentre l'utente scrive. Tipologia sconosciuta → `[]`.
 */
export function hiddenParamNames(config: Pick<ConfiguratoreConfig, "typology" | "params">): string[] {
  let template: TypologyTemplate;
  try {
    template = getTypology(config.typology);
  } catch {
    return [];
  }
  const errors = paramErrorsOf(template, config.params);
  const valid = Object.fromEntries(Object.entries(config.params).filter(([name]) => !(name in errors)));
  let resolved;
  try {
    resolved = resolveParams(template, valid);
  } catch {
    resolved = defaultParams(template);
  }
  return template.params.filter((spec) => !isParamVisible(spec, resolved)).map((spec) => spec.name);
}

/** `true` se `value` è ammesso per il parametro `name` della tipologia. */
function acceptsParam(template: TypologyTemplate, name: string, value: ParamValue): boolean {
  if (!template.params.some((p) => p.name === name)) return false;
  try {
    resolveParams(template, { [name]: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parametri per una nuova tipologia: default del template, sovrascritti dai
 * parametri correnti con lo stesso nome e valore ammesso (es. `larghezza`).
 * Per i parametri `enum` (es. `costruzione`) "ammesso" significa tra le
 * opzioni della nuova tipologia: altrimenti resta il default.
 */
export function carryOverParams(
  params: Readonly<Record<string, ParamValue>>,
  typology: string,
): Record<string, ParamValue> {
  const template = getTypology(typology);
  const out: Record<string, ParamValue> = { ...defaultParams(template) };
  for (const [name, value] of Object.entries(params)) if (acceptsParam(template, name, value)) out[name] = value;
  return out;
}

const generates = (typology: string, params: Readonly<Record<string, ParamValue>>): boolean => {
  try {
    generate(typology, params);
    return true;
  } catch {
    return false;
  }
};

/**
 * Come `carryOverParams`, ma garantisce che l'assieme si generi: i parametri
 * comuni ammessi uno per uno possono essere incompatibili tra loro con i
 * default della nuova tipologia (es. la larghezza di un'addossata è troppo
 * stretta per i pilastri del carport, la profondità rende rettangolare la
 * base del gazebo con cuspide). Se l'insieme non genera, i parametri sono
 * riportati uno alla volta, nell'ordine, tenendo solo quelli con cui
 * l'assieme resta generabile; se nemmeno i default generano, restano i default.
 */
export function compatibleCarryOver(
  params: Readonly<Record<string, ParamValue>>,
  typology: string,
): Record<string, ParamValue> {
  const all = carryOverParams(params, typology);
  if (generates(typology, all)) return all;
  const defaults = carryOverParams({}, typology);
  const out: Record<string, ParamValue> = { ...defaults };
  for (const [name, value] of Object.entries(all)) {
    if (value === defaults[name]) continue;
    const next = { ...out, [name]: value };
    if (generates(typology, next)) out[name] = value;
  }
  return out;
}

/** Errori dei singoli parametri rispetto al template (messaggio con l'intervallo ammesso). */
export function paramErrorsOf(
  template: TypologyTemplate,
  params: Readonly<Record<string, ParamValue>>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [name, value] of Object.entries(params)) {
    try {
      resolveParams(template, { [name]: value });
    } catch (e) {
      errors[name] = e instanceof ParamError ? e.message : String(e);
    }
  }
  return errors;
}

export const EMPTY_DERIVED: Derived = {
  assembly: null,
  violations: [],
  collisions: [],
  measures: null,
  hardwareRows: [],
  paramErrors: {},
  error: null,
  stale: true,
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Rigenera assieme, violazioni e collisioni dalla configurazione. Con
 * parametri non validi o errori di generazione mantiene i risultati di
 * `previous` (l'assieme non viene rigenerato) e segnala il problema.
 */
export function computeDerived(
  config: ConfiguratoreConfig,
  previous: Derived = EMPTY_DERIVED,
  ruleSet: RuleSet = DEFAULT_LOVATO_RULES,
): Derived {
  const keep = (patch: Partial<Derived>): Derived => ({ ...previous, paramErrors: {}, error: null, ...patch, stale: true });
  let template: TypologyTemplate;
  try {
    template = getTypology(config.typology);
  } catch (e) {
    return keep({ error: e instanceof TypologyNotFoundError ? e.message : errorText(e) });
  }
  const paramErrors = paramErrorsOf(template, config.params);
  if (Object.keys(paramErrors).length > 0) return keep({ paramErrors });
  try {
    const floorHeightAt = floorFunction(config.envelope);
    // muri reali della pianta fuori squadra (solo con `envelope.plan` e tipologie a muro)
    const walls = wallBuildOptions(template, config.envelope);
    const assembly = generate(config.typology, config.params, { floorHeightAt, embedment: config.embedment, ...walls });
    const { violations, measures } = evaluateRules(assembly, ruleSet, { floorHeightAt });
    const collisions = checkCollisions(assembly, config.envelope);
    return {
      assembly,
      violations,
      collisions,
      measures,
      hardwareRows: hardwareRows(assembly.hardware),
      paramErrors: {},
      error: null,
      stale: false,
    };
  } catch (e) {
    return keep({ error: errorText(e) });
  }
}

/** Slug delle tipologie registrate (per i selettori della UI). */
export const typologySlugs = (): string[] => listTypologies().map((t) => t.slug);
