import { z } from "zod";
import { parseWith, SectionSchema } from "../components/schemas";
import { HARDWARE_KINDS, type HardwareKind, type Section } from "../components/types";

/**
 * Ferramenta strutturale come dati (E3). `HardwareKind`, `HardwareItem` e il
 * loro schema sono definiti in `components` (servono allo schema
 * dell'assieme) e riesportati qui.
 */
export { HARDWARE_KINDS, type HardwareItem, type HardwareKind } from "../components/types";
export { HardwareItemSchema, HardwareKindSchema, parseHardwareItem } from "../components/schemas";

/**
 * Punto d'attacco della ferramenta sul pezzo di legno:
 * - `piede`: testa iniziale del pezzo (X = 0), es. piede del pilastro;
 * - `testa`: testa finale del pezzo (X = lunghezza), es. testa della mensola;
 * - `faccia`: punto `at` dell'asse del pezzo, sulla faccia indicata dallo step.
 */
export const HARDWARE_ANCHORS = ["piede", "testa", "faccia"] as const;
export type HardwareAnchor = (typeof HARDWARE_ANCHORS)[number];

/**
 * Elemento dello schema di foratura, in coordinate della ferramenta: `along`
 * è la distanza dal punto d'attacco verso l'interno del pezzo (lungo il suo
 * asse), gli assi trasversali coincidono con Y/Z locali del pezzo.
 * - `asola`: fresata dalla testa (lavorazione `asola-lama`), `width` lungo Y,
 *   `height` lungo Z, `depth` lungo l'asse, `offset` lungo Z;
 * - `foro`: foro con asse lungo `axis` (`y` = dalla faccia `sinistra`, `z` =
 *   dalla faccia `superiore`), centro a `along` dall'attacco e `offset`
 *   trasversale sulla faccia; `depth` assente = passante.
 */
export type HoleFeature =
  | {
      readonly kind: "asola";
      readonly width: number;
      readonly height: number;
      readonly depth: number;
      readonly offset?: number;
    }
  | {
      readonly kind: "foro";
      readonly axis: "y" | "z";
      readonly along: number;
      readonly offset: number;
      readonly diameter: number;
      readonly depth?: number;
    };

/** Fori e asole che la ferramenta richiede nel legno, riferiti al punto d'attacco. */
export interface HolePattern {
  readonly anchor: HardwareAnchor;
  readonly features: readonly HoleFeature[];
}

/** Ingombro della ferramenta (mm) nel suo sistema: x lungo l'asse del pezzo. */
export interface HardwareDims {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Viti (o tasselli) conteggiate per ogni pezzo di ferramenta. */
export interface ScrewCount {
  readonly code: string;
  readonly count: number;
}

/**
 * Giunto metallico a N vie: `layout` delle vie, ingombro del nodo `node`
 * (lato del manicotto misurato da asse ad asse, valore `A` del catalogo) e
 * profondità d'inserimento `insertion` dell'asta nel manicotto. Lunghezza
 * netta di un'asta = interasse − 2·(node/2 − insertion).
 */
export interface JointNodeSpec {
  readonly ways: 2 | 3 | 4 | 5;
  readonly layout: "2" | "3L" | "3A" | "4" | "5";
  readonly node: number;
  readonly insertion: number;
}

/** Voce di catalogo della ferramenta. Tutti i valori sono DA VALIDARE CON UFFICIO TECNICO. */
export interface HardwareSpec {
  readonly code: string;
  readonly kind: HardwareKind;
  readonly name: string;
  /** Sezioni di legno compatibili (assente = qualsiasi). */
  readonly forSections?: readonly Section[];
  readonly dims: HardwareDims;
  /** Fori/asole da praticare nel legno (assente = nessuna lavorazione, es. bicchiere). */
  readonly holes?: HolePattern;
  /** Bulloni e viti: diametro nominale e lunghezza (mm). */
  readonly diameter?: number;
  readonly length?: number;
  /** Giunti metallici: vie, ingombro del nodo e inserimento. */
  readonly joint?: JointNodeSpec;
  /** Angolo imposto (gradi): giunti 75°/105°, staffe inclinate 15°/17°/25°, cuspidi. */
  readonly angle?: number;
  /** Numero di falde servite (cuspidi). */
  readonly slopes?: number;
  /** Viti/tasselli conteggiati per ogni pezzo. */
  readonly screws?: readonly ScrewCount[];
  /** Ferramenta associata (es. piastre di una cuspide) con quantità per pezzo. */
  readonly accessories?: readonly ScrewCount[];
  /** Fonte commerciale (sezione di `ricerca-chepergola.md`), con `[dedotto]` se ricavata. */
  readonly source: string;
  /** Marcatura di validazione: sempre `"DA VALIDARE CON UFFICIO TECNICO"` finché non rivista. */
  readonly validation: string;
}

const finite = () => z.number({ invalid_type_error: "deve essere un numero" }).finite("deve essere finito");
const positive = () => finite().positive("deve essere maggiore di 0");

export const HoleFeatureSchema: z.ZodType<HoleFeature> = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("asola"), width: positive(), height: positive(), depth: positive(), offset: finite().optional() })
    .strict(),
  z
    .object({
      kind: z.literal("foro"),
      axis: z.enum(["y", "z"]),
      along: finite(),
      offset: finite(),
      diameter: positive(),
      depth: positive().optional(),
    })
    .strict(),
]);

export const HolePatternSchema: z.ZodType<HolePattern> = z
  .object({ anchor: z.enum(HARDWARE_ANCHORS), features: z.array(HoleFeatureSchema) })
  .strict();

const count = z.object({ code: z.string().min(1), count: finite().int().positive() }).strict();

export const HardwareSpecSchema: z.ZodType<HardwareSpec> = z
  .object({
    code: z.string().regex(/^[a-z0-9-]+$/, "codice: solo minuscole, cifre e trattini"),
    kind: z.enum(HARDWARE_KINDS, {
      errorMap: (issue, ctx) =>
        issue.code === "invalid_enum_value"
          ? { message: `tipo di ferramenta non supportato: ${JSON.stringify(ctx.data)} (ammessi: ${HARDWARE_KINDS.join(", ")})` }
          : { message: ctx.defaultError },
    }),
    name: z.string().min(1),
    forSections: z.array(SectionSchema).optional(),
    dims: z.object({ x: positive(), y: positive(), z: positive() }).strict(),
    holes: HolePatternSchema.optional(),
    diameter: positive().optional(),
    length: positive().optional(),
    joint: z
      .object({
        ways: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
        layout: z.enum(["2", "3L", "3A", "4", "5"]),
        node: positive(),
        insertion: positive(),
      })
      .strict()
      .optional(),
    angle: positive().optional(),
    slopes: finite().int().positive().optional(),
    screws: z.array(count).optional(),
    accessories: z.array(count).optional(),
    source: z.string().min(1, "fonte obbligatoria"),
    validation: z.string().min(1),
  })
  .strict();

export const parseHardwareSpec = (data: unknown): HardwareSpec => parseWith(HardwareSpecSchema, data, "Voce di catalogo ferramenta non valida");
