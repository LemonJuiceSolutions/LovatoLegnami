import type { FloorHeightFn } from "../assembly/bounds";
import { type Measures, measureAssembly } from "../assembly/measures";
import { parseSectionLabel, sectionLabel } from "../components/sections";
import type { Assembly, Piece, PieceType } from "../components/types";
import type {
  MaxJoistSpacingRule,
  MaxOverhangRule,
  MaxSpanBySectionRule,
  MinClearHeightRule,
  MinSectionRule,
  Rule,
  RuleSet,
  SlopeRangeRule,
  Violation,
} from "./types";
import { FLAT_SLOPE_TOLERANCE } from "./types";

/**
 * Motore delle regole costruttive (D4): valuta ogni regola del set sulle
 * misure effettive dell'assieme (`assembly/measures.ts`), non sui parametri
 * di input, così vale per qualsiasi tipologia.
 */

/** Tolleranza nei confronti con i limiti (mm o gradi). */
const TOL = 1e-3;

export interface EvaluateOptions {
  /** Quota del pavimento, per l'altezza libera (piano a 0 se omessa). */
  readonly floorHeightAt?: FloorHeightFn;
  /** Misure già calcolate (evita di ricalcolarle). */
  readonly measures?: Measures;
}

export interface RuleEvaluation {
  readonly violations: readonly Violation[];
  /** `true` se nessuna violazione ha severità `errore` (assieme esportabile). */
  readonly valid: boolean;
  readonly measures: Measures;
}

/** Numero in mm/gradi per i messaggi: al più un decimale, virgola decimale. */
export const formatNumber = (v: number): string => String(Math.round(v * 10) / 10 + 0).replace(".", ",");

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

interface Ctx {
  readonly assembly: Pick<Assembly, "pieces">;
  readonly measures: Measures;
  readonly byId: ReadonlyMap<string, Piece>;
}

/** Raggruppa per chiave mantenendo l'ordine di prima comparsa. */
function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const g = out.get(k);
    if (g) g.push(it);
    else out.set(k, [it]);
  }
  return out;
}

function maxSpan(rule: MaxSpanBySectionRule, c: Ctx): Violation[] {
  const out: Violation[] = [];
  const spans = c.measures.spans.filter((s) => rule.table[s.type] !== undefined);
  const groups = groupBy(spans, (s) => `${s.type}|${sectionLabel(c.byId.get(s.pieceId)!.section)}`);
  for (const [key, items] of groups) {
    const [type, section] = key.split("|") as [PieceType, string];
    const limit = rule.table[type]![section];
    if (limit === undefined) {
      out.push({
        ruleId: rule.id,
        kind: rule.kind,
        severity: "avviso",
        code: "sezione-non-tabellata",
        message: `Sezione non tabellata: ${type} ${section} non ha una luce massima nella tabella "${rule.name}"; verificare con l'ufficio tecnico.`,
        pieceIds: items.map((s) => s.pieceId),
      });
      continue;
    }
    const over = items.filter((s) => s.span > limit + TOL);
    if (over.length === 0) continue;
    const measured = Math.max(...over.map((s) => s.span));
    out.push({
      ruleId: rule.id,
      kind: rule.kind,
      severity: rule.severity,
      message: `Luce eccessiva: ${type} ${section} copre ${formatNumber(measured)} mm, oltre il massimo di ${formatNumber(limit)} mm per la sezione (${over.length} ${plural(over.length, "pezzo", "pezzi")}).`,
      pieceIds: over.map((s) => s.pieceId),
      measured,
      limit,
    });
  }
  return out;
}

function maxJoistSpacing(rule: MaxJoistSpacingRule, c: Ctx): Violation[] {
  const over = c.measures.joistGroups.filter((g) => g.spacing !== undefined && g.spacing > rule.max + TOL);
  if (over.length === 0) return [];
  const measured = Math.max(...over.map((g) => g.spacing!));
  return [
    {
      ruleId: rule.id,
      kind: rule.kind,
      severity: rule.severity,
      message: `Interasse travetti di ${formatNumber(measured)} mm oltre il massimo di ${formatNumber(rule.max)} mm.`,
      pieceIds: over.flatMap((g) => g.pieceIds),
      measured,
      limit: rule.max,
    },
  ];
}

function maxOverhang(rule: MaxOverhangRule, c: Ctx): Violation[] {
  const over = c.measures.spans.filter(
    (s) => s.supports.length > 0 && (!rule.pieceTypes || rule.pieceTypes.includes(s.type)) && s.overhang > rule.max + TOL,
  );
  if (over.length === 0) return [];
  const measured = Math.max(...over.map((s) => s.overhang));
  const types = [...new Set(over.map((s) => s.type))].join(", ");
  return [
    {
      ruleId: rule.id,
      kind: rule.kind,
      severity: rule.severity,
      message: `Sbalzo di ${formatNumber(measured)} mm (${types}) oltre il massimo di ${formatNumber(rule.max)} mm.`,
      pieceIds: over.map((s) => s.pieceId),
      measured,
      limit: rule.max,
    },
  ];
}

function minClearHeight(rule: MinClearHeightRule, c: Ctx): Violation[] {
  const h = c.measures.clearHeight;
  if (!h || h.value >= rule.min - TOL) return [];
  return [
    {
      ruleId: rule.id,
      kind: rule.kind,
      severity: rule.severity,
      message: `Altezza libera di ${formatNumber(h.value)} mm sotto ${h.pieceId}, inferiore al minimo di ${formatNumber(rule.min)} mm.`,
      pieceIds: [h.pieceId],
      measured: h.value,
      limit: rule.min,
    },
  ];
}

function slopeRange(rule: SlopeRangeRule, c: Ctx): Violation[] {
  const flat = (deg: number) => rule.allowFlat === true && deg <= FLAT_SLOPE_TOLERANCE + TOL;
  const out = c.measures.slopes.filter((s) => !flat(s.deg) && (s.deg < rule.min - TOL || s.deg > rule.max + TOL));
  if (out.length === 0) return [];
  const low = out.filter((s) => s.deg < rule.min - TOL);
  const measured = low.length ? Math.min(...low.map((s) => s.deg)) : Math.max(...out.map((s) => s.deg));
  return [
    {
      ruleId: rule.id,
      kind: rule.kind,
      severity: rule.severity,
      message: `Pendenza di ${formatNumber(measured)}° fuori dall'intervallo ammesso ${formatNumber(rule.min)}°–${formatNumber(rule.max)}°${rule.allowFlat ? " (copertura piana ammessa)" : ""}.`,
      pieceIds: out.map((s) => s.pieceId),
      measured,
      limit: low.length ? rule.min : rule.max,
    },
  ];
}

function minSection(rule: MinSectionRule, c: Ctx): Violation[] {
  const min = parseSectionLabel(rule.section)!;
  const small = c.assembly.pieces.filter((p) => p.type === rule.pieceType && (p.section.b < min.b || p.section.h < min.h));
  return [...groupBy(small, (p) => sectionLabel(p.section))].map(([section, items]) => ({
    ruleId: rule.id,
    kind: rule.kind,
    severity: rule.severity,
    message: `Sezione ${rule.pieceType} ${section} inferiore alla minima ${sectionLabel(min)}.`,
    pieceIds: items.map((p) => p.id),
  }));
}

/** Valuta una singola regola sulle misure dell'assieme. */
export function evaluateRule(rule: Rule, assembly: Pick<Assembly, "pieces">, measures: Measures): Violation[] {
  const c: Ctx = { assembly, measures, byId: new Map(assembly.pieces.map((p) => [p.id, p])) };
  switch (rule.kind) {
    case "max-span-by-section":
      return maxSpan(rule, c);
    case "max-joist-spacing":
      return maxJoistSpacing(rule, c);
    case "max-overhang":
      return maxOverhang(rule, c);
    case "min-clear-height":
      return minClearHeight(rule, c);
    case "slope-range":
      return slopeRange(rule, c);
    case "min-section":
      return minSection(rule, c);
  }
}

/**
 * Valuta tutte le regole del set sull'assieme. L'assieme è valido (esportabile)
 * se nessuna violazione ha severità `errore`.
 */
export function evaluateRules(assembly: Pick<Assembly, "pieces">, ruleSet: RuleSet, options: EvaluateOptions = {}): RuleEvaluation {
  const measures = options.measures ?? measureAssembly(assembly, { floorHeightAt: options.floorHeightAt });
  const violations = ruleSet.rules.flatMap((r) => evaluateRule(r, assembly, measures));
  return { violations, valid: !violations.some((v) => v.severity === "errore"), measures };
}

/** Violazioni bloccanti (severità `errore`). */
export const blockingViolations = (violations: readonly Violation[]): Violation[] =>
  violations.filter((v) => v.severity === "errore");
