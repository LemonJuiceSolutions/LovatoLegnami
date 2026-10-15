import { z } from "zod";
import { ValidationError, formatPath, type ValidationIssue } from "../components/errors";
import { parseSectionLabel, sectionLabel } from "../components/sections";
import { HARDWARE_KINDS, JOINT_TYPES, MACHINING_TYPES, PIECE_FAMILIES, PIECE_TYPES } from "../components/types";
import type { AssemblyCutPlan } from "./assembly-cuts";
import type { Cents } from "./money";

/**
 * Listino prezzi (P1) e tipi del preventivo. Il listino è un **documento dati**
 * validato da `PriceListSchema`: lo usano il seed, il DB (jsonb), i form admin, l'import
 * CSV e il motore. Unità: importi in centesimi interi (`…Cents`, o prezzi unitari in
 * centesimi per l'unità nel nome: `pricePerM3` = cent/m³), lunghezze in mm, tempi in
 * minuti (`…Min`) o ore (`…Hours`), percentuali come numeri (15 = 15%).
 * Le sezioni sono chiavi `"b×h"` (`sectionLabel`).
 */

// ---------------------------------------------------------------------------
// Mattoni

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const id = z.string().regex(ID_RE, "identificativo non valido (minuscole, cifre e trattini)");
const label = z.string().trim().min(1, "testo obbligatorio");
/** Importo o prezzo unitario in centesimi, intero ≥ 0. */
const price = z.number({ invalid_type_error: "prezzo non numerico" }).int("il prezzo deve essere in centesimi interi").min(0, "il prezzo non può essere negativo");
/** Percentuale ≥ 0 (i margini possono superare 100). */
const pct = z.number({ invalid_type_error: "percentuale non numerica" }).min(0, "la percentuale non può essere negativa").max(1000, "percentuale fuori scala (max 1000)");
const pct100 = pct.max(100, "la percentuale non può superare 100");
const mm = z.number().min(0, "la misura non può essere negativa");
const minutes = z.number().min(0, "il tempo non può essere negativo");

/** Chiave di sezione `"b×h"` in forma canonica. */
const sectionKey = z.string().refine((k) => {
  const s = parseSectionLabel(k);
  return s !== undefined && sectionLabel(s) === k;
}, "sezione non valida (forma \"b×h\", es. \"80×160\")");

const sectionRecord = <T extends z.ZodTypeAny>(value: T) => z.record(sectionKey, value);

// ---------------------------------------------------------------------------
// Fattori di cantiere (P3): il calcolo è in `site-factors.ts` (4.1), qui solo i nomi

export const NUMERIC_SITE_FACTORS = [
  "planDeviationDeg",
  "wallDeviationDeg",
  "floorSlopePct",
  "floorRangeMm",
  "obstaclesCount",
  "maxHeightMm",
  "clearHeightMm",
  "embedmentMm",
] as const;
export type NumericSiteFactor = (typeof NUMERIC_SITE_FACTORS)[number];

export const ACCESS_LEVELS = ["facile", "medio", "difficile"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export const ANCHORING_KINDS = ["terra", "muro", "misto"] as const;
export type AnchoringKind = (typeof ANCHORING_KINDS)[number];

export const ENUM_SITE_FACTORS = { access: ACCESS_LEVELS, anchoring: ANCHORING_KINDS } as const;
export type EnumSiteFactor = keyof typeof ENUM_SITE_FACTORS;
export type SiteFactorKey = NumericSiteFactor | EnumSiteFactor;
export const SITE_FACTOR_KEYS: readonly SiteFactorKey[] = [...NUMERIC_SITE_FACTORS, "access", "anchoring"];

export type SiteFactors = Readonly<Record<NumericSiteFactor, number>> & {
  readonly access: AccessLevel;
  readonly anchoring: AnchoringKind;
};

// ---------------------------------------------------------------------------
// Regole di complicazione (P3)

export const COMPLICATION_OPS = [">", ">=", "==", "in"] as const;
export type ComplicationOp = (typeof COMPLICATION_OPS)[number];
export const COMPLICATION_EFFECTS = ["ore", "percento-ore", "fisso", "percento-legno"] as const;
export type ComplicationEffectKind = (typeof COMPLICATION_EFFECTS)[number];

const ConditionSchema = z
  .object({
    factor: z.enum(SITE_FACTOR_KEYS as [SiteFactorKey, ...SiteFactorKey[]], {
      errorMap: () => ({ message: `fattore sconosciuto (ammessi: ${SITE_FACTOR_KEYS.join(", ")})` }),
    }),
    op: z.enum(COMPLICATION_OPS),
    value: z.union([z.number(), z.string(), z.array(z.string()).min(1)]),
  })
  .strict()
  .superRefine((c, ctx) => {
    const allowed = (ENUM_SITE_FACTORS as Record<string, readonly string[]>)[c.factor];
    if (allowed) {
      if (c.op === "==" && typeof c.value === "string" && allowed.includes(c.value)) return;
      if (c.op === "in" && Array.isArray(c.value) && c.value.every((v) => allowed.includes(v))) return;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `per "${c.factor}" usare "==" con un valore o "in" con un elenco tra: ${allowed.join(", ")}`,
      });
    } else if (c.op === "in" || typeof c.value !== "number") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: `per "${c.factor}" serve un confronto numerico (>, >=, ==)` });
    }
  });
export type ComplicationCondition = z.infer<typeof ConditionSchema>;

export const ComplicationRuleSchema = z
  .object({
    id,
    label,
    enabled: z.boolean().default(true),
    /** Condizioni in AND; nessuna condizione = regola sempre attiva (sconsigliato). */
    conditions: z.array(ConditionSchema),
    effect: z
      .object({
        kind: z.enum(COMPLICATION_EFFECTS),
        /** Ore (`ore`), percentuale (`percento-*`) o centesimi (`fisso`). */
        value: z.number().min(0, "l'effetto non può essere negativo"),
      })
      .strict()
      .superRefine((e, ctx) => {
        if (e.kind === "fisso" && !Number.isInteger(e.value)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "l'importo fisso deve essere in centesimi interi" });
        }
      }),
    explain: z.string().optional(),
  })
  .strict();
export type ComplicationRule = z.infer<typeof ComplicationRuleSchema>;

// ---------------------------------------------------------------------------
// Sezioni del listino

const StockLengthSchema = z
  .object({
    length: z.number().positive("la lunghezza commerciale deve essere positiva"),
    /** Prezzo della barra intera: se presente prevale su €/ml e €/m³ (non dipende dalla specie). */
    priceCents: price.optional(),
    /** Qualità in cui la lunghezza è disponibile (assente = tutte), es. 13 500 solo lamellare. */
    qualities: z.array(id).min(1).optional(),
  })
  .strict();
export type StockLength = z.infer<typeof StockLengthSchema>;

const TimberSchema = z
  .object({
    species: z.array(z.object({ id, label }).strict()).min(1, "almeno una specie"),
    qualities: z.array(z.object({ id, label }).strict()).min(1, "almeno una qualità"),
    /** cent/m³ per specie e qualità; combinazioni assenti ⇒ "prezzo mancante". */
    pricePerM3: z.record(id, z.record(id, price)),
    /** cent/ml per sezione: se presente prevale sul prezzo al m³ (stessa per ogni specie). */
    pricePerMl: sectionRecord(price).optional(),
    /** Pezzi curvi: cent/ml di sviluppo per sezione più un fisso per pezzo. */
    curvedPerMl: sectionRecord(price),
    curvedSetupCents: price,
    /** Tipi di pezzo prezzati come pannelli: cent/m² di lunghezza × lato maggiore della sezione. */
    panelsPerM2: z.record(z.enum(PIECE_TYPES), price),
    stockLengths: sectionRecord(z.array(StockLengthSchema).min(1, "almeno una lunghezza commerciale")),
    /** Spessore lama (mm), consumato da ogni taglio tra due pezzi. */
    kerf: mm,
    /** Rifilo di testa (mm), perso a ognuna delle due estremità della barra. */
    endTrim: mm,
    /** Spezzone minimo riutilizzabile per sezione (mm). */
    minReusableOffcut: sectionRecord(mm),
    /** Valore recuperato degli spezzoni riutilizzabili (% del loro costo). */
    offcutRecoveryPct: pct100,
  })
  .strict();

const MachiningRateSchema = z
  .object({
    baseMin: minutes,
    perUnitMin: minutes,
    /** Grandezza della lavorazione: lunghezza (mm), area (cm²) o numero (n). */
    unit: z.enum(["mm", "cm2", "n"]),
  })
  .strict();

const MachiningSchema = z
  .object({
    hourlyRateCents: price,
    handlingMinPerPiece: minutes,
    perType: z.record(z.enum(MACHINING_TYPES), MachiningRateSchema),
  })
  .strict();

const CatalogItemSchema = z.object({ id, label, pricePerM2Cents: price }).strict();

const LabourSchema = z
  .object({
    hourlyRateCents: price,
    crewSize: z.number().int().min(1, "la squadra ha almeno una persona"),
    hoursPerDay: z.number().positive("le ore per giornata devono essere positive").max(24),
    setupHours: z.number().min(0),
    minPerPiece: z.record(z.enum(PIECE_FAMILIES), minutes),
    minPerJoint: z.record(z.enum(JOINT_TYPES), minutes),
    minPerHardware: z.record(z.enum(HARDWARE_KINDS), minutes),
    /** Oltre questa altezza dell'assieme (mm) serve il trabattello/ponteggio. */
    scaffoldHeightMm: z.number().positive(),
    scaffoldCents: price,
  })
  .strict();

const ZoneSchema = z
  .object({
    name: label,
    /** Prefissi di CAP (1–5 cifre); vince il prefisso più lungo. */
    capPrefixes: z.array(z.string().regex(/^\d{1,5}$/, "prefisso CAP non valido (1–5 cifre)")),
    km: z.number().min(0),
    priceCents: price,
  })
  .strict();

const TransportSchema = z
  .object({
    zones: z.array(ZoneSchema).min(1, "almeno una zona"),
    /** Nome della zona usata quando il CAP non corrisponde a nessun prefisso. */
    fallbackZone: label,
    /** Prezzo per km (andata) quando l'ufficio inserisce la distanza a mano. */
    perKmCents: price.optional(),
  })
  .strict();

const DiscountSchema = z
  .object({
    id,
    label,
    kind: z.enum(["percento", "fisso"]),
    /** Percentuale o centesimi. */
    value: z.number().min(0, "lo sconto non può essere negativo"),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.kind === "percento" && d.value > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "lo sconto non può superare 100%" });
    if (d.kind === "fisso" && !Number.isInteger(d.value)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "lo sconto fisso deve essere in centesimi interi" });
  });
export type Discount = z.infer<typeof DiscountSchema>;

const VatRateSchema = z.object({ id, label, pct: pct100 }).strict();

// ---------------------------------------------------------------------------
// Listino

const uniqueBy = <T>(items: readonly T[], key: (t: T) => string, path: (string | number)[], what: string, ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  items.forEach((it, i) => {
    const k = key(it);
    if (seen.has(k)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, i], message: `${what} "${k}" duplicato` });
    seen.add(k);
  });
};

export const PriceListSchema = z
  .object({
    currency: z.literal("EUR").default("EUR"),
    timber: TimberSchema,
    machining: MachiningSchema,
    hardware: z.object({ priceCents: z.record(z.string().min(1), price) }).strict(),
    treatments: z.array(CatalogItemSchema),
    coverings: z.array(CatalogItemSchema),
    labour: LabourSchema,
    complications: z.array(ComplicationRuleSchema),
    transport: TransportSchema,
    margins: z.object({ materialsPct: pct, labourPct: pct }).strict(),
    discounts: z.array(DiscountSchema),
    vatRates: z.array(VatRateSchema).min(1, "almeno un'aliquota IVA"),
    defaultVat: id,
    minimumOrderCents: price,
    roundingStepCents: price.min(1, "il passo di arrotondamento deve essere almeno 1 centesimo"),
    /** Fascia di indicatività della vista cliente (±%). */
    indicativityPct: pct100,
  })
  .strict()
  .superRefine((pl, ctx) => {
    const t = pl.timber;
    const species = new Set(t.species.map((s) => s.id));
    const qualities = new Set(t.qualities.map((q) => q.id));
    uniqueBy(t.species, (s) => s.id, ["timber", "species"], "specie", ctx);
    uniqueBy(t.qualities, (q) => q.id, ["timber", "qualities"], "qualità", ctx);
    for (const [sp, byQ] of Object.entries(t.pricePerM3)) {
      if (!species.has(sp)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["timber", "pricePerM3", sp], message: `specie "${sp}" non dichiarata` });
      for (const q of Object.keys(byQ)) {
        if (!qualities.has(q)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["timber", "pricePerM3", sp, q], message: `qualità "${q}" non dichiarata` });
      }
    }
    for (const [sec, lengths] of Object.entries(t.stockLengths)) {
      uniqueBy(lengths, (l) => String(l.length), ["timber", "stockLengths", sec], "lunghezza", ctx);
      lengths.forEach((l, i) => {
        if (l.length <= 2 * t.endTrim) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["timber", "stockLengths", sec, i, "length"], message: `lunghezza ${l.length} non superiore ai due rifili (${2 * t.endTrim})` });
        }
        l.qualities?.forEach((q, j) => {
          if (!qualities.has(q)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["timber", "stockLengths", sec, i, "qualities", j], message: `qualità "${q}" non dichiarata` });
        });
      });
    }
    uniqueBy(pl.treatments, (x) => x.id, ["treatments"], "trattamento", ctx);
    uniqueBy(pl.coverings, (x) => x.id, ["coverings"], "copertura", ctx);
    uniqueBy(pl.complications, (x) => x.id, ["complications"], "regola", ctx);
    uniqueBy(pl.discounts, (x) => x.id, ["discounts"], "sconto", ctx);
    uniqueBy(pl.vatRates, (x) => x.id, ["vatRates"], "aliquota", ctx);
    uniqueBy(pl.transport.zones, (z) => z.name, ["transport", "zones"], "zona", ctx);
    const prefixes = new Map<string, string>();
    pl.transport.zones.forEach((zone, i) =>
      zone.capPrefixes.forEach((p, j) => {
        const other = prefixes.get(p);
        if (other !== undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["transport", "zones", i, "capPrefixes", j], message: `prefisso CAP "${p}" già assegnato alla zona "${other}"` });
        }
        prefixes.set(p, zone.name);
      }),
    );
    if (!pl.transport.zones.some((z) => z.name === pl.transport.fallbackZone)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["transport", "fallbackZone"], message: `zona di ripiego "${pl.transport.fallbackZone}" non definita` });
    }
    if (!pl.vatRates.some((v) => v.id === pl.defaultVat)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultVat"], message: `aliquota "${pl.defaultVat}" non definita` });
    }
  });

export type PriceList = z.infer<typeof PriceListSchema>;
/** Ingresso del listino (prima dei default dello schema, es. `enabled` delle regole). */
export type PriceListInput = z.input<typeof PriceListSchema>;

export class PriceListError extends ValidationError {
  constructor(issues: readonly ValidationIssue[]) {
    super("listino non valido", issues);
    this.name = "PriceListError";
  }
}

const zodIssues = (error: z.ZodError): ValidationIssue[] =>
  error.issues.map((i) => ({ path: formatPath(i.path), message: i.message }));

/** Valida senza lanciare: elenco dei campi errati con percorso (es. `transport.zones[2].priceCents`). */
export function safeParsePriceList(data: unknown): { ok: true; value: PriceList } | { ok: false; issues: ValidationIssue[] } {
  const r = PriceListSchema.safeParse(data);
  return r.success ? { ok: true, value: r.data } : { ok: false, issues: zodIssues(r.error) };
}

/** Valida un listino; `PriceListError` con un'issue per campo errato. */
export function parsePriceList(data: unknown): PriceList {
  const r = safeParsePriceList(data);
  if (!r.ok) throw new PriceListError(r.issues);
  return r.value;
}

// ---------------------------------------------------------------------------
// Versioni

export const VERSION_STATUSES = ["bozza", "attiva", "archiviata"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

/** Data ISO `AAAA-MM-GG`. */
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data non valida (AAAA-MM-GG)");

export const PriceListVersionSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().min(1),
    effectiveFrom: IsoDateSchema,
    status: z.enum(VERSION_STATUSES),
  })
  .strict();
export type PriceListVersion = z.infer<typeof PriceListVersionSchema>;

/** `Date` o stringa ISO → `AAAA-MM-GG` (UTC per le `Date`). */
export const isoDay = (date: Date | string): string => (typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10));

/**
 * Versione in vigore alla data: l'ultima `attiva` con `effectiveFrom ≤ data`
 * (a parità di validità, il numero di versione più alto). `undefined` se nessuna.
 */
export function selectVersion<V extends Pick<PriceListVersion, "version" | "effectiveFrom" | "status">>(
  versions: readonly V[],
  date: Date | string,
): V | undefined {
  const day = isoDay(date);
  let best: V | undefined;
  for (const v of versions) {
    if (v.status !== "attiva" || v.effectiveFrom > day) continue;
    if (!best || v.effectiveFrom > best.effectiveFrom || (v.effectiveFrom === best.effectiveFrom && v.version > best.version)) best = v;
  }
  return best;
}

/** Etichetta della versione per le spiegazioni: `listino v3 del 2026-01-01`. */
export const versionLabel = (v: Pick<PriceListVersion, "version" | "effectiveFrom">): string => `listino v${v.version} del ${v.effectiveFrom}`;

// ---------------------------------------------------------------------------
// Opzioni commerciali

export const PricingOptionsSchema = z
  .object({
    species: id,
    quality: id,
    treatment: id.nullable().optional(),
    covering: id.nullable().optional(),
    /** Aliquota IVA (id); assente = `defaultVat` del listino. */
    vat: id.optional(),
    /** Sconti dal catalogo del listino (id) o manuali dell'ufficio. */
    discounts: z.array(z.union([id, DiscountSchema])).optional(),
    /** CAP di consegna (5 cifre). */
    cap: z.string().regex(/^\d{5}$/, "CAP non valido (5 cifre)").optional(),
    /** Distanza inserita dall'ufficio (km): prevale sulla zona del CAP. */
    km: z.number().min(0).optional(),
    access: z.enum(ACCESS_LEVELS).default("facile"),
    anchoring: z.enum(ANCHORING_KINDS).optional(),
    /** Data del preventivo (scelta della versione), `AAAA-MM-GG`. */
    date: IsoDateSchema.optional(),
  })
  .strict();
export type PricingOptions = z.infer<typeof PricingOptionsSchema>;
export type PricingOptionsInput = z.input<typeof PricingOptionsSchema>;

// ---------------------------------------------------------------------------
// Piano di taglio (P2; calcolo in `cutting-stock.ts`)

/** Pezzo da ricavare. */
export interface CutDemand {
  readonly id: string;
  readonly length: number;
}

/** Lunghezza commerciale con il prezzo della barra già risolto. */
export interface StockOption {
  readonly length: number;
  readonly priceCents: Cents;
}

export interface CutOptions {
  readonly kerf: number;
  readonly endTrim: number;
  readonly minReusableOffcut: number;
}

/** Barra del piano: tagli in ordine, spezzone residuo e se è riutilizzabile. */
export interface CutBar {
  readonly length: number;
  readonly priceCents: Cents;
  readonly cuts: readonly CutDemand[];
  /** Residuo al netto di rifili e lame (mm). */
  readonly offcut: number;
  readonly reusable: boolean;
}

export interface CuttingPlan {
  readonly bars: readonly CutBar[];
  /** Pezzi più lunghi della lunghezza utile massima. */
  readonly nonRicavabili: readonly CutDemand[];
  readonly costCents: Cents;
  readonly barCount: number;
  /** Somma dei residui non riutilizzabili (mm). */
  readonly nonReusableWaste: number;
  /** Somma dei residui riutilizzabili (mm). */
  readonly reusableOffcut: number;
}

// ---------------------------------------------------------------------------
// Preventivo

export const QUOTE_CATEGORIES = [
  "legno",
  "sfrido",
  "lavorazioni",
  "ferramenta",
  "trattamenti",
  "copertura",
  "montaggio",
  "complicazioni",
  "trasporto",
  "sconti",
  "margine",
  "adeguamenti",
  "iva",
] as const;
export type QuoteCategory = (typeof QUOTE_CATEGORIES)[number];

export interface QuoteLine {
  readonly code: string;
  readonly category: QuoteCategory;
  readonly label: string;
  readonly quantity: number;
  /** Unità della quantità: `m³`, `ml`, `m²`, `h`, `min`, `pz`, `viaggi`, `%`, `€`. */
  readonly unit: string;
  readonly unitPriceCents: Cents;
  readonly amountCents: Cents;
  readonly explain: readonly string[];
  readonly visibility: "cliente" | "ufficio";
  /** Regola di complicazione che ha prodotto la riga. */
  readonly ruleId?: string;
}

export interface QuoteGroup {
  readonly category: QuoteCategory;
  readonly label: string;
  readonly amountCents: Cents;
  readonly lines: readonly QuoteLine[];
}

export const WARNING_CODES = [
  "prezzo-mancante",
  "tariffa-mancante",
  "zona-da-verificare",
  "non-ricavabile",
  "lunghezze-mancanti",
  /** Aliquota IVA o sconto delle opzioni non presenti nel listino (gruppo 4). */
  "opzione-sconosciuta",
] as const;
export type PricingWarningCode = (typeof WARNING_CODES)[number];

export interface PricingWarning {
  readonly code: PricingWarningCode;
  readonly message: string;
  /** Sezione, codice, tipo di lavorazione o pezzo interessato. */
  readonly ref?: string;
  /** Il preventivo non è affidabile (stato `incompleto`). */
  readonly blocking: boolean;
}

export interface QuoteTotals {
  /** Somma delle righe di costo (prima di margini e sconti). */
  readonly costCents: Cents;
  readonly marginCents: Cents;
  /** Somma degli sconti (≤ 0). */
  readonly discountCents: Cents;
  /** Adeguamento al minimo d'ordine (≥ 0). */
  readonly minimumAdjustmentCents: Cents;
  readonly taxableCents: Cents;
  readonly vatPct: number;
  readonly vatCents: Cents;
  readonly roundingCents: Cents;
  /** Totale IVA inclusa, arrotondato al passo. */
  readonly totalCents: Cents;
}

export interface Quote {
  readonly status: "completo" | "incompleto";
  /** Tipologia dell'assieme preventivato (se nota). */
  readonly typologySlug?: string;
  readonly priceListVersion: PriceListVersion;
  readonly ruleSetVersion?: string;
  readonly options: PricingOptions;
  /** Righe nell'ordine delle fasi: costi, margini, sconti, minimo, IVA, arrotondamento. */
  readonly lines: readonly QuoteLine[];
  /** Righe raggruppate per categoria, nell'ordine di `QUOTE_CATEGORIES`. */
  readonly groups: readonly QuoteGroup[];
  readonly totals: QuoteTotals;
  readonly warnings: readonly PricingWarning[];
  readonly siteFactors: SiteFactors;
  /** Id delle regole di complicazione scattate, in ordine. */
  readonly firedRules: readonly string[];
  /** Piano di taglio del legno (vista ufficio). */
  readonly cutPlan: AssemblyCutPlan;
}
