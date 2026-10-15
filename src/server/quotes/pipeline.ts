import type { Assembly, Collision, RuleSet, Violation } from "@/domain";
import { simpleNotes } from "@/components/wizard/notes";
import { prepareAssembly, type AssemblyConfig, type PreparedAssembly } from "@/lib/preventivo/pipeline";

export { REVIEW_NOTE } from "@/components/wizard/notes";

/**
 * Flusso del preventivo pubblico sul server (P9): lo stesso del wizard nel browser
 * (`prepareAssembly` di `lib/preventivo/pipeline.ts`: adattamento all'ingombro senza
 * superare le misure chieste e auto-dimensionamento sempre applicati) con le stesse note
 * semplici (`simpleNotes`, 12.2). Deterministico e idempotente: una configurazione già
 * adattata e dimensionata dal wizard ritorna identica, una manomessa (sezioni sotto
 * regola, misure fuori ingombro) viene corretta prima del prezzo.
 */

export interface PublicAssembly {
  readonly config: AssemblyConfig;
  readonly assembly: Assembly;
  readonly collisions: readonly Collision[];
  readonly violations: readonly Violation[];
  /** Note semplici per il cliente (adattamenti, verifiche dell'ufficio). */
  readonly notes: readonly string[];
  /** `true` se restano collisioni o violazioni bloccanti: serve la verifica dell'ufficio. */
  readonly needsReview: boolean;
  readonly prepared: PreparedAssembly;
}

export function preparePublicAssembly(input: AssemblyConfig, ruleSet: RuleSet): PublicAssembly {
  const prepared = prepareAssembly(input, ruleSet);
  const notes = simpleNotes({
    violations: prepared.violations,
    collisions: prepared.collisions,
    fitLimits: prepared.fitAdjustments,
    fitFailed: prepared.fitFailed,
    autosize: prepared.autosize,
    ...(input.envelope.plan ? { plan: input.envelope.plan } : {}),
    obstacles: input.envelope.obstacles,
  });
  const { config, assembly, collisions, violations, needsReview } = prepared;
  return { config, assembly, collisions, violations, notes, needsReview, prepared };
}
