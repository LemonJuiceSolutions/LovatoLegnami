import { z } from "zod";
import { ValidationError, issuesFromZod } from "./errors";
import {
  FACES,
  FAMILY_OF,
  JOINT_TYPES,
  MACHINING_TYPES,
  PIECE_FAMILIES,
  PIECE_TYPES,
  type Joint,
  type Machining,
  type MachiningSpec,
  type Piece,
  type PieceType,
  type Pose,
  type Section,
} from "./types";

const finite = () => z.number({ invalid_type_error: "deve essere un numero" }).finite("deve essere finito");
const positive = () => finite().positive("deve essere maggiore di 0");
const nonNegative = () => finite().nonnegative("deve essere maggiore o uguale a 0");

/** Enum con messaggio che riporta il valore non supportato. */
function enumWithValue<T extends readonly [string, ...string[]]>(values: T, what: string) {
  return z.enum(values, {
    errorMap: (issue, ctx) =>
      issue.code === "invalid_enum_value"
        ? { message: `${what} non supportato: ${JSON.stringify(ctx.data)} (ammessi: ${values.join(", ")})` }
        : { message: ctx.defaultError },
  });
}

export const PieceTypeSchema = enumWithValue(PIECE_TYPES as unknown as [PieceType, ...PieceType[]], "tipo di componente");
export const PieceFamilySchema = enumWithValue(PIECE_FAMILIES, "famiglia");
export const FaceSchema = enumWithValue(FACES, "faccia");

export const SectionSchema: z.ZodType<Section> = z.object({ b: positive(), h: positive() }).strict();

export const PoseSchema: z.ZodType<Pose> = z.array(finite()).length(16, "la posa deve avere 16 valori");

const lateralFace = enumWithValue(["superiore", "inferiore", "sinistra", "destra"] as const, "faccia");
const headFace = enumWithValue(["testa-inizio", "testa-fine"] as const, "faccia di testa");

const base = {
  at: nonNegative(),
  jointId: z.string().min(1).optional(),
};

const specShapes = {
  "mezzo-legno": { type: z.literal("mezzo-legno"), face: lateralFace, width: positive(), depth: positive() },
  tenone: { type: z.literal("tenone"), face: headFace, width: positive(), height: positive(), length: positive() },
  mortasa: {
    type: z.literal("mortasa"),
    face: lateralFace,
    width: positive(),
    height: positive(),
    depth: positive(),
    offset: finite(),
    angle: finite(),
  },
  "becco-uccello": {
    type: z.literal("becco-uccello"),
    face: lateralFace,
    depth: positive(),
    angle: positive(),
  },
  foro: {
    type: z.literal("foro"),
    face: lateralFace,
    diameter: positive(),
    offset: finite(),
    depth: positive().optional(),
  },
  "taglio-testa": { type: z.literal("taglio-testa"), face: headFace, angle: finite(), angle2: finite().optional() },
} as const;

const machiningTypeErrorMap: z.ZodErrorMap = (issue, ctx) =>
  issue.code === "invalid_union_discriminator"
    ? {
        message: `tipo di lavorazione non supportato: ${JSON.stringify((ctx.data as { type?: unknown })?.type)} (ammessi: ${MACHINING_TYPES.join(", ")})`,
      }
    : { message: ctx.defaultError };

/** Lavorazione richiesta (senza id/pieceId). */
export const MachiningSpecSchema = z.discriminatedUnion(
  "type",
  [
    z.object({ ...base, ...specShapes["mezzo-legno"] }).strict(),
    z.object({ ...base, ...specShapes.tenone }).strict(),
    z.object({ ...base, ...specShapes.mortasa }).strict(),
    z.object({ ...base, ...specShapes["becco-uccello"] }).strict(),
    z.object({ ...base, ...specShapes.foro }).strict(),
    z.object({ ...base, ...specShapes["taglio-testa"] }).strict(),
  ],
  { errorMap: machiningTypeErrorMap },
) as unknown as z.ZodType<MachiningSpec>;

const idFields = { id: z.string().min(1, "id obbligatorio"), pieceId: z.string().min(1, "pieceId obbligatorio") };

export const MachiningSchema = z.discriminatedUnion(
  "type",
  [
    z.object({ ...idFields, ...base, ...specShapes["mezzo-legno"] }).strict(),
    z.object({ ...idFields, ...base, ...specShapes.tenone }).strict(),
    z.object({ ...idFields, ...base, ...specShapes.mortasa }).strict(),
    z.object({ ...idFields, ...base, ...specShapes["becco-uccello"] }).strict(),
    z.object({ ...idFields, ...base, ...specShapes.foro }).strict(),
    z.object({ ...idFields, ...base, ...specShapes["taglio-testa"] }).strict(),
  ],
  { errorMap: machiningTypeErrorMap },
) as unknown as z.ZodType<Machining>;

export const PieceSchema: z.ZodType<Piece> = z
  .object({
    id: z.string().min(1, "id obbligatorio"),
    type: PieceTypeSchema,
    family: PieceFamilySchema,
    section: SectionSchema,
    length: positive(),
    pose: PoseSchema,
    label: z.string(),
    machinings: z.array(MachiningSchema),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (FAMILY_OF[p.type] !== p.family)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["family"],
        message: `famiglia ${p.family} incoerente con il tipo ${p.type} (attesa ${FAMILY_OF[p.type]})`,
      });
    p.machinings.forEach((m, i) => {
      if (m.pieceId !== p.id)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["machinings", i, "pieceId"],
          message: `la lavorazione ${m.id} riferisce il pezzo ${m.pieceId} invece di ${p.id}`,
        });
    });
  });

const jointBase = {
  id: z.string().min(1, "id obbligatorio"),
  pieceA: z.string().min(1, "pieceA obbligatorio"),
  pieceB: z.string().min(1, "pieceB obbligatorio"),
};

export const JointSchema = z.discriminatedUnion(
  "type",
  [
    z
      .object({
        ...jointBase,
        type: z.literal("tenone-mortasa"),
        params: z
          .object({ width: positive(), height: positive(), length: positive(), gap: nonNegative() })
          .strict(),
      })
      .strict(),
    z.object({ ...jointBase, type: z.literal("mezzo-legno"), params: z.object({}).strict() }).strict(),
  ],
  {
    errorMap: (issue, ctx) =>
      issue.code === "invalid_union_discriminator"
        ? {
            message: `tipo di giunto non supportato: ${JSON.stringify((ctx.data as { type?: unknown })?.type)} (ammessi: ${JOINT_TYPES.join(", ")})`,
          }
        : { message: ctx.defaultError },
  },
) as unknown as z.ZodType<Joint>;

/** Valida con lo schema e lancia `ValidationError` con i percorsi dei campi. */
export function parseWith<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new ValidationError(context, issuesFromZod(r.error));
  return r.data;
}

export const parsePiece = (data: unknown): Piece => parseWith(PieceSchema, data, "Pezzo non valido");
export const parseJoint = (data: unknown): Joint => parseWith(JointSchema, data, "Giunto non valido");

export interface PieceInput {
  readonly id: string;
  readonly type: PieceType | string;
  readonly section: Section;
  readonly length: number;
  readonly pose: Pose;
  readonly label?: string;
  readonly machinings?: readonly Machining[];
}

/** Crea e valida un pezzo; la famiglia è derivata dal tipo, l'etichetta di default è l'id. */
export function createPiece(input: PieceInput): Piece {
  const type = input.type as PieceType;
  return parsePiece({
    id: input.id,
    type: input.type,
    family: FAMILY_OF[type] ?? "PIL",
    section: input.section,
    length: input.length,
    pose: input.pose,
    label: input.label ?? input.id,
    machinings: input.machinings ?? [],
  });
}
