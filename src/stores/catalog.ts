import {
  DEFAULT_LOVATO_RULES,
  DEFAULT_PRICE_LIST,
  DEFAULT_PRICE_LIST_VERSION,
  loadRuleSet,
  safeParsePriceList,
  type PriceList,
  type PriceListVersion,
  type RuleSet,
} from "@/domain";
import type { PricingCatalog } from "./config";

/**
 * Listino e regole del configuratore interno (10.1, spec `configuratore-ui` "Listino e
 * regole dalla versione attiva" e `regole-costruttive`): caricati all'avvio dalla versione
 * attiva dell'archivio (`GET /api/admin/dataset/attivi`), con ripiego sui dati di default
 * dei file del dominio e avviso non bloccante. Funzioni pure: lo store le usa in
 * `loadCatalog`.
 */

export type CatalogSource = "archivio" | "default";

/** Versione di un dataset dell'archivio (id della riga, numero, validità). */
export interface DatasetVersionRef {
  readonly id: string;
  readonly version: number;
  readonly effectiveFrom: string;
}

export interface CatalogState {
  readonly priceList: PriceList;
  readonly priceListVersion: PriceListVersion;
  readonly ruleSet: RuleSet;
  /** Versione delle regole dell'archivio; `null` = regole di default dei file dati. */
  readonly ruleSetVersion: DatasetVersionRef | null;
  /** `archivio` solo se listino **e** regole vengono dall'archivio. */
  readonly source: CatalogSource;
  /** Origine per dataset (un archivio con il solo listino attivo usa le regole di default). */
  readonly sources: { readonly listino: CatalogSource; readonly regole: CatalogSource };
  /** Avviso non bloccante (archivio non raggiungibile, versione mancante o non valida). */
  readonly error: string | null;
  /** `true` durante il caricamento dall'archivio. */
  readonly loading: boolean;
}

export const DEFAULT_CATALOG: CatalogState = {
  priceList: DEFAULT_PRICE_LIST,
  priceListVersion: DEFAULT_PRICE_LIST_VERSION,
  ruleSet: DEFAULT_LOVATO_RULES,
  ruleSetVersion: null,
  source: "default",
  sources: { listino: "default", regole: "default" },
  error: null,
  loading: false,
};

/** Risposta di `GET /api/admin/dataset/attivi` (anche il contratto del route handler). */
export interface ActiveDatasetDto extends DatasetVersionRef {
  readonly data: unknown;
}
export interface ActiveDatasetsResponse {
  readonly listino: ActiveDatasetDto | null;
  readonly regole: ActiveDatasetDto | null;
}

export const ACTIVE_DATASETS_URL = "/api/admin/dataset/attivi";

export const CATALOG_UNREACHABLE = "Archivio non raggiungibile: in uso listino e regole di default (dati DA VALIDARE).";

const isRef = (v: unknown): v is ActiveDatasetDto =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as ActiveDatasetDto).id === "string" &&
  Number.isInteger((v as ActiveDatasetDto).version) &&
  typeof (v as ActiveDatasetDto).effectiveFrom === "string";

/**
 * Catalogo dalla risposta dell'archivio: ogni documento è rivalidato con lo schema del
 * dominio; un dataset assente o non valido ricade sul default con un avviso che lo nomina.
 */
export function catalogFromResponse(body: unknown): CatalogState {
  const r = (typeof body === "object" && body !== null ? body : {}) as Partial<Record<"listino" | "regole", unknown>>;
  const warnings: string[] = [];

  let priceList = DEFAULT_PRICE_LIST;
  let priceListVersion = DEFAULT_PRICE_LIST_VERSION;
  let listino: CatalogSource = "default";
  if (isRef(r.listino)) {
    const parsed = safeParsePriceList(r.listino.data);
    if (parsed.ok) {
      priceList = parsed.value;
      priceListVersion = { id: r.listino.id, version: r.listino.version, effectiveFrom: r.listino.effectiveFrom, status: "attiva" };
      listino = "archivio";
    } else warnings.push(`il listino v${r.listino.version} dell'archivio non è valido`);
  } else warnings.push("nessun listino attivo nell'archivio");

  let ruleSet = DEFAULT_LOVATO_RULES;
  let ruleSetVersion: DatasetVersionRef | null = null;
  let regole: CatalogSource = "default";
  if (isRef(r.regole)) {
    try {
      ruleSet = loadRuleSet(r.regole.data);
      ruleSetVersion = { id: r.regole.id, version: r.regole.version, effectiveFrom: r.regole.effectiveFrom };
      regole = "archivio";
    } catch {
      warnings.push(`le regole v${r.regole.version} dell'archivio non sono valide`);
    }
  } else warnings.push("nessun set di regole attivo nell'archivio");

  const error = warnings.length
    ? `${warnings.join(", ").replace(/^./, (c) => c.toUpperCase())}: in uso ${[listino === "default" && "il listino", regole === "default" && "le regole"].filter(Boolean).join(" e ")} di default.`
    : null;
  return {
    priceList,
    priceListVersion,
    ruleSet,
    ruleSetVersion,
    source: listino === "archivio" && regole === "archivio" ? "archivio" : "default",
    sources: { listino, regole },
    error,
    loading: false,
  };
}

/** Catalogo di ripiego dopo un errore di rete o di autorizzazione. */
export const fallbackCatalog = (): CatalogState => ({ ...DEFAULT_CATALOG, error: CATALOG_UNREACHABLE });

/** Listino del catalogo per `computeDerived` (versione delle regole registrata nel preventivo). */
export const pricingOf = (c: CatalogState): PricingCatalog => ({
  priceList: c.priceList,
  priceListVersion: c.priceListVersion,
  ...(c.ruleSetVersion ? { ruleSetVersion: c.ruleSetVersion.id } : {}),
});

/** Etichetta della versione per il pannello: "Listino v5 (dal 01/06)" (spec `configuratore-ui`). */
export function priceListLabel(v: Pick<PriceListVersion, "version" | "effectiveFrom">): string {
  const [, m, d] = v.effectiveFrom.split("-");
  return `Listino v${v.version} (dal ${d}/${m})`;
}

/** "Regole v3 (dal 01/06)" o "Regole di default". */
export function ruleSetLabel(v: DatasetVersionRef | null): string {
  if (!v) return "Regole di default";
  const [, m, d] = v.effectiveFrom.split("-");
  return `Regole v${v.version} (dal ${d}/${m})`;
}

/** Lettura di rete di default (stessa origine, cookie di sessione). */
export async function fetchActiveDatasets(): Promise<unknown> {
  const res = await fetch(ACTIVE_DATASETS_URL, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
