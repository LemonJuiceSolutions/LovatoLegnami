import { describe, expect, it } from "vitest";
import { identity } from "@/domain/math/mat4";
import { pieceBoxBrep } from "./neutral-brep-box";
import {
  BuildRequestSchema,
  CancelSchema,
  ClientMessageSchema,
  ExportStepRequestSchema,
  StepResultSchema,
  PieceResultMessageSchema,
  ProgressSchema,
  WorkerMessageSchema,
  transferablesOf,
  type BuildRequest,
  type WorkerMessage,
} from "./protocol";

const piece = {
  id: "PIL-01",
  type: "pilastro" as const,
  section: { b: 120, h: 120 },
  length: 2400,
  pose: identity(),
  machinings: [
    { id: "PIL-01-L01", pieceId: "PIL-01", type: "foro" as const, at: 1200, face: "sinistra" as const, diameter: 12, offset: 0 },
  ],
};

const mesh = () => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2]),
});

describe("protocollo kernel", () => {
  it("conserva l'asse curvo dei pezzi ad arco (E6) e rifiuta curve non valide", () => {
    const arc = { ...piece, id: "ARC-01", type: "arco" as const, machinings: [], curve: { radius: 2400, sweep: 93 } };
    const req: BuildRequest = { kind: "build", id: 2, pieces: [arc] };
    const parsed = BuildRequestSchema.parse(req);
    expect(parsed.pieces[0].curve).toEqual({ radius: 2400, sweep: 93 });
    expect(BuildRequestSchema.safeParse({ ...req, pieces: [{ ...arc, curve: { radius: 2400, sweep: 400 } }] }).success).toBe(false);
  });

  it("accetta una BuildRequest valida", () => {
    const req: BuildRequest = { kind: "build", id: 1, pieces: [piece], options: { tolerance: 0.5 } };
    expect(BuildRequestSchema.safeParse(req).success).toBe(true);
    expect(ClientMessageSchema.safeParse(req).success).toBe(true);
  });

  it("rifiuta BuildRequest con pezzo non valido o opzioni sconosciute", () => {
    const bad = { kind: "build", id: 1, pieces: [{ ...piece, length: -5 }] };
    const r = BuildRequestSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["pieces", 0, "length"]);
    expect(BuildRequestSchema.safeParse({ kind: "build", id: 1, pieces: [], options: { foo: 1 } }).success).toBe(false);
    expect(BuildRequestSchema.safeParse({ kind: "build", id: -1, pieces: [] }).success).toBe(false);
    const badMachining = { ...piece, machinings: [{ ...piece.machinings[0], type: "fresatura" }] };
    expect(BuildRequestSchema.safeParse({ kind: "build", id: 2, pieces: [badMachining] }).success).toBe(false);
  });

  it("valida Cancel e Progress", () => {
    expect(CancelSchema.safeParse({ kind: "cancel", id: 3 }).success).toBe(true);
    expect(CancelSchema.safeParse({ kind: "cancel" }).success).toBe(false);
    expect(ProgressSchema.safeParse({ kind: "progress", id: 1, done: 2, total: 20, pieceId: "TVT-01" }).success).toBe(true);
    expect(ProgressSchema.safeParse({ kind: "progress", id: 1, done: 21, total: 20 }).success).toBe(false);
  });

  it("valida PieceResult con mesh e B-rep, e con errore per pezzo", () => {
    const ok = {
      kind: "piece-result",
      id: 1,
      result: { pieceId: "PIL-01", cacheKey: "abc", pose: identity(), mesh: mesh(), brep: pieceBoxBrep({ b: 120, h: 120 }, 2400) },
    };
    expect(PieceResultMessageSchema.safeParse(ok).success).toBe(true);
    const failed = {
      kind: "piece-result",
      id: 1,
      result: { pieceId: "PIL-02", cacheKey: "def", pose: identity(), error: { message: "lavorazione senza procedura", machiningType: "x" } },
    };
    expect(WorkerMessageSchema.safeParse(failed).success).toBe(true);
    const empty = { kind: "piece-result", id: 1, result: { pieceId: "PIL-03", cacheKey: "g", pose: identity() } };
    expect(WorkerMessageSchema.safeParse(empty).success).toBe(false);
    const wrongArray = { ...ok, result: { ...ok.result, mesh: { ...mesh(), indices: [0, 1, 2] } } };
    expect(PieceResultMessageSchema.safeParse(wrongArray).success).toBe(false);
  });

  it("valida BuildError di inizializzazione e rifiuta kind sconosciuti", () => {
    expect(WorkerMessageSchema.safeParse({ kind: "error", id: null, phase: "init", message: "WASM non caricato" }).success).toBe(true);
    expect(WorkerMessageSchema.safeParse({ kind: "error", id: null, phase: "boh", message: "x" }).success).toBe(false);
    expect(WorkerMessageSchema.safeParse({ kind: "risultato", id: 1 }).success).toBe(false);
  });

  it("elenca i buffer trasferibili della mesh", () => {
    const msg: WorkerMessage = { kind: "piece-result", id: 1, result: { pieceId: "A", cacheKey: "k", pose: identity(), mesh: mesh() } };
    expect(transferablesOf(msg)).toHaveLength(3);
    expect(transferablesOf({ kind: "ready" })).toEqual([]);
  });

  it("valida ExportStepRequest e StepResult; il buffer STEP è trasferibile", () => {
    const req = { kind: "export-step", id: 4, pieces: [piece], options: { tolerance: 0.5 } };
    expect(ExportStepRequestSchema.safeParse(req).success).toBe(true);
    expect(ClientMessageSchema.safeParse(req).success).toBe(true);
    expect(ExportStepRequestSchema.safeParse({ ...req, pieces: [] }).success).toBe(false);
    const res: WorkerMessage = {
      kind: "step-result",
      id: 4,
      data: new TextEncoder().encode("ISO-10303-21;"),
      written: ["PIL-01"],
      errors: [{ pieceId: "PIL-02", message: "solido non costruibile" }],
    };
    expect(StepResultSchema.safeParse(res).success).toBe(true);
    expect(WorkerMessageSchema.safeParse(res).success).toBe(true);
    expect(transferablesOf(res)).toHaveLength(1);
    expect(WorkerMessageSchema.safeParse({ kind: "error", id: 4, phase: "export", message: "x" }).success).toBe(true);
  });
});
