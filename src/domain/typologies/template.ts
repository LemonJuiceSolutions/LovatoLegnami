import { createIdGenerator } from "../assembly/ids";
import { type FloorHeightFn, flatFloor } from "../assembly/bounds";
import { expandJoints } from "../components/joints";
import { addMachining } from "../components/machinings";
import { createPiece, parseAssembly } from "../components/schemas";
import { findHardware, hasHardware } from "../hardware/catalog";
import { HardwareError } from "../hardware/errors";
import { countItem, expandBolt, expandBracket, expandJointNode, isCountedKind, type HardwareExpansion } from "../hardware/expand";
import { mergeHardware } from "../hardware/list";
import type { HardwareAnchor } from "../hardware/types";
import type { Vec3 } from "../math/vec3";
import { parseSectionLabel, sectionLabel } from "../components/sections";
import {
  JOINT_TYPES,
  MACHINING_TYPES,
  isMachiningType,
  isPieceType,
  type Assembly,
  type DardoDiGioveJoint,
  type HardwareItem,
  type Joint,
  type LateralFace,
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
  /**
   * Visibilità condizionata (E4): `false` → la UI nasconde il campo. Il
   * parametro è comunque risolto al proprio valore o default (mai "assente").
   */
  readonly visibleWhen?: (params: ResolvedParams) => boolean;
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

/** Opzione nominata di un parametro a scelta. */
export interface EnumOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

/** Parametro a scelta tra opzioni nominate (valori stringa); il default è tra le opzioni. */
export interface EnumParamSpec extends ParamSpecBase {
  readonly kind: "enum";
  readonly options: readonly EnumOption[];
  readonly default: string;
}

export type ParamSpec = NumberParamSpec | SectionParamSpec | BooleanParamSpec | EnumParamSpec;

/** `true` se il parametro va mostrato con i parametri dati (sempre, senza `visibleWhen`). */
export function isParamVisible(spec: ParamSpec, params: ResolvedParams): boolean {
  if (!spec.visibleWhen) return true;
  try {
    return spec.visibleWhen(params);
  } catch {
    return true;
  }
}

/** Categorie di catalogo delle tipologie (spec "Metadati di catalogo delle tipologie"). */
export const TYPOLOGY_CATEGORIES = ["addossata", "autoportante", "carport", "gazebo", "pensilina"] as const;
export type TypologyCategory = (typeof TYPOLOGY_CATEGORIES)[number];

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
    case "enum":
      if (typeof value !== "string" || !spec.options.some((o) => o.value === value))
        throw new ParamError(spec.name, value, `valore non ammesso (ammessi: ${spec.options.map((o) => o.value).join(", ")})`);
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
  /** Valore (stringa) di un parametro a scelta. */
  enum(name: string): string;
  /** Quota del pavimento in (x, y) (mm); piano a quota 0 se non fornita. */
  floorHeightAt: FloorHeightFn;
  /** Affondamento dei pilastri sotto la quota del pavimento (mm, ≥ 0; default 0). */
  embedment: number;
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
  | { readonly type: "dardo-di-giove"; readonly params: DardoDiGioveJoint["params"] }
);

/**
 * Lavorazione su un pezzo già posizionato (per `ref`): `spec` costante o dal
 * contesto, oppure `fromPiece` calcolata dal pezzo posizionato (posa,
 * lunghezza, lavorazioni già applicate), es. un taglio di testa su un piano.
 */
export type MachiningStep = { readonly kind: "machining"; readonly target: string } & (
  | { readonly spec: Resolvable<MachiningSpec>; readonly fromPiece?: never }
  | { readonly fromPiece: (piece: Piece, ctx: BuildContext) => MachiningSpec; readonly spec?: never }
);

/** Codice dello step `hardware` per il bullone passante su più strati (lunghezza scelta dal catalogo). */
export const BOLT_STEP_CODE = "bullone-passante";
/** Codice dello step `hardware` per un nodo metallico con voce scelta automaticamente (vie, sezione, angolo). */
export const AUTO_JOINT_CODE = "giunto-vie";

/**
 * Parametri dello step `hardware`, secondo il codice:
 * - `bullone-passante`: `face`, `at`, `offset` sul primo pezzo e `diameter`;
 * - staffe/supporti/piastre: `at` (solo con `anchor: "faccia"`);
 * - giunti a N vie e cuspidi (o `giunto-vie` per la scelta automatica):
 *   `point` (centro del nodo) e `line` (`joint` | `zincato`);
 * - viti/tasselli: `count` (quantità conteggiata sui pezzi).
 */
export interface HardwareStepParams {
  readonly face?: LateralFace;
  readonly at?: number;
  readonly offset?: number;
  readonly diameter?: number;
  readonly point?: Vec3;
  readonly line?: "joint" | "zincato";
  readonly count?: number;
}

/**
 * Ferramenta (E4): eseguita in ordine come `machining`; le lavorazioni indotte
 * vanno subito sui pezzi (`jointId` = id della voce), le voci si accumulano e
 * sono fuse (`mergeHardware`) in `assembly.hardware`. `pieces` = ref dei pezzi
 * collegati (per il bullone: nell'ordine di attraversamento).
 */
export interface HardwareStep {
  readonly kind: "hardware";
  /** Codice di catalogo, `bullone-passante` o `giunto-vie`. */
  readonly code: string;
  readonly pieces: readonly string[];
  readonly anchor?: HardwareAnchor;
  readonly params?: Resolvable<HardwareStepParams>;
}

export type BuildStep = PlaceStep | RepeatStep | JointStep | MachiningStep | HardwareStep;

/**
 * Template di tipologia (D2): parametri dichiarati e funzione pura che
 * produce gli step dichiarativi. Aggiungere una tipologia = scrivere uno di
 * questi oggetti e registrarlo.
 */
export interface TypologyTemplate {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  /** Categoria di catalogo (selettore delle tipologie). */
  readonly category: TypologyCategory;
  /** Tag di ricerca. */
  readonly tags: readonly string[];
  /** Riferimento alla scheda della ricerca commerciale (es. `"T-A/T-C/T-G"`). */
  readonly reference?: string;
  readonly params: readonly ParamSpec[];
  build(ctx: BuildContext): readonly BuildStep[];
  /** Metadati opzionali dell'assieme (es. quota d'imposta). */
  meta?(ctx: BuildContext): Readonly<Record<string, ParamValue>>;
}

export interface BuildOptions {
  /** Quota del pavimento sotto ogni punto (usata dai template per i pilastri). */
  readonly floorHeightAt?: FloorHeightFn;
  /**
   * Interramento/affondamento dei pilastri sotto il pavimento (mm, default 0):
   * si somma alla lunghezza di ogni pilastro e ne abbassa il piede.
   */
  readonly embedment?: number;
}

const resolve = <T>(v: Resolvable<T>, ctx: BuildContext): T =>
  typeof v === "function" ? (v as (c: BuildContext) => T)(ctx) : v;

function createContext(template: TypologyTemplate, params: ResolvedParams, options: BuildOptions): BuildContext {
  const embedment = options.embedment ?? 0;
  if (!Number.isFinite(embedment) || embedment < 0) throw new ParamError("affondamento", embedment, "deve essere un numero ≥ 0 (mm)");
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
    enum: (name) => get(name, "enum") as string,
    floorHeightAt: options.floorHeightAt ?? flatFloor,
    embedment,
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
    if (s.kind === "hardware" && s.code !== BOLT_STEP_CODE && s.code !== AUTO_JOINT_CODE && !hasHardware(s.code))
      problems.push(`ferramenta fuori catalogo: ${JSON.stringify(s.code)}`);
    if (s.kind === "machining" && s.spec !== undefined) {
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
  const hardware: HardwareItem[] = [];
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
        pieces[i] = addMachining(pieces[i], s.fromPiece ? s.fromPiece(pieces[i], ctx) : resolve(s.spec, ctx));
        break;
      }
      case "hardware": {
        const refs = s.pieces.map((r) => pieces[pieceOf(r, `ferramenta ${s.code}`)].id);
        const exp = expandHardwareStep(template.slug, s, resolve(s.params ?? {}, ctx), refs, pieces, ids);
        exp.pieces.forEach((p, i) => (pieces[i] = p));
        hardware.push(exp.item, ...exp.extras);
        break;
      }
      case "joint": {
        const a = pieces[pieceOf(s.a, "giunto")].id;
        const b = pieces[pieceOf(s.b, "giunto")].id;
        const id = ids.nextJoint();
        joints.push(
          s.type === "mezzo-legno"
            ? { id, type: "mezzo-legno", pieceA: a, pieceB: b, params: {} }
            : s.type === "tenone-mortasa"
              ? { id, type: s.type, pieceA: a, pieceB: b, params: { ...s.params } }
              : { id, type: s.type, pieceA: a, pieceB: b, params: { ...s.params } },
        );
        break;
      }
    }
  }

  return parseAssembly(
    withoutNegativeZero({
      typologySlug: template.slug,
      params,
      pieces: expandJoints(joints, pieces),
      joints,
      hardware: mergeHardware(hardware),
      meta: template.meta?.(ctx) ?? {},
    }),
  );
}

/** Espande uno step `hardware` già risolto (id dei pezzi) con le funzioni di `domain/hardware`. */
function expandHardwareStep(
  slug: string,
  s: HardwareStep,
  params: HardwareStepParams,
  pieceIds: readonly string[],
  pieces: readonly Piece[],
  ids: ReturnType<typeof createIdGenerator>,
): HardwareExpansion {
  const fail = (reason: string): never => {
    throw new TemplateError(slug, `ferramenta ${s.code} su ${pieceIds.join(", ") || "nessun pezzo"}: ${reason}`);
  };
  try {
    if (s.code === BOLT_STEP_CODE) {
      const { face, at, offset = 0, diameter } = params;
      if (!face || at === undefined || diameter === undefined) return fail("servono face, at e diameter");
      return expandBolt({ id: ids.nextHardware("bullone"), pieces: pieceIds, face, at, offset, diameter }, pieces);
    }
    if (s.code === AUTO_JOINT_CODE) {
      if (!params.point) return fail("serve il centro del nodo (point)");
      return expandJointNode({ id: ids.nextHardware("giunto-vie"), point: params.point, pieces: pieceIds, line: params.line }, pieces, ids);
    }
    const spec = findHardware(s.code);
    if (spec.kind === "giunto-vie" || spec.kind === "cuspide") {
      if (!params.point) return fail("serve il centro del nodo (point)");
      return expandJointNode({ id: ids.nextHardware(spec.kind), point: params.point, pieces: pieceIds, code: s.code, line: params.line }, pieces, ids);
    }
    if (isCountedKind(spec.kind)) {
      const count = params.count ?? 1;
      if (!Number.isInteger(count) || count < 1) return fail(`quantità non valida: ${count}`);
      return { pieces: [...pieces], item: countItem(s.code, count, pieceIds), extras: [] };
    }
    if (spec.kind === "bullone") return fail(`usare lo step "${BOLT_STEP_CODE}" (la lunghezza è scelta dallo spessore serrato)`);
    // staffe e supporti: lavorazioni sul primo pezzo, gli altri (es. seconda tavola della sandwich) solo collegati
    if (pieceIds.length < 1) return fail("staffe e supporti richiedono almeno un pezzo");
    const index = pieces.findIndex((p) => p.id === pieceIds[0]);
    const exp = expandBracket({ id: ids.nextHardware(spec.kind), code: s.code, piece: pieceIds[0], anchor: s.anchor, at: params.at }, pieces[index]);
    const out = [...pieces];
    out[index] = exp.piece;
    return { pieces: out, item: { ...exp.item, pieceIds: [...pieceIds] }, extras: exp.extras };
  } catch (e) {
    if (e instanceof HardwareError) return fail(e.message);
    throw e;
  }
}

/** Sostituisce `-0` con `0` ovunque: l'assieme sopravvive identico al round-trip JSON. */
function withoutNegativeZero<T>(value: T): T {
  if (typeof value === "number") return (value === 0 ? 0 : value) as T;
  if (Array.isArray(value)) return value.map(withoutNegativeZero) as T;
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutNegativeZero(v)])) as T;
  return value;
}
