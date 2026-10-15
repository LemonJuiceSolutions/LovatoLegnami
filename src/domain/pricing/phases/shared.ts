import type { Assembly, PieceType, Section } from "../../components/types";
import type { Envelope } from "../../envelope/types";
import type { AssemblyCutPlan } from "../assembly-cuts";
import { formatEuro, type Cents } from "../money";
import type {
  PriceList,
  PriceListVersion,
  PricingOptions,
  PricingWarning,
  QuoteCategory,
  QuoteLine,
  SiteFactors,
} from "../types";

/**
 * Infrastruttura delle fasi (P1): ogni fase è una funzione pura `(ctx, state) => state`
 * che **aggiunge** righe, avvisi e regole scattate a uno stato immutabile. Il motore
 * (`engine.ts`) le esegue in ordine fisso.
 */

/** Assieme come lo legge il motore: i pezzi sempre, il resto se presente. */
export type PricingAssembly = Pick<Assembly, "pieces"> &
  Partial<Pick<Assembly, "typologySlug" | "params" | "joints" | "hardware" | "meta">>;

export interface PricingContext {
  readonly assembly: PricingAssembly;
  readonly envelope?: Envelope;
  readonly options: PricingOptions;
  readonly priceList: PriceList;
  readonly version: PriceListVersion;
  /** `listino v1 del 2026-01-01`, citato in ogni spiegazione. */
  readonly versionLabel: string;
  readonly siteFactors: SiteFactors;
  readonly cutPlan: AssemblyCutPlan;
}

export interface PhaseState {
  readonly lines: readonly QuoteLine[];
  readonly warnings: readonly PricingWarning[];
  /** Id delle regole di complicazione scattate, in ordine. */
  readonly firedRules: readonly string[];
  /** Ore di montaggio base (fase `labour`): base delle complicazioni `percento-ore`. */
  readonly labourBaseHours: number;
  /** Ore aggiunte dalle complicazioni (`ore`, `percento-ore`): contano per i viaggi. */
  readonly labourExtraHours: number;
}

export type Phase = (ctx: PricingContext, state: PhaseState) => PhaseState;

export const EMPTY_STATE: PhaseState = { lines: [], warnings: [], firedRules: [], labourBaseHours: 0, labourExtraHours: 0 };

/** Nuovo stato con righe e avvisi aggiunti in coda. */
export const append = (
  state: PhaseState,
  lines: readonly QuoteLine[],
  warnings: readonly PricingWarning[] = [],
  extra: Partial<Omit<PhaseState, "lines" | "warnings">> = {},
): PhaseState => ({
  ...state,
  ...extra,
  lines: [...state.lines, ...lines],
  warnings: [...state.warnings, ...warnings],
});

/** Riga del preventivo con visibilità `cliente` di default e quantità ripulita a 1e-6. */
export function line(l: {
  code: string;
  category: QuoteCategory;
  label: string;
  quantity: number;
  unit: string;
  unitPriceCents: Cents;
  amountCents: Cents;
  explain: readonly string[];
  visibility?: QuoteLine["visibility"];
  ruleId?: string;
}): QuoteLine {
  return {
    code: l.code,
    category: l.category,
    label: l.label,
    quantity: round6(l.quantity),
    unit: l.unit,
    unitPriceCents: l.unitPriceCents,
    amountCents: l.amountCents === 0 ? 0 : l.amountCents,
    explain: l.explain,
    visibility: l.visibility ?? "cliente",
    ...(l.ruleId !== undefined ? { ruleId: l.ruleId } : {}),
  };
}

export const round6 = (x: number): number => {
  const r = Math.round(x * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

/** Numero in formato italiano con al più `digits` decimali (virgola, senza zeri finali). */
export function fmt(x: number, digits = 3): string {
  const f = 10 ** digits;
  const r = Math.round(x * f) / f;
  return String(r === 0 ? 0 : r).replace(".", ",");
}

/** Prezzo unitario per le spiegazioni: `650,00 €/m³`. */
export const fmtPrice = (cents: Cents, unit?: string): string => `${formatEuro(cents)}${unit ? `/${unit}` : ""}`;

/** Sezione con il lato minore come base (chiavi del listino). */
export const normalizeSection = (s: Section): Section => (s.b <= s.h ? { b: s.b, h: s.h } : { b: s.h, h: s.b });

const PLURAL: Readonly<Record<PieceType, string>> = {
  pilastro: "pilastri",
  trave: "travi",
  travetto: "travetti",
  puntone: "puntoni",
  colmo: "colmi",
  controvento: "controventi",
  banchina: "banchine",
  tavola: "tavole",
  arco: "archi",
  cantonale: "cantonali",
  monaco: "monaci",
  mensola: "mensole",
  fascia: "fasce",
  grigliato: "grigliati",
};

/** Nome del tipo di pezzo, al plurale se più di uno: `travetti`, `colmo`. */
export const pieceTypeName = (type: PieceType, count: number): string => (count === 1 ? type : PLURAL[type]);

/** Elenco dei tipi presenti (in ordine di prima comparsa): `travetti`, `pilastri e controventi`. */
export function pieceTypesLabel(types: readonly PieceType[]): string {
  const counts = new Map<PieceType, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  const names = [...counts.entries()].map(([t, n]) => pieceTypeName(t, n));
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** Etichetta di un id del listino (specie, qualità): la voce `label` se presente. */
export const labelOf = (items: readonly { id: string; label: string }[], id: string): string => items.find((i) => i.id === id)?.label ?? id;
