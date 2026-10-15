import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { createStore, type Mutate, type StoreApi } from "zustand/vanilla";
import {
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
import { DEFAULT_CATALOG, catalogFromResponse, fallbackCatalog, fetchActiveDatasets, pricingOf, type CatalogState } from "./catalog";
import { SatExportOptionsSchema, type SatExportOptions } from "@/export/sat/options";
import type { PieceResult } from "@/geometry/protocol";
import {
  EMPTY_DERIVED,
  commercialOf,
  compatibleCarryOver,
  computeDerived,
  defaultConfig,
  hiddenParamNames,
  presetConfig,
  priceDerived,
  type CommercialOptions,
  type ConfiguratoreConfig,
  type Derived,
} from "./config";
import { CommercialSchema, parseConfigFile } from "./config-file";
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
  /** Cambia tipologia mantenendo i parametri comuni compatibili (es. `larghezza`) con cui l'assieme si genera. */
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
  /**
   * Carica un preset commerciale (`PRESET_CATALOG`): tipologia, parametri
   * completi e ingombro (quello di default della tipologia se il preset non
   * ne dichiara uno); affondamento 0, opzioni di export conservate. Id
   * sconosciuto o parametri non validi → stato invariato.
   */
  loadPreset(id: string): ActionResult;
  /** Sostituisce l'intera configurazione (file JSON, esempi). */
  loadConfig(config: ConfiguratoreConfig): void;
  /** Torna alla configurazione di default (della tipologia indicata). */
  resetConfig(typology?: string): void;
  /** Seleziona i pezzi (pannello esiti, viewer); `[]` annulla la selezione. */
  selectPieces(ids: readonly string[]): void;
  /** Opzioni commerciali e cantiere dichiarato (ricalcola solo il preventivo). */
  setCommercial(patch: Partial<CommercialOptions>): ActionResult;
  /**
   * Carica listino e regole attivi dall'archivio (`GET /api/admin/dataset/attivi`); in
   * caso di errore resta sui dati di default con `catalog.error`. Non lancia mai.
   */
  loadCatalog(fetcher?: () => Promise<unknown>): Promise<CatalogState>;
  /** Sostituisce il catalogo (test, simulatore) e ricalcola assieme, regole e preventivo. */
  setCatalog(catalog: CatalogState): void;
}

export interface ConfiguratoreState extends ConfiguratoreActions, KernelActions {
  readonly config: ConfiguratoreConfig;
  readonly derived: Derived;
  readonly kernel: KernelState;
  /** Listino e regole in uso (archivio o default, non persistiti). */
  readonly catalog: CatalogState;
  /** Id dei pezzi selezionati (stato di interfaccia, non persistito). */
  readonly selection: readonly string[];
}

export type ConfiguratoreStore = StoreApi<ConfiguratoreState>;

export interface ConfiguratoreStoreOptions extends KernelSliceOptions {
  /** Configurazione iniziale (default `defaultConfig()`). */
  readonly initialConfig?: ConfiguratoreConfig;
  /** Regole costruttive iniziali (default `DEFAULT_LOVATO_RULES`; sostituite da `loadCatalog`). */
  readonly ruleSet?: RuleSet;
  /** Catalogo iniziale (default: dati di default, origine `default`). */
  readonly catalog?: CatalogState;
}

/** Catalogo iniziale dalle opzioni dello store. */
function initialCatalog(options: ConfiguratoreStoreOptions): CatalogState {
  const base = options.catalog ?? DEFAULT_CATALOG;
  return options.ruleSet ? { ...base, ruleSet: options.ruleSet } : base;
}

/** Assieme, regole e preventivo della configurazione con il catalogo. */
const deriveWith = (config: ConfiguratoreConfig, previous: Derived, catalog: CatalogState): Derived =>
  computeDerived(config, previous, catalog.ruleSet, pricingOf(catalog));

const OK: ActionResult = { ok: true };
const NO_SELECTION: readonly string[] = [];

function failure(e: unknown): ActionResult {
  if (e instanceof ValidationError) return { ok: false, error: e.message, issues: e.issues };
  const message = e instanceof Error ? e.message : String(e);
  return { ok: false, error: message, issues: [{ path: "(radice)", message }] };
}

/**
 * Selezione ristretta ai pezzi dell'assieme corrente: dopo una rigenerazione
 * (meno travetti, altra larghezza…) gli id spariti non devono restare
 * selezionati, altrimenti il viewer attenua tutti i pezzi senza evidenziarne
 * nessuno. Restituisce lo stesso array se non cambia nulla.
 */
function pruneSelection(selection: readonly string[], derived: Derived): readonly string[] {
  if (selection.length === 0) return selection;
  const ids = new Set((derived.assembly?.pieces ?? []).map((p) => p.id));
  const kept = selection.filter((id) => ids.has(id));
  if (kept.length === selection.length) return selection;
  return kept.length === 0 ? NO_SELECTION : kept;
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
  const catalog0 = initialCatalog(options);
  let pendingCatalog: Promise<CatalogState> | undefined;
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

    const commit = (config: ConfiguratoreConfig) => {
      const prev = get().config;
      // Le opzioni di export non cambiano l'assieme: niente rigenerazione né nuova costruzione dei solidi.
      const sameGeometry =
        config.typology === prev.typology &&
        config.params === prev.params &&
        config.envelope === prev.envelope &&
        config.embedment === prev.embedment;
      if (sameGeometry) {
        // Solo opzioni commerciali cambiate: stesso assieme, nuovo preventivo.
        if (config.commercial !== prev.commercial) set({ config, derived: priceDerived(config, get().derived, pricingOf(get().catalog)) });
        else set({ config });
        return;
      }
      const derived = deriveWith(config, get().derived, get().catalog);
      set({ config, derived, selection: pruneSelection(get().selection, derived) });
    };

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
      derived: deriveWith(initialConfig, EMPTY_DERIVED, catalog0),
      kernel: INITIAL_KERNEL_STATE,
      catalog: catalog0,
      selection: NO_SELECTION,
      ...kernel,

      setTypology(slug) {
        try {
          update({ typology: slug, params: compatibleCarryOver(get().config.params, slug) });
          set({ selection: NO_SELECTION });
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
      loadPreset(id) {
        let config: ConfiguratoreConfig;
        try {
          config = presetConfig(id);
        } catch (e) {
          return failure(e);
        }
        commit({ ...config, exportOptions: get().config.exportOptions });
        set({ selection: NO_SELECTION });
        return OK;
      },
      loadConfig(config) {
        commit(config);
        set({ selection: NO_SELECTION });
      },
      resetConfig(typology) {
        commit(defaultConfig(typology));
        set({ selection: NO_SELECTION });
      },
      selectPieces(ids) {
        const current = get().selection;
        if (ids.length === current.length && ids.every((id, i) => id === current[i])) return;
        set({ selection: ids.length === 0 ? NO_SELECTION : [...ids] });
      },
      setCommercial(patch) {
        const parsed = CommercialSchema.safeParse({ ...commercialOf(get().config), ...patch });
        if (!parsed.success)
          return failure(new ValidationError("opzioni commerciali non valide", issuesFromZod(parsed.error).map((i) => ({ ...i, path: `commercial.${i.path}` }))));
        const commercial: CommercialOptions = parsed.data;
        update({ commercial });
        return OK;
      },
      setCatalog(catalog) {
        const { config } = get();
        const derived = deriveWith(config, get().derived, catalog);
        set({ catalog, derived, selection: pruneSelection(get().selection, derived) });
      },
      loadCatalog(fetcher = fetchActiveDatasets) {
        if (pendingCatalog) return pendingCatalog;
        set({ catalog: { ...get().catalog, loading: true } });
        pendingCatalog = (async () => {
          let next: CatalogState;
          try {
            next = catalogFromResponse(await fetcher());
          } catch {
            next = fallbackCatalog();
          }
          get().setCatalog(next);
          return next;
        })().finally(() => {
          pendingCatalog = undefined;
        });
        return pendingCatalog;
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
 * configurazione iniziale; i parametri fuori limite sono invece mantenuti
 * (errore inline come prima del ricaricamento); `derived` è ricalcolato.
 */
export function createPersistentConfiguratoreStore(options: PersistentStoreOptions = {}): PersistentConfiguratoreStore {
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
          const config = parseConfigFile(saved, { keepInvalidParams: true });
          return { ...current, config, derived: deriveWith(config, current.derived, current.catalog) };
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

/** Ferramenta raggruppata per codice dell'assieme corrente (riferimento stabile per `derived`). */
export const selectHardwareRows = (s: ConfiguratoreState) => s.derived.hardwareRows;

const hiddenCache = new WeakMap<ConfiguratoreConfig, readonly string[]>();
/** Parametri nascosti dal form (`visibleWhen` falso), memo per `config`. */
export const selectHiddenParams = (s: ConfiguratoreState): readonly string[] => {
  let v = hiddenCache.get(s.config);
  if (!v) {
    v = hiddenParamNames(s.config);
    hiddenCache.set(s.config, v);
  }
  return v;
};

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
