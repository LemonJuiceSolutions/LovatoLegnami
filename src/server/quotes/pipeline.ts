import {
  autoSize,
  checkCollisions,
  evaluateRules,
  fitToEnvelope,
  floorFunction,
  FIT_DIMENSIONS,
  getTypology,
  planDeviations,
  type Assembly,
  type Collision,
  type ParamValue,
  type RuleSet,
  type Violation,
} from "@/domain";
import { assemblyFromConfig, type AssemblyConfig } from "./generate";

/**
 * Flusso del preventivo pubblico sul server (P9): dalla configurazione ricevuta (già
 * validata da `parseConfigFile`) all'assieme da prezzare, con **adattamento all'ingombro**
 * e **auto-dimensionamento** sempre applicati come nel wizard (il cliente non sceglie le
 * sezioni). È deterministico e idempotente: una configurazione già adattata e
 * dimensionata dal wizard ritorna identica, una configurazione manomessa (sezioni sotto
 * regola, misure fuori ingombro) viene corretta prima del prezzo.
 *
 * 1. assieme dalla configurazione; se collide con l'ingombro o gli ostacoli,
 *    `fitToEnvelope` con le dimensioni libere e gli altri parametri bloccati;
 * 2. `autoSize` ripetuto finché propone modifiche (max 3 passate);
 * 3. assieme finale, collisioni e violazioni residue.
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
}

const metres = (mm: number) => `${(Math.round(mm / 10) / 100).toFixed(2).replace(".", ",")} m`;
const DIM_LABELS: Record<(typeof FIT_DIMENSIONS)[number], string> = { altezza: "l'altezza", profondita: "la profondità", larghezza: "la larghezza" };

export const REVIEW_NOTE = "Questa soluzione richiede una verifica del nostro ufficio: puoi comunque inviare la richiesta.";

export function preparePublicAssembly(input: AssemblyConfig, ruleSet: RuleSet): PublicAssembly {
  const template = getTypology(input.typology);
  const floorHeightAt = floorFunction(input.envelope);
  const notes: string[] = [];
  let params: Record<string, ParamValue> = { ...input.params };
  const build = () => assemblyFromConfig({ ...input, params });

  let assembly = build();
  if (checkCollisions(assembly, input.envelope).length > 0) {
    const dims = new Set<string>([...FIT_DIMENSIONS, ...Object.values(template.fitAliases ?? {}).filter((v): v is string => typeof v === "string")]);
    const locked = Object.fromEntries(Object.entries(params).filter(([k]) => !dims.has(k)));
    const fit = fitToEnvelope(template, input.envelope, locked, ruleSet, 50, { embedment: input.embedment });
    if (fit.ok) {
      const changed = Object.entries(fit.params).filter(([k, v]) => dims.has(k) && params[k] !== v && typeof v === "number");
      params = { ...params, ...fit.params };
      for (const [k, v] of changed) {
        const dim = (Object.entries(template.fitAliases ?? {}).find(([, real]) => real === k)?.[0] ?? k) as keyof typeof DIM_LABELS;
        const label = DIM_LABELS[dim] ?? k;
        notes.push(`Abbiamo adattato ${label} a ${metres(v as number)} per stare nello spazio disponibile.`);
      }
      assembly = build();
    }
  }

  let resized = false;
  for (let pass = 0; pass < 3; pass++) {
    const sized = autoSize(assembly, ruleSet, undefined, { floorHeightAt });
    const changes = sized.proposals.filter((p) => params[p.param] !== p.to);
    if (changes.length === 0) break;
    for (const p of changes) params[p.param] = p.to;
    resized = true;
    assembly = build();
  }
  if (resized) notes.push("Le sezioni del legno sono state adeguate automaticamente alle misure scelte.");

  const collisions = checkCollisions(assembly, input.envelope);
  const { violations } = evaluateRules(assembly, ruleSet, { floorHeightAt });
  const needsReview = collisions.length > 0 || violations.some((v) => v.severity === "errore");
  if (input.envelope.plan) {
    const dev = planDeviations(input.envelope.plan).maxCornerDeg;
    if (dev >= 0.5) notes.push(`Pianta fuori squadra di circa ${Math.round(dev)}°: ne abbiamo tenuto conto nel prezzo.`);
  }
  if (needsReview) notes.push(REVIEW_NOTE);
  return { config: { ...input, params }, assembly, collisions, violations, notes, needsReview };
}
