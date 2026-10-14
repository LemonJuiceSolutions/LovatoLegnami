import { createIdGenerator } from "../assembly/ids";
import { type FloorHeightFn, flatFloor } from "../assembly/bounds";
import { expandJoints } from "../components/joints";
import { addMachining } from "../components/machinings";
import { createPiece, parseAssembly } from "../components/schemas";
import { parseSectionLabel, sectionLabel } from "../components/sections";
import {
  JOINT_TYPES,
  MACHINING_TYPES,
  isMachiningType,
  isPieceType,
  type Assembly,
  type Joint,
  type MachiningSpec,
  type ParamValue,
  type Piece,
  type PieceType,
  type Pose,
  type Section,
  type TenoneMortasaJoint,
} from "../components/types";

/* ------------------------------------------------------------------ */
/* Parametri                                                           */
/* ------------------------------------------------------------------ */

interface ParamSpecBase {
  /** Chiave del parametro (es. `larghezza`). */
  readonly name: string;
  /** Etichetta leggibile in italiano. */
  readonly label: string;
  readonly description?: string;
}

/** Parametro numerico con unità e limiti (inclusi). */
export interface NumberParamSpec extends ParamSpecBase {
  readonly kind: "number";
  /** Unità di misura mostrata all'utente: `mm`, `°` (gradi) o `n` (conteggio). */
  readonly unit: "mm" | "°" | "n";
  readonly min: number;
  readonly max: number;
  readonly default: number;
  /** Passo suggerito per la UI. */
  readonly step?: number;
  /** Se `true` sono ammessi solo interi. */
  readonly integer?: boolean;
}

/** Sezione di una famiglia di pezzi, come etichetta `"b×h"` (mm). */
export interface SectionParamSpec extends ParamSpecBase {
  readonly kind: "section";
  /** Tipo di pezzo a cui si applica la sezione. */
  readonly pieceType: PieceType;
  readonly default: string;
}

export interface BooleanParamSpec extends ParamSpecBase {
  readonly kind: "boolean";
  readonly default: boolean;
}

export type ParamSpec = NumberParamSpec | SectionParamSpec | BooleanParamSpec;

/** Parametri risolti (default applicati, sezioni in forma canonica). */
export type ResolvedParams = Readonly<Record<string, ParamValue>>;

/** Parametro non valido: indica parametro, valore e (se numerico) intervallo ammesso. */
export class ParamError extends Error {
  readonly param: string;
  readonly value: unknown;
  readonly min?: number;
  readonly max?: number;

  constructor(param: string, value: unknown, reason: string, range?: { min: number; max: number }) {
    super(`Parametro "${param}" = ${JSON.stringify(value)} non valido: ${reason}`);
    this.name = "ParamError";
    this.param = param;
    this.value = value;
    this.min = range?.min;
    this.max = range?.max;
  }
}

/** Errore nella definizione o nell'esecuzione di un template di tipologia. */
export class TemplateError extends Error {
  readonly slug: string;

  constructor(slug: string, reason: string) {
    super(`Tipologia "${slug}": ${reason}`);
    this.name = "TemplateError";
    this.slug = slug;
  }
}

const unitLabel = (s: NumberParamSpec): string => (s.unit === "n" ? "" : s.unit === "°" ? "°" : " mm");

function resolveOne(spec: ParamSpec, value: ParamValue | undefined): ParamValue {
  if (value === undefined) return spec.default;
  switch (spec.kind) {
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new ParamError(spec.name, value, "deve essere un numero");
      if (spec.integer && !Number.isInteger(value)) throw new ParamError(spec.name, value, "deve essere un intero");
      if (value < spec.min || value > spec.max)
        throw new ParamError(
          spec.name,
          value,
          `fuori dall'intervallo ammesso [${spec.min}, ${spec.max}]${unitLabel(spec)}`,
          { min: spec.min, max: spec.max },
        );
      return value;
    }
    case "section": {
      const s = typeof value === "string" ? parseSectionLabel(value) : undefined;
      if (!s) throw new ParamError(spec.name, value, 'sezione non valida (formato atteso "b×h" in mm)');
      return sectionLabel(s);
    }
    case "boolean":
      if (typeof value !== "boolean") throw new ParamError(spec.name, value, "deve essere vero o falso");
      return value;
  }
}

/**
 * Valida i parametri contro le `ParamSpec` della tipologia e applica i default.
 * Lancia `ParamError` per valori fuori limite, di tipo errato o sconosciuti.
 */
export function resolveParams(
  template: Pick<TypologyTemplate, "slug" | "params">,
  input: Readonly<Record<string, ParamValue | undefined>> = {},
): ResolvedParams {
  const known = new Set(template.params.map((p) => p.name));
  for (const key of Object.keys(input))
    if (!known.has(key) && input[key] !== undefined)
      throw new ParamError(key, input[key], `parametro sconosciuto per la tipologia ${template.slug}`);
  const out: Record<string, ParamValue> = {};
  for (const spec of template.params) out[spec.name] = resolveOne(spec, input[spec.name]);
  return out;
}

/** Parametri di default della tipologia. */
export const defaultParams = (template: Pick<TypologyTemplate, "slug" | "params">): ResolvedParams =>
  resolveParams(template, {});

/* ------------------------------------------------------------------ */
/* Contesto e step                                                     */
/* ------------------------------------------------------------------ */

/** Contesto passato a `build`: parametri risolti, accessori tipizzati e pavimento. */
export interface BuildContext {
  readonly slug: string;
  readonly params: ResolvedParams;
  /** Valore di un parametro numerico. */
  num(name: string): number;
  /** Sezione di un parametro `section`. */
  section(name: string): Section;
  /** Valore di un parametro booleano. */
  bool(name: string): boolean;
  /** Quota del pavimento in (x, y) (mm); piano a quota 0 se non fornita. */
  floorHeightAt: FloorHeightFn;
}

/** Valore costante o funzione pura del contesto. */
export type Resolvable<T> = T | ((ctx: BuildContext) => T);

/**
 * Posiziona un pezzo. `ref` è il nome locale al template usato da `joint` e
 * `machining`; l'id stabile `<FAM>-<nn>` è assegnato nell'ordine degli step.
 */
export interface PlaceStep {
  readonly kind: "place";
  readonly ref: string;
  readonly type: PieceType;
  readonly section: Resolvable<Section>;
  readonly length: Resolvable<number>;
  readonly pose: Resolvable<Pose>;
  readonly label?: string;
}

/** Ripete gli step prodotti da `each(i)` per i = 0..count−1. */
export interface RepeatStep {
  readonly kind: "repeat";
  readonly count: Resolvable<number>;
  readonly each: (i: number, ctx: BuildContext) => BuildStep | readonly BuildStep[];
}

/** Giunto tra due pezzi (per `ref`); espanso in lavorazioni alla fine della costruzione. */
export type JointStep = { readonly kind: "joint"; readonly a: string; readonly b: string } & (
  | { readonly type: "tenone-mortasa"; readonly params: TenoneMortasaJoint["params"] }
  | { readonly type: "mezzo-legno"; readonly params?: Readonly<Record<string, never>> }
);

/** Lavorazione su un pezzo già posizionato (per `ref`). */
export interface MachiningStep {
  readonly kind: "machining";
  readonly target: string;
  readonly spec: Resolvable<MachiningSpec>;
}

export type BuildStep = PlaceStep | RepeatStep | JointStep | MachiningStep;

/**
 * Template di tipologia (D2): parametri dichiarati e funzione pura che
 * produce gli step dichiarativi. Aggiungere una tipologia = scrivere uno di
 * questi oggetti e registrarlo.
 */
export interface TypologyTemplate {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly params: readonly ParamSpec[];
  build(ctx: BuildContext): readonly BuildStep[];
  /** Metadati opzionali dell'assieme (es. quota d'imposta). */
  meta?(ctx: BuildContext): Readonly<Record<string, ParamValue>>;
}

export interface BuildOptions {
  /** Quota del pavimento sotto ogni punto (usata dai template per i pilastri). */
  readonly floorHeightAt?: FloorHeightFn;
}

const resolve = <T>(v: Resolvable<T>, ctx: BuildContext): T =>
  typeof v === "function" ? (v as (c: BuildContext) => T)(ctx) : v;

function createContext(template: TypologyTemplate, params: ResolvedParams, options: BuildOptions): BuildContext {
  const specs = new Map(template.params.map((p) => [p.name, p]));
  const get = (name: string, kind: ParamSpec["kind"]): ParamValue => {
    const spec = specs.get(name);
    if (!spec) throw new TemplateError(template.slug, `parametro non dichiarato: ${name}`);
    if (spec.kind !== kind) throw new TemplateError(template.slug, `il parametro ${name} è di tipo ${spec.kind}, non ${kind}`);
    return params[name];
  };
  return {
    slug: template.slug,
    params,
    num: (name) => get(name, "number") as number,
    section: (name) => parseSectionLabel(get(name, "section") as string)!,
    bool: (name) => get(name, "boolean") as boolean,
    floorHeightAt: options.floorHeightAt ?? flatFloor,
  };
}

/** Step piatti (senza `repeat`), nell'ordine di esecuzione. */
export type FlatStep = Exclude<BuildStep, RepeatStep>;

/** Espande ricorsivamente i `repeat` del template. */
export function flattenSteps(steps: readonly BuildStep[], ctx: BuildContext, slug = ctx.slug): FlatStep[] {
  const out: FlatStep[] = [];
  const visit = (s: BuildStep) => {
    if (s.kind !== "repeat") {
      out.push(s);
      return;
    }
    const count = resolve(s.count, ctx);
    if (!Number.isInteger(count) || count < 0) throw new TemplateError(slug, `numero di ripetizioni non valido: ${count}`);
    for (let i = 0; i < count; i++) {
      const r = s.each(i, ctx);
      for (const x of Array.isArray(r) ? r : [r as BuildStep]) visit(x);
    }
  };
  steps.forEach(visit);
  return out;
}

/**
 * Verifica che gli step usino solo primitivi, lavorazioni e giunti del
 * catalogo. Restituisce l'elenco dei problemi (vuoto se tutto è a catalogo).
 */
export function catalogProblems(steps: readonly FlatStep[], ctx: BuildContext): string[] {
  const problems: string[] = [];
  for (const s of steps) {
    if (s.kind === "place" && !isPieceType(s.type))
      problems.push(`primitivo fuori catalogo: ${JSON.stringify(s.type)} (ref ${s.ref})`);
    if (s.kind === "joint" && !(JOINT_TYPES as readonly string[]).includes(s.type))
      problems.push(`giunto fuori catalogo: ${JSON.stringify(s.type)}`);
    if (s.kind === "machining") {
      const t = (resolve(s.spec, ctx) as { type?: unknown }).type;
      if (!isMachiningType(t))
        problems.push(`lavorazione fuori catalogo: ${JSON.stringify(t)} (ammesse: ${MACHINING_TYPES.join(", ")})`);
    }
  }
  return problems;
}

/**
 * Interprete dei template: valida i parametri (limiti e default), esegue gli
 * step in ordine assegnando gli id stabili per famiglia, applica le lavorazioni,
 * espande i giunti (id `G-<nn>` nell'ordine di dichiarazione) e valida
 * l'assieme risultante. Deterministico: stesso input → stesso output.
 */
export function buildAssembly(
  template: TypologyTemplate,
  input: Readonly<Record<string, ParamValue | undefined>> = {},
  options: BuildOptions = {},
): Assembly {
  const params = resolveParams(template, input);
  const ctx = createContext(template, params, options);
  const steps = flattenSteps(template.build(ctx), ctx, template.slug);
  const problems = catalogProblems(steps, ctx);
  if (problems.length) throw new TemplateError(template.slug, problems.join("; "));

  const ids = createIdGenerator();
  const byRef = new Map<string, string>();
  const pieces: Piece[] = [];
  const index = new Map<string, number>();
  const joints: Joint[] = [];
  const pieceOf = (ref: string, what: string): number => {
    const id = byRef.get(ref);
    if (id === undefined) throw new TemplateError(template.slug, `${what}: riferimento a pezzo non posizionato "${ref}"`);
    return index.get(id)!;
  };

  for (const s of steps) {
    switch (s.kind) {
      case "place": {
        if (byRef.has(s.ref)) throw new TemplateError(template.slug, `ref duplicato: "${s.ref}"`);
        const id = ids.nextPiece(s.type);
        const piece = createPiece({
          id,
          type: s.type,
          section: resolve(s.section, ctx),
          length: resolve(s.length, ctx),
          pose: resolve(s.pose, ctx),
          label: s.label,
        });
        byRef.set(s.ref, id);
        index.set(id, pieces.length);
        pieces.push(piece);
        break;
      }
      case "machining": {
        const i = pieceOf(s.target, "lavorazione");
        pieces[i] = addMachining(pieces[i], resolve(s.spec, ctx));
        break;
      }
      case "joint": {
        const a = pieces[pieceOf(s.a, "giunto")].id;
        const b = pieces[pieceOf(s.b, "giunto")].id;
        const id = ids.nextJoint();
        joints.push(
          s.type === "tenone-mortasa"
            ? { id, type: s.type, pieceA: a, pieceB: b, params: { ...s.params } }
            : { id, type: "mezzo-legno", pieceA: a, pieceB: b, params: {} },
        );
        break;
      }
    }
  }

  return parseAssembly({
    typologySlug: template.slug,
    params,
    pieces: expandJoints(joints, pieces),
    joints,
    meta: template.meta?.(ctx) ?? {},
  });
}
