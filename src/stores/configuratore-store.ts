import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { createStore, type Mutate, type StoreApi } from "zustand/vanilla";
import {
  DEFAULT_LOVATO_RULES,
  ObstacleSchema,
  ValidationError,
  issuesFromZod,
  parseEnvelope,
  type Envelope,
  type EnvelopeInput,
  type ParamValue,
  type RuleSet,
  type ValidationIssue,
} from "@/domain";
import { SatExportOptionsSchema, type SatExportOptions } from "@/export/sat/options";
import type { PieceResult } from "@/geometry/protocol";
import {
  EMPTY_DERIVED,
  carryOverParams,
  computeDerived,
  defaultConfig,
  type ConfiguratoreConfig,
  type Derived,
} from "./config";
import { parseConfigFile } from "./config-file";
import {
  INITIAL_KERNEL_STATE,
  kernelSlice,
  solidsReady,
  type KernelActions,
  type KernelSliceOptions,
  type KernelState,
} from "./kernel-slice";

/**
 * Store del configuratore (D10) senza React: `createConfiguratoreStore()`
 * restituisce uno store zustand "vanilla" testabile in Node; l'hook per i
 * componenti è in `use-configuratore.ts`.
 *
 * - `config`: tipologia, parametri, ingombro, affondamento, opzioni export.
 * - `derived`: assieme, violazioni, collisioni, ricalcolati in modo sincrono
 *   a ogni cambio di `config` (le azioni passano tutte da `commit`).
 * - `kernel`: stato del kernel geometrico e solidi per pezzo (`kernel-slice.ts`);
 *   dopo `startKernel()` ogni nuovo assieme avvia `rebuild()` (debounce 300 ms).
 *
 * Le azioni sull'ingombro e sulle opzioni validano l'input: se non è valido
 * lo stato resta invariato e restituiscono `{ ok: false, error, issues }`.
 * `setParam` accetta invece qualsiasi valore (il form lo mostra) e l'errore
 * finisce in `derived.paramErrors` senza rigenerare l'assieme.
 */

export type ActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string; readonly issues: readonly ValidationIssue[] };

type ObstacleInput = EnvelopeInput extends { obstacles?: readonly (infer O)[] } ? O : never;
/** Ostacolo da aggiungere: l'id è facoltativo (`OST-nn`). */
export type NewObstacle = Omit<ObstacleInput, "id"> & { readonly id?: string };
export type ObstaclePatch = Partial<Omit<ObstacleInput, "id">>;
type FloorInput = NonNullable<EnvelopeInput["floor"]>;
/** Quote del pavimento: angoli parziali (gli altri restano) e/o elenco completo dei punti extra. */
export interface FloorPatch {
  readonly corners?: Partial<NonNullable<FloorInput["corners"]>>;
  readonly points?: FloorInput["points"];
}

export interface ConfiguratoreActions {
  /** Cambia tipologia mantenendo i parametri comuni compatibili (es. `larghezza`). */
  setTypology(slug: string): ActionResult;
  setParam(name: string, value: ParamValue): void;
  /** Più parametri insieme (es. proposte di auto-dimensionamento o adattamento). */
  setParams(patch: Readonly<Record<string, ParamValue>>): void;
  /** Sostituisce l'ingombro (box, lato muro, ostacoli, pavimento). */
  setEnvelope(input: EnvelopeInput): ActionResult;
  setBox(patch: Partial<Envelope["box"]>): ActionResult;
  addObstacle(obstacle: NewObstacle): ActionResult & { readonly id?: string };
  updateObstacle(id: string, patch: ObstaclePatch): ActionResult;
  removeObstacle(id: string): void;
  setFloor(patch: FloorPatch): ActionResult;
  setEmbedment(mm: number): ActionResult;
  setExportOption<K extends keyof SatExportOptions>(key: K, value: SatExportOptions[K]): ActionResult;
  /** Sostituisce l'intera configurazione (file JSON, esempi). */
  loadConfig(config: ConfiguratoreConfig): void;
  /** Torna alla configurazione di default (della tipologia indicata). */
  resetConfig(typology?: string): void;
}

export interface ConfiguratoreState extends ConfiguratoreActions, KernelActions {
  readonly config: ConfiguratoreConfig;
  readonly derived: Derived;
  readonly kernel: KernelState;
}

export type ConfiguratoreStore = StoreApi<ConfiguratoreState>;

export interface ConfiguratoreStoreOptions extends KernelSliceOptions {
  /** Configurazione iniziale (default `defaultConfig()`). */
  readonly initialConfig?: ConfiguratoreConfig;
  /** Regole costruttive (default `DEFAULT_LOVATO_RULES`). */
  readonly ruleSet?: RuleSet;
}

const OK: ActionResult = { ok: true };

function failure(e: unknown): ActionResult {
  if (e instanceof ValidationError) return { ok: false, error: e.message, issues: e.issues };
  const message = e instanceof Error ? e.message : String(e);
  return { ok: false, error: message, issues: [{ path: "(radice)", message }] };
}

/** Primo id `OST-nn` libero. */
function nextObstacleId(envelope: Envelope): string {
  const used = new Set(envelope.obstacles.map((o) => o.id));
  for (let i = 1; ; i++) {
    const id = `OST-${String(i).padStart(2, "0")}`;
    if (!used.has(id)) return id;
  }
}

/** Stato e azioni del configuratore (riusato con o senza `persist`). */
export function configuratoreSlice(options: ConfiguratoreStoreOptions = {}) {
  const ruleSet = options.ruleSet ?? DEFAULT_LOVATO_RULES;
  return (
    set: StoreApi<ConfiguratoreState>["setState"],
    get: StoreApi<ConfiguratoreState>["getState"],
    api: Pick<StoreApi<ConfiguratoreState>, "subscribe">,
  ): ConfiguratoreState => {
    const kernel = kernelSlice<ConfiguratoreState>(set, get, options);
    // Nuovo assieme (azioni, file, ripristino da storage) → nuova costruzione dei solidi.
    api.subscribe((state, prev) => {
      if (state.derived.assembly !== prev.derived.assembly && state.kernel.status !== "idle") kernel.rebuild();
    });

    const commit = (config: ConfiguratoreConfig) =>
      set({ config, derived: computeDerived(config, get().derived, ruleSet) });

    const update = (patch: Partial<ConfiguratoreConfig>) => commit({ ...get().config, ...patch });

    const withEnvelope = (input: unknown): ActionResult => {
      try {
        update({ envelope: parseEnvelope(input) });
        return OK;
      } catch (e) {
        return failure(e);
      }
    };

    const initialConfig = options.initialConfig ?? defaultConfig();
    return {
      config: initialConfig,
      derived: computeDerived(initialConfig, EMPTY_DERIVED, ruleSet),
      kernel: INITIAL_KERNEL_STATE,
      ...kernel,

      setTypology(slug) {
        try {
          update({ typology: slug, params: carryOverParams(get().config.params, slug) });
          return OK;
        } catch (e) {
          return failure(e);
        }
      },
      setParam(name, value) {
        update({ params: { ...get().config.params, [name]: value } });
      },
      setParams(patch) {
        update({ params: { ...get().config.params, ...patch } });
      },
      setEnvelope(input) {
        return withEnvelope(input);
      },
      setBox(patch) {
        const { envelope } = get().config;
        return withEnvelope({ ...envelope, box: { ...envelope.box, ...patch } });
      },
      addObstacle(obstacle) {
        const { envelope } = get().config;
        const id = obstacle.id ?? nextObstacleId(envelope);
        const result = withEnvelope({ ...envelope, obstacles: [...envelope.obstacles, { ...obstacle, id }] });
        return result.ok ? { ...result, id } : result;
      },
      updateObstacle(id, patch) {
        const { envelope } = get().config;
        const index = envelope.obstacles.findIndex((o) => o.id === id);
        if (index < 0) return failure(new Error(`ostacolo non trovato: ${id}`));
        const current = envelope.obstacles[index];
        const next = { ...current, ...patch, id };
        // `projection` assente nella patch ma con tipo cambiato: torna al default del nuovo tipo.
        if (patch.type && patch.type !== current.type && patch.projection === undefined) delete (next as { projection?: number }).projection;
        const parsed = ObstacleSchema.safeParse(next);
        if (!parsed.success)
          return failure(new ValidationError("ostacolo non valido", issuesFromZod(parsed.error).map((i) => ({ ...i, path: `obstacles[${index}]${i.path ? `.${i.path}` : ""}` }))));
        const obstacles = envelope.obstacles.map((o, i) => (i === index ? parsed.data : o));
        return withEnvelope({ ...envelope, obstacles });
      },
      removeObstacle(id) {
        const { envelope } = get().config;
        if (!envelope.obstacles.some((o) => o.id === id)) return;
        update({ envelope: { ...envelope, obstacles: envelope.obstacles.filter((o) => o.id !== id) } });
      },
      setFloor(patch) {
        const { envelope } = get().config;
        const floor = {
          corners: { ...envelope.floor.corners, ...patch.corners },
          points: patch.points ?? envelope.floor.points,
        };
        return withEnvelope({ ...envelope, floor });
      },
      setEmbedment(mm) {
        if (!Number.isFinite(mm) || mm < 0)
          return failure(new ValidationError("affondamento non valido", [{ path: "embedment", message: "deve essere un numero maggiore o uguale a 0" }]));
        update({ embedment: mm });
        return OK;
      },
      setExportOption(key, value) {
        const { exportOptions } = get().config;
        const parsed = SatExportOptionsSchema.safeParse({ ...exportOptions.sat, [key]: value });
        if (!parsed.success)
          return failure(new ValidationError("opzione di export non valida", issuesFromZod(parsed.error).map((i) => ({ ...i, path: `exportOptions.sat.${i.path}` }))));
        update({ exportOptions: { ...exportOptions, sat: parsed.data } });
        return OK;
      },
      loadConfig(config) {
        commit(config);
      },
      resetConfig(typology) {
        commit(defaultConfig(typology));
      },
    };
  };
}

/** Store vanilla del configuratore (senza persistenza né kernel). */
export function createConfiguratoreStore(options: ConfiguratoreStoreOptions = {}): ConfiguratoreStore {
  return createStore<ConfiguratoreState>()(configuratoreSlice(options));
}

/** Chiave dello storage locale (versionata, D10). */
export const STORAGE_KEY = "lovato-configuratore-v1";

export interface PersistentStoreOptions extends ConfiguratoreStoreOptions {
  /** Storage sincrono o asincrono (default `localStorage`). */
  readonly storage?: StateStorage;
  /** Se `true` il ripristino avviene solo con `store.persist.rehydrate()`. */
  readonly skipHydration?: boolean;
}

export type PersistentConfiguratoreStore = Mutate<ConfiguratoreStore, [["zustand/persist", { config: ConfiguratoreConfig }]]>;

/**
 * Store con persistenza della sola `config` (chiave `lovato-configuratore-v1`).
 * Al ripristino la configurazione salvata passa da `parseConfigFile`: se non
 * è valida (versione non supportata, campi errati) viene ignorata e resta la
 * configurazione iniziale; `derived` è ricalcolato.
 */
export function createPersistentConfiguratoreStore(options: PersistentStoreOptions = {}): PersistentConfiguratoreStore {
  const ruleSet = options.ruleSet ?? DEFAULT_LOVATO_RULES;
  return createStore<ConfiguratoreState>()(
    persist(configuratoreSlice(options), {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage<{ config: ConfiguratoreConfig }>(() => options.storage ?? localStorage),
      partialize: (s) => ({ config: s.config }),
      skipHydration: options.skipHydration,
      merge: (persisted, current) => {
        const saved = (persisted as { config?: unknown } | undefined)?.config;
        if (saved === undefined) return current;
        try {
          const config = parseConfigFile(saved);
          return { ...current, config, derived: computeDerived(config, current.derived, ruleSet) };
        } catch {
          return current;
        }
      },
    }),
  );
}

// Selettori ----------------------------------------------------------------
// Restituiscono riferimenti stabili (memo per oggetto `derived`): con zustand 5
// un selettore che crea un nuovo array a ogni chiamata fa ri-renderizzare all'infinito.

function memoByDerived<T>(fn: (d: Derived) => T): (s: ConfiguratoreState) => T {
  const cache = new WeakMap<Derived, T>();
  return (s) => {
    let v = cache.get(s.derived);
    if (v === undefined) {
      v = fn(s.derived);
      cache.set(s.derived, v);
    }
    return v;
  };
}

export const selectConfig = (s: ConfiguratoreState) => s.config;
export const selectDerived = (s: ConfiguratoreState) => s.derived;
export const selectAssembly = (s: ConfiguratoreState) => s.derived.assembly;
/** Violazioni con severità `errore`. */
export const selectErrors = memoByDerived((d) => d.violations.filter((v) => v.severity === "errore"));
/** Violazioni con severità `avviso`. */
export const selectWarnings = memoByDerived((d) => d.violations.filter((v) => v.severity === "avviso"));
/** Problemi che richiedono la conferma "esporta comunque" (errori o collisioni). */
export const selectNeedsExportConfirmation = (s: ConfiguratoreState) =>
  s.derived.collisions.length > 0 || s.derived.violations.some((v) => v.severity === "errore");

/** Solidi pronti per l'assieme corrente (abilita "Esporta SAT/STEP"). */
export const selectSolidsReady = (s: ConfiguratoreState) => solidsReady(s.kernel, s.derived.assembly);

const resultsCache = new WeakMap<KernelState, PieceResult[]>();
/** Risultati del kernel nell'ordine dei pezzi dell'assieme costruito (per `exportSat`). */
export const selectPieceResults = (s: ConfiguratoreState): PieceResult[] => {
  let list = resultsCache.get(s.kernel);
  if (!list) {
    const { builtFor, results } = s.kernel;
    list = (builtFor?.pieces ?? []).flatMap((p) => (results[p.id] ? [results[p.id]] : []));
    resultsCache.set(s.kernel, list);
  }
  return list;
};
