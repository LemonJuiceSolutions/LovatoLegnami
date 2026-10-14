import type { FloorHeightFn } from "../assembly/bounds";
import { SECTION_CATALOG, compareByBendingHeight, parseSectionLabel, sectionLabel } from "../components/sections";
import type { Assembly, ParamValue, PieceType, Section } from "../components/types";
import { evaluateRules, formatNumber } from "./engine";
import type { MaxSpanBySectionRule, MinSectionRule, RuleSet, Violation } from "./types";

/**
 * Auto-dimensionamento greedy e locale (D4): propone nuovi valori dei
 * parametri per le violazioni risolvibili (luce per sezione, interasse
 * travetti, sezione minima). Non modifica l'assieme: restituisce le proposte e
 * i parametri risultanti, da rigenerare con la tipologia.
 */

/** Modifica proposta a un parametro della tipologia. */
export interface Proposal {
  readonly param: string;
  readonly from: ParamValue;
  readonly to: ParamValue;
  /** Regole che la proposta risolve. */
  readonly ruleIds: readonly string[];
  readonly pieceIds: readonly string[];
  /** Descrizione leggibile, es. `"trave: 120×200 → 120×240"`. */
  readonly message: string;
}

export interface AutoSizeResult {
  readonly proposals: readonly Proposal[];
  /** Parametri dell'assieme con le proposte applicate. */
  readonly params: Readonly<Record<string, ParamValue>>;
  /** Violazioni che restano a carico dell'utente. */
  readonly unresolved: readonly Violation[];
}

export interface AutoSizeOptions {
  readonly floorHeightAt?: FloorHeightFn;
  /**
   * Parametro di sezione per tipo di pezzo. Default: convenzione dei template
   * `sezione<Tipo>` (es. `sezioneTrave`), se presente tra i parametri.
   */
  readonly sectionParams?: Readonly<Partial<Record<PieceType, string>>>;
  /** Parametro dell'interasse travetti (default `interasse`). */
  readonly spacingParam?: string;
}

const defaultSectionParam = (t: PieceType): string => `sezione${t[0].toUpperCase()}${t.slice(1)}`;

/** Requisiti che una sezione candidata deve soddisfare per un tipo di pezzo. */
interface SectionNeeds {
  readonly spans: { readonly table: Readonly<Record<string, number>>; readonly span: number }[];
  readonly mins: Section[];
}

function pickSection(current: Section, needs: SectionNeeds, sections: readonly Section[]): Section | undefined {
  const ok = (s: Section) =>
    needs.mins.every((m) => s.b >= m.b && s.h >= m.h) &&
    needs.spans.every(({ table, span }) => (table[sectionLabel(s)] ?? -Infinity) >= span - 1e-3);
  const candidates = sections.filter(ok).sort(compareByBendingHeight);
  return candidates.find((s) => s.b === current.b) ?? candidates[0];
}

/**
 * Propone parametri corretti per le violazioni risolvibili dell'assieme:
 * - `max-span-by-section`: la sezione più piccola tra `sections` (stessa base
 *   se possibile) che in tabella copre la luce misurata;
 * - `min-section`: la sezione più piccola che non scende sotto la minima
 *   (e rispetta anche le tabelle luci del tipo);
 * - `max-joist-spacing`: `ceil(utile / max)` campi e interasse che divide
 *   esattamente la larghezza utile tra gli assi dei travetti d'estremità.
 * Altezza libera, pendenza, sbalzo e sezioni non tabellate restano irrisolte.
 */
export function autoSize(
  assembly: Pick<Assembly, "pieces" | "params">,
  ruleSet: RuleSet,
  sections: readonly Section[] = SECTION_CATALOG,
  options: AutoSizeOptions = {},
): AutoSizeResult {
  const { violations, measures } = evaluateRules(assembly, ruleSet, { floorHeightAt: options.floorHeightAt });
  const ruleById = new Map(ruleSet.rules.map((r) => [r.id, r]));
  const byId = new Map(assembly.pieces.map((p) => [p.id, p]));
  const resolved = new Set<Violation>();
  const proposals: Proposal[] = [];

  // --- sezioni: raccoglie per tipo di pezzo le violazioni risolvibili
  const triggers = new Map<PieceType, Violation[]>();
  for (const v of violations) {
    if (v.code === "sezione-non-tabellata") continue;
    const rule = ruleById.get(v.ruleId);
    let type: PieceType | undefined;
    if (rule?.kind === "min-section") type = rule.pieceType;
    else if (rule?.kind === "max-span-by-section") type = byId.get(v.pieceIds[0])?.type;
    if (!type) continue;
    triggers.set(type, [...(triggers.get(type) ?? []), v]);
  }
  for (const [type, vs] of triggers) {
    const param = options.sectionParams?.[type] ?? defaultSectionParam(type);
    const currentLabel = assembly.params[param];
    const current = typeof currentLabel === "string" ? parseSectionLabel(currentLabel) : undefined;
    if (!current) continue;
    const typeSpan = Math.max(0, ...measures.spans.filter((s) => s.type === type).map((s) => s.span));
    const needs: SectionNeeds = {
      spans: ruleSet.rules
        .filter((r): r is MaxSpanBySectionRule => r.kind === "max-span-by-section" && r.table[type] !== undefined)
        .map((r) => ({ table: r.table[type]!, span: typeSpan })),
      mins: ruleSet.rules
        .filter((r): r is MinSectionRule => r.kind === "min-section" && r.pieceType === type)
        .map((r) => parseSectionLabel(r.section)!),
    };
    const chosen = pickSection(current, needs, sections);
    if (!chosen || (chosen.b === current.b && chosen.h === current.h)) continue;
    vs.forEach((v) => resolved.add(v));
    proposals.push({
      param,
      from: sectionLabel(current),
      to: sectionLabel(chosen),
      ruleIds: [...new Set(vs.map((v) => v.ruleId))],
      pieceIds: [...new Set(vs.flatMap((v) => v.pieceIds))],
      message: `${type}: ${sectionLabel(current)} → ${sectionLabel(chosen)}`,
    });
  }

  // --- interasse travetti
  const spacingViolations = violations.filter((v) => v.kind === "max-joist-spacing");
  const spacingParam = options.spacingParam ?? "interasse";
  const currentSpacing = assembly.params[spacingParam];
  if (spacingViolations.length && typeof currentSpacing === "number") {
    const max = Math.min(...spacingViolations.map((v) => v.limit!));
    let best = Infinity;
    for (const g of measures.joistGroups) {
      if (g.spacing === undefined || g.spacing <= max + 1e-3) continue;
      const usable = g.spacings.reduce((a, b) => a + b, 0);
      best = Math.min(best, usable / Math.ceil(usable / max - 1e-9));
    }
    if (Number.isFinite(best)) {
      spacingViolations.forEach((v) => resolved.add(v));
      proposals.push({
        param: spacingParam,
        from: currentSpacing,
        to: best,
        ruleIds: [...new Set(spacingViolations.map((v) => v.ruleId))],
        pieceIds: [...new Set(spacingViolations.flatMap((v) => v.pieceIds))],
        message: `interasse travetti: ${formatNumber(currentSpacing)} → ${formatNumber(best)} mm`,
      });
    }
  }

  const params: Record<string, ParamValue> = { ...assembly.params };
  for (const p of proposals) params[p.param] = p.to;
  return { proposals, params, unresolved: violations.filter((v) => !resolved.has(v)) };
}
