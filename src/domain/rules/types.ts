import { z } from "zod";
import { ValidationError, formatPath } from "../components/errors";
import { parseSectionLabel, sectionLabel } from "../components/sections";
import { PIECE_TYPES, type PieceType } from "../components/types";

/**
 * Regole costruttive dichiarative (D4). Le regole sono DATI: un `RuleSet` è
 * un elenco di regole tipizzate per `kind`, validato da `loadRuleSet`; il
 * motore (`engine.ts`) non contiene valori cablati.
 */

export const SEVERITIES = ["errore", "avviso"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const RULE_KINDS = [
  "max-span-by-section",
  "max-joist-spacing",
  "max-overhang",
  "min-clear-height",
  "slope-range",
  "min-section",
] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

interface RuleBase {
  /** Identificativo stabile della regola (citato nelle violazioni). */
  readonly id: string;
  /** Nome leggibile in italiano. */
  readonly name: string;
  readonly severity: Severity;
  readonly description?: string;
}

/** Tabella luci: per tipo di pezzo, sezione `"b×h"` → luce massima (mm). */
export type SpanTable = Readonly<Partial<Record<PieceType, Readonly<Record<string, number>>>>>;

/**
 * Luce massima per sezione: la luce effettiva di ogni pezzo dei tipi presenti
 * in `table` non deve superare il valore tabellato per la sua sezione. Una
 * sezione assente dalla tabella produce l'avviso "sezione non tabellata".
 */
export interface MaxSpanBySectionRule extends RuleBase {
  readonly kind: "max-span-by-section";
  readonly table: SpanTable;
}

/** Interasse effettivo massimo tra travetti consecutivi (mm). */
export interface MaxJoistSpacingRule extends RuleBase {
  readonly kind: "max-joist-spacing";
  readonly max: number;
}

/**
 * Sbalzo orizzontale massimo oltre l'appoggio estremo (mm), per i tipi di
 * pezzo indicati (tutti i pezzi con appoggi se omesso).
 */
export interface MaxOverhangRule extends RuleBase {
  readonly kind: "max-overhang";
  readonly max: number;
  readonly pieceTypes?: readonly PieceType[];
}

/** Altezza libera minima sotto la copertura, dal pavimento (mm). */
export interface MinClearHeightRule extends RuleBase {
  readonly kind: "min-clear-height";
  readonly min: number;
}

/** Intervallo ammesso della pendenza effettiva dei travetti (gradi). */
export interface SlopeRangeRule extends RuleBase {
  readonly kind: "slope-range";
  readonly min: number;
  readonly max: number;
}

/** Sezione minima (base e altezza) per un tipo di pezzo, come `"b×h"`. */
export interface MinSectionRule extends RuleBase {
  readonly kind: "min-section";
  readonly pieceType: PieceType;
  readonly section: string;
}

export type Rule =
  | MaxSpanBySectionRule
  | MaxJoistSpacingRule
  | MaxOverhangRule
  | MinClearHeightRule
  | SlopeRangeRule
  | MinSectionRule;

export interface RuleSet {
  readonly id: string;
  readonly name?: string;
  readonly rules: readonly Rule[];
}

/** Violazione di una regola su un assieme. */
export interface Violation {
  readonly ruleId: string;
  readonly kind: RuleKind;
  readonly severity: Severity;
  /** Messaggio in italiano. */
  readonly message: string;
  /** Pezzi coinvolti (id), eventualmente vuoto per misure globali. */
  readonly pieceIds: readonly string[];
  /** Valore misurato sull'assieme (mm o gradi). */
  readonly measured?: number;
  /** Limite superato (mm o gradi). */
  readonly limit?: number;
  /** Sottocodice: `"sezione-non-tabellata"` per l'avviso della tabella luci. */
  readonly code?: "sezione-non-tabellata";
}

/* ------------------------------------------------------------------ */
/* Schemi zod                                                          */
/* ------------------------------------------------------------------ */

const finite = () => z.number({ invalid_type_error: "deve essere un numero" }).finite("deve essere finito");
const positive = () => finite().positive("deve essere maggiore di 0");
const nonNegative = () => finite().nonnegative("deve essere maggiore o uguale a 0");
const pieceType = z.enum(PIECE_TYPES as unknown as [PieceType, ...PieceType[]], {
  errorMap: (issue, ctx) =>
    issue.code === "invalid_enum_value"
      ? { message: `tipo di pezzo non supportato: ${JSON.stringify(ctx.data)}` }
      : { message: ctx.defaultError },
});
const sectionString = z
  .string()
  .refine((s) => parseSectionLabel(s) !== undefined, { message: 'sezione non valida (formato atteso "b×h" in mm)' })
  .transform((s) => sectionLabel(parseSectionLabel(s)!));

const base = {
  id: z.string().min(1, "id mancante"),
  name: z.string().min(1, "nome mancante"),
  severity: z.enum(SEVERITIES, {
    errorMap: () => ({ message: `severità non valida (ammesse: ${SEVERITIES.join(", ")})` }),
  }),
  description: z.string().optional(),
};

/** Tabella sezione → luce con chiavi normalizzate in `"b×h"`. */
const spanTableEntry = z.record(z.string(), positive()).transform((rec, ctx) => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) {
    const s = parseSectionLabel(k);
    if (!s) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `sezione non valida in tabella: ${JSON.stringify(k)}` });
      continue;
    }
    out[sectionLabel(s)] = v;
  }
  return out;
});

export const RuleSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("max-span-by-section"), table: z.record(pieceType, spanTableEntry) }).strict(),
  z.object({ ...base, kind: z.literal("max-joist-spacing"), max: positive() }).strict(),
  z.object({ ...base, kind: z.literal("max-overhang"), max: nonNegative(), pieceTypes: z.array(pieceType).optional() }).strict(),
  z.object({ ...base, kind: z.literal("min-clear-height"), min: positive() }).strict(),
  z.object({ ...base, kind: z.literal("slope-range"), min: nonNegative(), max: positive() }).strict(),
  z.object({ ...base, kind: z.literal("min-section"), pieceType, section: sectionString }).strict(),
]).superRefine((r, ctx) => {
  if (r.kind === "slope-range" && r.min > r.max)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "min deve essere ≤ max", path: ["min"] });
});

export const RuleSetSchema = z
  .object({
    id: z.string().min(1, "id mancante"),
    name: z.string().optional(),
    rules: z.array(z.unknown()),
  })
  .strict();

/** Errore di caricamento del set di regole; `ruleId` indica la regola colpevole, se nota. */
export class RuleSetError extends ValidationError {
  readonly ruleId?: string;

  constructor(issues: ConstructorParameters<typeof ValidationError>[1], ruleId?: string) {
    super("set di regole non valido", issues);
    this.name = "RuleSetError";
    this.ruleId = ruleId;
  }
}

const ruleIdOf = (raw: unknown, i: number): string => {
  const id = (raw as { id?: unknown } | null)?.id;
  return typeof id === "string" && id ? id : `#${i}`;
};

/**
 * Valida e normalizza un set di regole (es. da file dati o JSON). Rifiuta
 * con `RuleSetError` kind sconosciuti, parametri non validi e id duplicati;
 * il messaggio indica sempre l'id della regola.
 */
export function loadRuleSet(data: unknown): RuleSet {
  const head = RuleSetSchema.safeParse(data);
  if (!head.success)
    throw new RuleSetError(head.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })));
  const rules: Rule[] = [];
  const seen = new Set<string>();
  head.data.rules.forEach((raw, i) => {
    const id = ruleIdOf(raw, i);
    const path = `rules[${i}]`;
    const kind = (raw as { kind?: unknown } | null)?.kind;
    if (!(RULE_KINDS as readonly unknown[]).includes(kind))
      throw new RuleSetError(
        [{ path: `${path}.kind`, message: `regola "${id}": tipo di vincolo non supportato ${JSON.stringify(kind)} (ammessi: ${RULE_KINDS.join(", ")})` }],
        id,
      );
    const parsed = RuleSchema.safeParse(raw);
    if (!parsed.success)
      throw new RuleSetError(
        parsed.error.issues.map((iss) => ({
          path: iss.path.length ? `${path}.${formatPath(iss.path)}` : path,
          message: `regola "${id}": ${iss.message}`,
        })),
        id,
      );
    if (seen.has(id)) throw new RuleSetError([{ path: `${path}.id`, message: `regola "${id}": id duplicato` }], id);
    seen.add(id);
    rules.push(parsed.data as Rule);
  });
  return { id: head.data.id, ...(head.data.name !== undefined ? { name: head.data.name } : {}), rules };
}
