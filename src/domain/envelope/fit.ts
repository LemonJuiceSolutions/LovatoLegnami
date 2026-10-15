import type { Assembly, ParamValue } from "../components/types";
import { evaluateRules } from "../rules/engine";
import type { RuleSet, Violation } from "../rules/types";
import { getTypology } from "../typologies/registry";
import { type NumberParamSpec, type TypologyTemplate, buildAssembly } from "../typologies/template";
import { type Collision, ENVELOPE_ID, checkCollisions } from "./collisions";
import { floorFunction } from "./floor";
import { wallBuildOptions } from "./plan";
import type { Envelope, Side } from "./types";

/**
 * Adattamento automatico all'ingombro (D5). Cerca la pergola più grande che
 * non collide con ingombro e ostacoli e non viola regole di severità
 * `errore`, partendo dal box ingombro e riducendo le dimensioni libere
 * nell'ordine altezza → profondità → larghezza (l'altezza è la prima a
 * cedere, la larghezza l'ultima). Valori sulla griglia `min + k·step`:
 * - larghezza e profondità partono dal massimo che sta in pianta nel box
 *   (bisezione sulle collisioni con i lati verticali);
 * - per ogni candidato (larghezza, profondità) l'altezza è il massimo senza
 *   collisioni (bisezione) e, se lì una regola `errore` è violata, il massimo
 *   conforme sotto di esso (bisezione, regole assunte monotone);
 * - profondità e larghezza scendono per bisezione finché esiste un'altezza
 *   ammissibile.
 * Per ogni dimensione registra la causa dell'arresto (ostacolo, ingombro,
 * regola o limite del parametro). O(log n) rigenerazioni per livello.
 */

/** Dimensioni ricercate, nell'ordine di ricerca. */
export const FIT_DIMENSIONS = ["altezza", "profondita", "larghezza"] as const;
export type FitDimension = (typeof FIT_DIMENSIONS)[number];

/** Causa che ha fermato la crescita di una dimensione. */
export type FitCause =
  | { readonly kind: "ostacolo"; readonly obstacleIds: readonly string[] }
  | { readonly kind: "ingombro"; readonly sides: readonly Side[] }
  | { readonly kind: "regola"; readonly ruleIds: readonly string[] }
  | { readonly kind: "parametro"; readonly max: number }
  | { readonly kind: "tipologia"; readonly reason: string }
  | { readonly kind: "bloccato" };

export interface FitLimit {
  readonly param: FitDimension;
  readonly value: number;
  readonly cause: FitCause;
  /** Descrizione leggibile in italiano. */
  readonly message: string;
}

export interface FitOptions {
  /** Tolleranza delle collisioni (mm, default 0). */
  readonly tolerance?: number;
  /** Affondamento dei pilastri (mm, default 0). */
  readonly embedment?: number;
}

export type FitResult =
  | {
      readonly ok: true;
      readonly params: Readonly<Record<string, ParamValue>>;
      readonly assembly: Assembly;
      readonly limits: readonly FitLimit[];
      /** Violazioni residue (solo avvisi). */
      readonly violations: readonly Violation[];
    }
  | {
      readonly ok: false;
      readonly reason: "nessuna soluzione";
      readonly message: string;
      /** Dimensione per cui non esiste alcun valore ammissibile. */
      readonly param: FitDimension;
      /** Regole bloccanti (severità `errore`). */
      readonly violations: readonly Violation[];
      readonly collisions: readonly Collision[];
      /** Limiti delle dimensioni già fissate prima dell'arresto. */
      readonly limits: readonly FitLimit[];
    };

interface Trial {
  readonly collisions: Collision[];
  readonly errors: Violation[];
  readonly violations: readonly Violation[];
  readonly assembly?: Assembly;
  readonly buildError?: string;
}

const LABEL: Readonly<Record<FitDimension, string>> = { altezza: "altezza", profondita: "profondità", larghezza: "larghezza" };

function describeCause(dim: FitDimension, value: number, cause: FitCause): string {
  const head = `${LABEL[dim]} ${value} mm`;
  switch (cause.kind) {
    case "ostacolo":
      return `${head}: limitata dall'ostacolo ${cause.obstacleIds.join(", ")}`;
    case "ingombro":
      return `${head}: limitata dall'ingombro (lato ${cause.sides.join(", ")})`;
    case "regola":
      return cause.ruleIds.length
        ? `${head}: limitata dalla regola ${cause.ruleIds.join(", ")}`
        : `${head}: limitata dalle regole costruttive`;
    case "parametro":
      return `${head}: massimo ammesso dalla tipologia (${cause.max} mm)`;
    case "bloccato":
      return `${head}: bloccata dall'utente`;
    case "tipologia":
      return `${head}: valore successivo non generabile (${cause.reason})`;
  }
}

/** Causa del fallimento di un tentativo: ostacoli prima dell'ingombro, poi regole. */
function causeOf(t: Trial): FitCause {
  if (t.buildError) return { kind: "tipologia", reason: t.buildError };
  const obstacles = [...new Set(t.collisions.filter((c) => c.obstacleId !== ENVELOPE_ID).map((c) => c.obstacleId))];
  if (obstacles.length) return { kind: "ostacolo", obstacleIds: obstacles };
  const sides = [...new Set(t.collisions.flatMap((c) => (c.side ? [c.side] : [])))];
  if (t.collisions.length) return { kind: "ingombro", sides };
  return { kind: "regola", ruleIds: [...new Set(t.errors.map((v) => v.ruleId))] };
}

const PLAN_SIDES: readonly Side[] = ["sinistro", "destro", "anteriore", "posteriore"];

/** Indice del massimo `k` in [0, hi] con `pred(k)` vero, assumendo `pred` decrescente; −1 se `pred(0)` è falso. */
function searchMax(hi: number, pred: (k: number) => boolean): number {
  if (hi < 0) return -1;
  if (pred(hi)) return hi;
  if (!pred(0)) return -1;
  let [lo, up] = [0, hi]; // pred(lo) vero, pred(up) falso
  while (up - lo > 1) {
    const mid = (lo + up) >> 1;
    if (pred(mid)) lo = mid;
    else up = mid;
  }
  return lo;
}

interface Grid {
  readonly spec: NumberParamSpec;
  /** Ultimo indice: corrisponde a `spec.max`. */
  readonly top: number;
  valueAt(k: number): number;
}

function grid(spec: NumberParamSpec, step: number): Grid {
  const K = Math.floor((spec.max - spec.min) / step + 1e-9);
  const top = spec.max > spec.min + K * step + 1e-9 ? K + 1 : K;
  return { spec, top, valueAt: (k) => (k >= top ? spec.max : spec.min + k * step) };
}

/**
 * Adatta la tipologia all'ingombro. `lockedParams` sono i parametri fissati
 * dall'utente (incluse eventuali dimensioni bloccate); le dimensioni non
 * bloccate vengono cercate. Restituisce i parametri trovati e le cause dei
 * limiti, oppure "nessuna soluzione" con le regole/collisioni bloccanti.
 */
export function fitToEnvelope(
  typology: TypologyTemplate | string,
  envelope: Envelope,
  lockedParams: Readonly<Record<string, ParamValue>>,
  ruleSet: RuleSet,
  step = 50,
  options: FitOptions = {},
): FitResult {
  const template = typeof typology === "string" ? getTypology(typology) : typology;
  if (!(step > 0)) throw new Error("fitToEnvelope: il passo deve essere maggiore di 0");
  // alias delle dimensioni (es. `profondita` → `sbalzo`): la ricerca usa i nomi delle dimensioni,
  // i parametri della tipologia i propri nomi
  const aliases = template.fitAliases ?? {};
  const realName = (key: string): string => (aliases as Record<string, string | undefined>)[key] ?? key;
  const dimName = new Map(Object.entries(aliases).map(([d, real]) => [real as string, d]));
  const toReal = (p: Readonly<Record<string, ParamValue>>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [realName(k), v]));
  const locked: Readonly<Record<string, ParamValue>> = Object.fromEntries(Object.entries(lockedParams).map(([k, v]) => [dimName.get(k) ?? k, v]));
  const floorHeightAt = floorFunction(envelope);
  // muri reali della pianta per le tipologie a muro (P4); le autoportanti restano rettangolari nel prisma
  const walls = wallBuildOptions(template, envelope);
  const cache = new Map<string, Trial>();

  const trial = (params: Readonly<Record<string, ParamValue>>): Trial => {
    const key = JSON.stringify(params);
    const hit = cache.get(key);
    if (hit) return hit;
    let t: Trial;
    try {
      const assembly = buildAssembly(template, toReal(params), { floorHeightAt, embedment: options.embedment, ...walls });
      const collisions = checkCollisions(assembly, envelope, options.tolerance ?? 0);
      const { violations } = evaluateRules(assembly, ruleSet, { floorHeightAt });
      t = { assembly, collisions, violations, errors: violations.filter((v) => v.severity === "errore") };
    } catch (e) {
      // parametri incompatibili con la tipologia: tentativo non ammissibile
      t = { collisions: [], violations: [], errors: [], buildError: (e as Error).message };
    }
    cache.set(key, t);
    return t;
  };
  const collisionFree = (t: Trial) => !t.buildError && t.collisions.length === 0;
  const feasible = (t: Trial) => collisionFree(t) && t.errors.length === 0;
  const planFree = (t: Trial) => !t.buildError && !t.collisions.some((c) => c.obstacleId === ENVELOPE_ID && c.side && PLAN_SIDES.includes(c.side));

  const specs = new Map(template.params.map((p) => [dimName.get(p.name) ?? p.name, p]));
  const dims = FIT_DIMENSIONS.filter((d) => specs.get(d)?.kind === "number");
  const free = dims.filter((d) => locked[d] === undefined);
  const grids = new Map(free.map((d) => [d, grid(specs.get(d) as NumberParamSpec, step)]));
  const minimal: Record<string, ParamValue> = { ...locked };
  for (const d of free) minimal[d] = grids.get(d)!.spec.min;

  // ---- altezza (dimensione più interna): massimo nel box per bisezione, poi discesa a passi
  const height = free.includes("altezza") ? grids.get("altezza")! : undefined;
  const envelopeFree = (t: Trial) => !t.buildError && !t.collisions.some((c) => c.obstacleId === ENVELOPE_ID);
  /** Altezze più basse non possono rimediare: solo altezza libera insufficiente. */
  const onlyClearHeight = (t: Trial) =>
    collisionFree(t) && t.errors.length > 0 && t.errors.every((v) => v.kind === "min-clear-height");
  const heightMemo = new Map<string, number>();
  /**
   * Indice dell'altezza massima ammissibile per i parametri dati (−1 se
   * nessuna): bisezione sulle collisioni con il box (monotone), poi discesa a
   * passi oltre gli ostacoli (che possono lasciare finestre libere) e le regole.
   */
  const bestHeight = (base: Readonly<Record<string, ParamValue>>): number => {
    if (!height) return feasible(trial(base)) ? 0 : -1;
    const key = JSON.stringify(base);
    const memo = heightMemo.get(key);
    if (memo !== undefined) return memo;
    const at = (k: number) => trial({ ...base, altezza: height.valueAt(k) });
    let k = searchMax(height.top, (j) => envelopeFree(at(j)));
    while (k >= 0 && !feasible(at(k))) k = onlyClearHeight(at(k)) ? -1 : k - 1;
    heightMemo.set(key, k);
    return k;
  };

  // ---- dimensioni esterne (larghezza, poi profondità): dal massimo che sta in pianta, a scendere
  const outer = (["larghezza", "profondita"] as const).filter((d) => free.includes(d));
  const caps = new Map<FitDimension, number>();
  for (const d of outer) {
    const g = grids.get(d)!;
    caps.set(d, searchMax(g.top, (k) => planFree(trial({ ...minimal, [d]: g.valueAt(k) }))));
  }

  const noSolution = (d: FitDimension, limits: FitLimit[]): FitResult => {
    const hk = height ? searchMax(height.top, (k) => collisionFree(trial({ ...minimal, altezza: height.valueAt(k) }))) : -1;
    const probe = height ? trial({ ...minimal, altezza: height.valueAt(Math.max(0, hk)) }) : trial(minimal);
    const ruleIds = [...new Set(probe.errors.map((v) => v.ruleId))];
    const what = ruleIds.length
      ? `regola bloccante ${ruleIds.join(", ")}`
      : probe.collisions.length
        ? `collisioni con ${[...new Set(probe.collisions.map((c) => c.obstacleId))].join(", ")}`
        : (probe.buildError ?? "nessun valore ammissibile");
    return {
      ok: false,
      reason: "nessuna soluzione",
      message: `nessuna soluzione: nessuna ${LABEL[d]} ammissibile nell'ingombro (${what})`,
      param: d,
      violations: probe.errors,
      collisions: probe.collisions,
      limits,
    };
  };

  /** Esiste una soluzione con le dimensioni esterne date (dalla `i`-esima in poi libere)? */
  const solvable = (i: number, base: Readonly<Record<string, ParamValue>>): boolean => {
    if (i === outer.length) return bestHeight(base) >= 0;
    const d = outer[i];
    const g = grids.get(d)!;
    return solvable(i + 1, { ...base, [d]: g.valueAt(0) }) || searchMax(caps.get(d)!, (k) => solvable(i + 1, { ...base, [d]: g.valueAt(k) })) >= 0;
  };

  const params: Record<string, ParamValue> = { ...minimal };
  const limits: FitLimit[] = [];
  const outerCause = new Map<FitDimension, (finalParams: Record<string, ParamValue>) => FitCause>();
  for (let i = 0; i < outer.length; i++) {
    const d = outer[i];
    const g = grids.get(d)!;
    const cap = caps.get(d)!;
    const k = searchMax(cap, (j) => solvable(i + 1, { ...params, [d]: g.valueAt(j) }));
    if (k < 0) return noSolution(d, limits);
    params[d] = g.valueAt(k);
    outerCause.set(d, (fp) => {
      if (k === g.top) return { kind: "parametro", max: g.spec.max };
      if (k === cap) return causeOf(trial({ ...minimal, [d]: g.valueAt(k + 1) }));
      // valore successivo non risolvibile: causa all'altezza trovata, o alla minima
      const next = { ...fp, [d]: g.valueAt(k + 1) };
      const probe = trial(next);
      if (!feasible(probe)) return causeOf(probe);
      return causeOf(height ? trial({ ...next, altezza: height.spec.min }) : probe);
    });
  }
  const hk = bestHeight(params);
  if (hk < 0) return noSolution("altezza", limits);
  if (height) params.altezza = height.valueAt(hk);

  for (const d of dims) {
    const value = params[d] as number;
    let cause: FitCause;
    if (!free.includes(d)) cause = { kind: "bloccato" };
    else if (d === "altezza") cause = hk === height!.top ? { kind: "parametro", max: height!.spec.max } : causeOf(trial({ ...params, altezza: height!.valueAt(hk + 1) }));
    else cause = outerCause.get(d)!(params);
    limits.push({ param: d, value, cause, message: describeCause(d, value, cause) });
  }

  const final = trial(params);
  return { ok: true, params: final.assembly!.params, assembly: final.assembly!, limits, violations: final.violations };
}
