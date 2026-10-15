import { afterEach, describe, expect, it, vi } from "vitest";
import { generate } from "@/domain";
import { identity } from "@/domain/math/mat4";
import {
  BuildCancelledError,
  KernelExportError,
  KernelUnavailableError,
  createKernelClient,
  toGeometryInput,
  type BuildProgress,
  type WorkerLike,
} from "./client";
import type { BuildRequest, ClientMessage, ExportStepRequest, PieceResult, WorkerMessage } from "./protocol";

/** Worker finto: registra i messaggi e permette di rispondere a mano. */
class FakeWorker implements WorkerLike {
  static last: FakeWorker | null = null;
  readonly url: unknown;
  readonly options: unknown;
  readonly sent: ClientMessage[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent | Event) => void) | null = null;

  constructor(url?: unknown, options?: unknown) {
    this.url = url;
    this.options = options;
    FakeWorker.last = this;
  }
  postMessage(message: ClientMessage) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  emit(msg: WorkerMessage) {
    this.onmessage?.({ data: msg } as MessageEvent<WorkerMessage>);
  }
  lastBuild(): BuildRequest {
    return this.sent.filter((m): m is BuildRequest => m.kind === "build").at(-1)!;
  }
}

const result = (pieceId: string): PieceResult => ({
  pieceId,
  cacheKey: "k",
  pose: identity(),
  mesh: { positions: new Float32Array(9), normals: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) },
});

/** Simula la risposta del worker a una build: progress, risultati, done. */
function respond(w: FakeWorker, req: BuildRequest, events: string[]) {
  const total = req.pieces.length;
  w.emit({ kind: "progress", id: req.id, done: 0, total });
  req.pieces.forEach((p, i) => {
    w.emit({ kind: "piece-result", id: req.id, result: result(p.id) });
    w.emit({ kind: "progress", id: req.id, done: i + 1, total, pieceId: p.id });
  });
  events.push("done");
  w.emit({ kind: "done", id: req.id, total, built: total });
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.last = null;
});

const assembly = generate("addossata-monofalda");

describe("createKernelClient", () => {
  it("crea un module worker da kernel.worker.ts e invia init; ready → status ready", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const client = createKernelClient();
    const w = FakeWorker.last!;
    expect(String(w.url)).toMatch(/kernel\.worker\.ts$/);
    expect(w.options).toEqual({ type: "module" });
    expect(w.sent[0]).toEqual({ kind: "init" });
    expect(client.status).toBe("init");
    const statuses: string[] = [];
    client.onStatusChange((s) => statuses.push(s));
    w.emit({ kind: "ready" });
    await client.ready();
    expect(client.status).toBe("ready");
    expect(statuses).toEqual(["ready"]);
  });

  it("il progress arriva prima del risultato, risultati nell'ordine dei pezzi", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const client = createKernelClient();
    const w = FakeWorker.last!;
    w.emit({ kind: "ready" });
    const events: string[] = [];
    const progress: BuildProgress[] = [];
    const p = client.build(assembly, (pr) => {
      progress.push(pr);
      events.push("progress");
    });
    const req = w.lastBuild();
    expect(req.pieces).toHaveLength(assembly.pieces.length);
    expect(req.pieces[0]).not.toHaveProperty("label");
    respond(w, req, events);
    const results = await p;
    expect(events.indexOf("progress")).toBeLessThan(events.indexOf("done"));
    expect(progress.at(-1)).toMatchObject({ done: assembly.pieces.length, total: assembly.pieces.length });
    expect(results.map((r) => r.pieceId)).toEqual(assembly.pieces.map((x) => x.id));
  });

  it("la seconda richiesta annulla la prima: solo il nuovo risultato viene consegnato", async () => {
    const client = createKernelClient({ createWorker: () => new FakeWorker() });
    const w = FakeWorker.last!;
    w.emit({ kind: "ready" });
    const first = client.build(assembly);
    const req1 = w.lastBuild();
    const second = client.build({ pieces: assembly.pieces.slice(0, 2) });
    const req2 = w.lastBuild();
    expect(req2.id).toBeGreaterThan(req1.id);
    await expect(first).rejects.toBeInstanceOf(BuildCancelledError);
    // messaggi tardivi della prima richiesta vengono ignorati
    w.emit({ kind: "piece-result", id: req1.id, result: result("PIL-01") });
    w.emit({ kind: "done", id: req1.id, total: 1, built: 1 });
    respond(w, req2, []);
    const results = await second;
    expect(results.map((r) => r.pieceId)).toEqual(assembly.pieces.slice(0, 2).map((x) => x.id));
  });

  it("cancel invia il messaggio al worker e rifiuta la richiesta", async () => {
    const client = createKernelClient({ createWorker: () => new FakeWorker() });
    const w = FakeWorker.last!;
    const p = client.build(assembly);
    client.cancel();
    await expect(p).rejects.toBeInstanceOf(BuildCancelledError);
    expect(w.sent.at(-1)).toEqual({ kind: "cancel", id: w.lastBuild().id });
  });

  it("errore di init → status unavailable, errore esplicito e build rifiutate", async () => {
    const client = createKernelClient({ createWorker: () => new FakeWorker() });
    const w = FakeWorker.last!;
    const pendingBuild = client.build(assembly);
    const ready = client.ready();
    w.emit({ kind: "error", id: null, phase: "init", message: "WASM non caricato (404)" });
    expect(client.status).toBe("unavailable");
    expect(client.error).toContain("404");
    await expect(ready).rejects.toBeInstanceOf(KernelUnavailableError);
    await expect(pendingBuild).rejects.toThrow(/404/);
    await expect(client.build(assembly)).rejects.toBeInstanceOf(KernelUnavailableError);
  });

  it("worker che non si avvia o fallisce il caricamento → unavailable", async () => {
    const throwing = createKernelClient({
      createWorker: () => {
        throw new Error("Worker non supportato");
      },
    });
    expect(throwing.status).toBe("unavailable");
    await expect(throwing.ready()).rejects.toThrow(/non supportato/);

    const client = createKernelClient({ createWorker: () => new FakeWorker() });
    FakeWorker.last!.onerror?.({ message: "script non trovato" } as ErrorEvent);
    expect(client.status).toBe("unavailable");
    expect(client.error).toBe("script non trovato");
  });

  it("errore di build per richiesta corrente → promessa rifiutata, dispose termina il worker", async () => {
    const client = createKernelClient({ createWorker: () => new FakeWorker() });
    const w = FakeWorker.last!;
    w.emit({ kind: "ready" });
    const p = client.build(assembly);
    w.emit({ kind: "error", id: w.lastBuild().id, phase: "build", message: "memoria esaurita" });
    await expect(p).rejects.toThrow("memoria esaurita");
    expect(client.status).toBe("ready");
    client.dispose();
    expect(w.terminated).toBe(true);
    expect(client.status).toBe("unavailable");
  });

  it("exportStep invia export-step senza annullare la build e risolve con il file", async () => {
    const client = createKernelClient({ createWorker: () => new FakeWorker() });
    const w = FakeWorker.last!;
    w.emit({ kind: "ready" });
    const build = client.build(assembly);
    const exp = client.exportStep(assembly, { tolerance: 0.5 });
    const req = w.sent.at(-1) as ExportStepRequest;
    expect(req).toMatchObject({ kind: "export-step", options: { tolerance: 0.5 } });
    expect(req.pieces).toHaveLength(assembly.pieces.length);
    const data = new TextEncoder().encode("ISO-10303-21;");
    w.emit({ kind: "step-result", id: req.id, data, written: ["PIL-01"], errors: [] });
    await expect(exp).resolves.toEqual({ data, written: ["PIL-01"], errors: [] });
    respond(w, w.lastBuild(), []);
    await expect(build).resolves.toHaveLength(assembly.pieces.length);
  });

  it("exportStep: errore di fase export → KernelExportError; kernel non disponibile → rifiuto", async () => {
    const client = createKernelClient({ createWorker: () => new FakeWorker() });
    const w = FakeWorker.last!;
    w.emit({ kind: "ready" });
    const exp = client.exportStep(assembly);
    const req = w.sent.at(-1) as ExportStepRequest;
    w.emit({ kind: "error", id: req.id, phase: "export", message: "nessun pezzo esportabile" });
    await expect(exp).rejects.toBeInstanceOf(KernelExportError);
    const pendingExp = client.exportStep(assembly);
    w.emit({ kind: "error", id: null, phase: "init", message: "crash" });
    await expect(pendingExp).rejects.toBeInstanceOf(KernelUnavailableError);
    await expect(client.exportStep(assembly)).rejects.toBeInstanceOf(KernelUnavailableError);
  });
});

describe("toGeometryInput", () => {
  it("passa l'asse curvo dei pezzi ad arco e lo omette per i pezzi dritti", () => {
    const assembly = generate("carport-arco");
    const arc = assembly.pieces.find((p) => p.curve)!;
    expect(toGeometryInput(arc).curve).toEqual(arc.curve);
    const straight = assembly.pieces.find((p) => !p.curve)!;
    expect("curve" in toGeometryInput(straight)).toBe(false);
  });
});
