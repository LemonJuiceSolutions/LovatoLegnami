import { z } from "zod";
import { CurveSchema, MachiningSchema, PoseSchema, SectionSchema } from "@/domain/components/schemas";
import { PIECE_TYPES, type Curve, type Machining, type Pose, type PieceType, type Section } from "@/domain/components/types";
import { NeutralBrepSchema, type NeutralBrep } from "./neutral-brep";

/**
 * Protocollo tipizzato tra il thread UI (`client.ts`) e il worker del kernel
 * (`kernel.worker.ts`), D6. Ogni richiesta ha un `id` numerico crescente:
 * una nuova `build` invalida le precedenti e il worker scarta i risultati con
 * id superato. Gli schemi zod servono ai test e alla validazione ai confini.
 *
 * Client → worker: `init`, `build`, `cancel`, `export-step`.
 * Worker → client: `ready`, `progress`, `piece-result`, `done`, `step-result`, `error`.
 *
 * `export-step` non annulla né è annullato dalle `build`: usa i solidi in
 * cache (costruendo quelli mancanti) e risponde con `step-result` o `error`
 * di fase `export` con lo stesso `id`.
 */

/** Dati del pezzo che determinano il solido (la posa serve solo a viewer/export). */
export interface PieceGeometryInput {
  readonly id: string;
  readonly type: PieceType;
  readonly section: Section;
  readonly length: number;
  /** Asse curvo (E1, solo `arco`): il solido è costruito per rivoluzione. */
  readonly curve?: Curve;
  readonly machinings: readonly Machining[];
  readonly pose: Pose;
}

/** Mesh per il viewer, nel sistema locale del pezzo. */
export interface PieceMesh {
  /** xyz per vertice. */
  readonly positions: Float32Array;
  /** Normale per vertice (xyz). */
  readonly normals: Float32Array;
  /** Tre indici per triangolo, antiorari visti dall'esterno. */
  readonly indices: Uint32Array;
}

export interface BuildOptions {
  /** Tolleranza lineare di tessellazione (mm), default 0,5. */
  readonly tolerance?: number;
  /** Tolleranza angolare di tessellazione (radianti), default 0,3. */
  readonly angularTolerance?: number;
  /** Se `false` non estrae la B-rep neutra (solo mesh). Default `true`. */
  readonly brep?: boolean;
}

export interface InitRequest {
  readonly kind: "init";
  /** Base URL degli asset OCCT (default `/occt/<versione>/`). */
  readonly assetBase?: string;
}

export interface BuildRequest {
  readonly kind: "build";
  readonly id: number;
  readonly pieces: readonly PieceGeometryInput[];
  readonly options?: BuildOptions;
}

export interface Cancel {
  readonly kind: "cancel";
  readonly id: number;
}

/** Richiesta di export STEP dei pezzi (posizionati con la loro posa). */
export interface ExportStepRequest {
  readonly kind: "export-step";
  readonly id: number;
  readonly pieces: readonly PieceGeometryInput[];
  /** Opzioni della build da cui riusare i solidi in cache. */
  readonly options?: BuildOptions;
}

export type ClientMessage = InitRequest | BuildRequest | Cancel | ExportStepRequest;

export interface Ready {
  readonly kind: "ready";
}

export interface Progress {
  readonly kind: "progress";
  readonly id: number;
  /** Pezzi completati (con successo o errore). */
  readonly done: number;
  readonly total: number;
  /** Ultimo pezzo completato. */
  readonly pieceId?: string;
}

/** Errore di costruzione di un singolo pezzo (non blocca gli altri). */
export interface PieceError {
  readonly message: string;
  readonly machiningId?: string;
  readonly machiningType?: string;
}

/** Risultato per pezzo: solido in locale + posa verso l'assieme. */
export interface PieceResult {
  readonly pieceId: string;
  /** Chiave di cache (D6): pezzi con la stessa chiave condividono il solido. */
  readonly cacheKey: string;
  readonly pose: Pose;
  readonly mesh?: PieceMesh;
  readonly brep?: NeutralBrep;
  /** Volume del solido (mm³). */
  readonly volume?: number;
  readonly error?: PieceError;
}

export interface PieceResultMessage {
  readonly kind: "piece-result";
  readonly id: number;
  readonly result: PieceResult;
}

export interface BuildDone {
  readonly kind: "done";
  readonly id: number;
  readonly total: number;
  /** Solidi effettivamente costruiti (il resto viene dalla cache). */
  readonly built: number;
}

/** Pezzo escluso dall'export (solido non costruibile o posa non valida). */
export interface PieceExportError {
  readonly pieceId: string;
  readonly message: string;
}

/** File STEP prodotto dal worker. */
export interface StepResult {
  readonly kind: "step-result";
  readonly id: number;
  /** Contenuto del file `.step` (testo ISO-10303-21 in UTF-8). */
  readonly data: Uint8Array;
  /** Id dei pezzi scritti, nell'ordine della richiesta. */
  readonly written: readonly string[];
  readonly errors: readonly PieceExportError[];
}

/** Errore globale: inizializzazione del kernel (`id` null) o richiesta fallita. */
export interface BuildError {
  readonly kind: "error";
  readonly id: number | null;
  readonly phase: "init" | "build" | "export";
  readonly message: string;
}

export type WorkerMessage = Ready | Progress | PieceResultMessage | BuildDone | StepResult | BuildError;

// ---------------------------------------------------------------------------
// Schemi zod

const requestId = z.number().int().nonnegative();
const finite = z.number().finite();

export const PieceGeometryInputSchema: z.ZodType<PieceGeometryInput> = z.object({
  id: z.string().min(1),
  type: z.enum(PIECE_TYPES),
  section: SectionSchema,
  length: finite.positive(),
  curve: CurveSchema.optional(),
  machinings: z.array(MachiningSchema),
  pose: PoseSchema,
});

export const BuildOptionsSchema: z.ZodType<BuildOptions> = z
  .object({
    tolerance: finite.positive().optional(),
    angularTolerance: finite.positive().optional(),
    brep: z.boolean().optional(),
  })
  .strict();

export const InitRequestSchema: z.ZodType<InitRequest> = z.object({
  kind: z.literal("init"),
  assetBase: z.string().optional(),
});

export const BuildRequestSchema: z.ZodType<BuildRequest> = z.object({
  kind: z.literal("build"),
  id: requestId,
  pieces: z.array(PieceGeometryInputSchema),
  options: BuildOptionsSchema.optional(),
});

export const CancelSchema: z.ZodType<Cancel> = z.object({ kind: z.literal("cancel"), id: requestId });

export const ExportStepRequestSchema: z.ZodType<ExportStepRequest> = z.object({
  kind: z.literal("export-step"),
  id: requestId,
  pieces: z.array(PieceGeometryInputSchema).min(1),
  options: BuildOptionsSchema.optional(),
});

export const ClientMessageSchema = z.union([InitRequestSchema, BuildRequestSchema, CancelSchema, ExportStepRequestSchema]);

export const ProgressSchema: z.ZodType<Progress> = z
  .object({
    kind: z.literal("progress"),
    id: requestId,
    done: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    pieceId: z.string().optional(),
  })
  .refine((p) => p.done <= p.total, { message: "done non può superare total", path: ["done"] });

export const PieceMeshSchema: z.ZodType<PieceMesh> = z
  .object({
    positions: z.instanceof(Float32Array),
    normals: z.instanceof(Float32Array),
    indices: z.instanceof(Uint32Array),
  })
  .refine((m) => m.positions.length % 3 === 0 && m.normals.length === m.positions.length, {
    message: "positions e normals devono avere 3 componenti per vertice",
  })
  .refine((m) => m.indices.length % 3 === 0, { message: "indices deve contenere terne", path: ["indices"] });

export const PieceErrorSchema: z.ZodType<PieceError> = z.object({
  message: z.string().min(1),
  machiningId: z.string().optional(),
  machiningType: z.string().optional(),
});

export const PieceResultSchema: z.ZodType<PieceResult> = z
  .object({
    pieceId: z.string().min(1),
    cacheKey: z.string().min(1),
    pose: PoseSchema,
    mesh: PieceMeshSchema.optional(),
    brep: NeutralBrepSchema.optional(),
    volume: finite.optional(),
    error: PieceErrorSchema.optional(),
  })
  .refine((r) => r.error !== undefined || r.mesh !== undefined, {
    message: "un risultato senza errore deve avere la mesh",
    path: ["mesh"],
  });

export const PieceResultMessageSchema: z.ZodType<PieceResultMessage> = z.object({
  kind: z.literal("piece-result"),
  id: requestId,
  result: PieceResultSchema,
});

export const BuildDoneSchema: z.ZodType<BuildDone> = z.object({
  kind: z.literal("done"),
  id: requestId,
  total: z.number().int().nonnegative(),
  built: z.number().int().nonnegative(),
});

export const BuildErrorSchema: z.ZodType<BuildError> = z.object({
  kind: z.literal("error"),
  id: requestId.nullable(),
  phase: z.enum(["init", "build", "export"]),
  message: z.string().min(1),
});

export const PieceExportErrorSchema: z.ZodType<PieceExportError> = z.object({
  pieceId: z.string().min(1),
  message: z.string().min(1),
});

export const StepResultSchema: z.ZodType<StepResult> = z.object({
  kind: z.literal("step-result"),
  id: requestId,
  data: z.instanceof(Uint8Array),
  written: z.array(z.string().min(1)),
  errors: z.array(PieceExportErrorSchema),
});

export const ReadySchema: z.ZodType<Ready> = z.object({ kind: z.literal("ready") });

export const WorkerMessageSchema = z.union([
  ReadySchema,
  ProgressSchema,
  PieceResultMessageSchema,
  BuildDoneSchema,
  StepResultSchema,
  BuildErrorSchema,
]);

/** Oggetti trasferibili (buffer delle mesh o del file STEP) di un messaggio del worker, per `postMessage`. */
export function transferablesOf(msg: WorkerMessage): ArrayBuffer[] {
  if (msg.kind === "step-result") return msg.data.buffer instanceof ArrayBuffer ? [msg.data.buffer] : [];
  if (msg.kind !== "piece-result" || !msg.result.mesh) return [];
  const { positions, normals, indices } = msg.result.mesh;
  return [positions.buffer, normals.buffer, indices.buffer].filter(
    (b, i, all): b is ArrayBuffer => b instanceof ArrayBuffer && all.indexOf(b) === i,
  );
}
