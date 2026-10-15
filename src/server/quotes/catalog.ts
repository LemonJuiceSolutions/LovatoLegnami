import { MVP_VISIBLE_TYPOLOGIES, type PriceList, type PriceListVersion, type RuleSet, type TypologySettings } from "@/domain";
import { getActive } from "@/server/repositories/datasets";

/**
 * Dati pubblici attivi (listino, regole, impostazioni delle tipologie) con cache in memoria
 * di 60 s (P9): la stima non legge il database a ogni tasto del wizard. La pubblicazione
 * di una nuova versione (gruppo 9) chiama `invalidatePublicCatalog()`; nelle altre istanze
 * la nuova versione arriva entro 60 s.
 */

export interface PublicCatalog {
  readonly priceList: PriceList;
  readonly priceListVersion: PriceListVersion;
  /** Id della riga `dataset_versions` del listino (istantanea del preventivo). */
  readonly priceListVersionId: string;
  readonly ruleSet: RuleSet;
  readonly ruleSetVersionId: string;
  readonly ruleSetVersion: number;
  /** Tipologie visibili sul sito con il titolo commerciale. */
  readonly typologies: ReadonlyMap<string, { readonly title: string }>;
  readonly loadedAt: number;
}

export class CatalogUnavailableError extends Error {
  constructor(readonly dataset: "listino" | "regole") {
    super(`nessuna versione attiva del dataset ${dataset}`);
    this.name = "CatalogUnavailableError";
  }
}

export const CATALOG_TTL_MS = 60_000;

/**
 * Stato della cache su `globalThis`: Next carica questo modulo in più grafi dello stesso
 * processo (pagine RSC, route handler, server action). Con variabili di modulo
 * `invalidatePublicCatalog()` chiamato dalla server action di pubblicazione non svuotava
 * la cache usata dalle pagine, che ricalcolavano il sito con il listino vecchio.
 */
const GLOBAL_KEY = Symbol.for("lovato.publicCatalog");
type CatalogState = { cached?: { value: PublicCatalog; day: string }; pending?: Promise<PublicCatalog>; generation: number };
const holder = globalThis as { [GLOBAL_KEY]?: CatalogState };
const state = (holder[GLOBAL_KEY] ??= { generation: 0 });

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());

function visibleTypologies(settings: TypologySettings | null): Map<string, { title: string }> {
  if (!settings) return new Map(MVP_VISIBLE_TYPOLOGIES.map((slug) => [slug, { title: slug }]));
  return new Map(
    settings
      .filter((t) => t.visible)
      .sort((a, b) => a.order - b.order)
      .map((t) => [t.slug, { title: t.title }]),
  );
}

async function load(): Promise<PublicCatalog> {
  const [listino, regole, tipologie] = await Promise.all([getActive("listino"), getActive("regole"), getActive("tipologie")]);
  if (!listino) throw new CatalogUnavailableError("listino");
  if (!regole) throw new CatalogUnavailableError("regole");
  return {
    priceList: listino.data,
    priceListVersion: { id: listino.id, version: listino.version, effectiveFrom: listino.effectiveFrom, status: "attiva" },
    priceListVersionId: listino.id,
    ruleSet: regole.data,
    ruleSetVersionId: regole.id,
    ruleSetVersion: regole.version,
    typologies: visibleTypologies(tipologie?.data ?? null),
    loadedAt: Date.now(),
  };
}

/** Catalogo pubblico attivo oggi (cache 60 s condivisa nel processo, una sola lettura concorrente). */
export async function getPublicCatalog(now: number = Date.now()): Promise<PublicCatalog> {
  const day = today();
  const { cached } = state;
  if (cached && cached.day === day && now - cached.value.loadedAt < CATALOG_TTL_MS) return cached.value;
  if (!state.pending) {
    const generation = state.generation;
    const pending = load()
      .then((value) => {
        // una lettura iniziata prima di un'invalidazione non torna in cache
        if (state.generation === generation) state.cached = { value, day };
        return value;
      })
      .finally(() => {
        if (state.pending === pending) state.pending = undefined;
      });
    state.pending = pending;
  }
  return state.pending;
}

/**
 * Catalogo letto ora dal database, senza la cache in memoria: per i contenuti del sito, che
 * hanno già la cache di Next (`unstable_cache`, 300 s, tag `tipologie`). Dopo una
 * pubblicazione il ricalcolo deve vedere la nuova versione anche in un'istanza (o un grafo
 * di moduli) la cui cache in memoria non è stata invalidata.
 */
export function loadPublicCatalog(): Promise<PublicCatalog> {
  return load();
}

export function invalidatePublicCatalog(): void {
  state.cached = undefined;
  state.pending = undefined;
  state.generation += 1;
}
