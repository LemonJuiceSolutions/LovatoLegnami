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
  listTypologies,
  parseEnvelope,
  resolveParams,
  type Assembly,
  type Collision,
  type Envelope,
  type Measures,
  type ParamValue,
  type RuleSet,
  type TypologyTemplate,
  type Violation,
} from "@/domain";
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
 * Ingombro di default della tipologia: `DEFAULT_ENVELOPE` se contiene
 * l'assieme di default senza collisioni, altrimenti allargato (al centimetro
 * superiore, con 100 mm di margine) fino a contenerlo, così "Ripristina" non
 * parte mai da una configurazione in collisione (es. bifalda 5 × 4 m).
 */
export function defaultEnvelopeFor(typology: string): Envelope {
  const cached = envelopeCache.get(typology);
  if (cached) return cached;
  const assembly = generate(typology);
  let envelope = DEFAULT_ENVELOPE;
  const bounds = assemblyBounds(assembly);
  if (bounds && checkCollisions(assembly, DEFAULT_ENVELOPE).length > 0) {
    const { max } = bounds;
    const box = DEFAULT_ENVELOPE.box;
    envelope = parseEnvelope({
      box: {
        width: Math.max(box.width, ceil100(max.x)),
        depth: Math.max(box.depth, ceil100(max.y) + 100),
        height: Math.max(box.height, ceil100(max.z) + 100),
      },
    });
  }
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
    const assembly = generate(config.typology, config.params, { floorHeightAt, embedment: config.embedment });
    const { violations, measures } = evaluateRules(assembly, ruleSet, { floorHeightAt });
    const collisions = checkCollisions(assembly, config.envelope);
    return { assembly, violations, collisions, measures, paramErrors: {}, error: null, stale: false };
  } catch (e) {
    return keep({ error: errorText(e) });
  }
}

/** Slug delle tipologie registrate (per i selettori della UI). */
export const typologySlugs = (): string[] => listTypologies().map((t) => t.slug);
