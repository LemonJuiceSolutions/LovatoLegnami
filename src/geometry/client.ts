import type { Assembly, Piece } from "@/domain/components/types";
import type {
  BuildOptions,
  ClientMessage,
  PieceExportError,
  PieceGeometryInput,
  PieceResult,
  Progress,
  WorkerMessage,
} from "./protocol";

/**
 * Client del kernel geometrico per il thread UI (D6). Crea il worker con
 * `new Worker(new URL("./kernel.worker.ts", import.meta.url), { type: "module" })`
 * (supporto nativo di webpack 5 in Next 14), lo inizializza e gestisce le
 * richieste di costruzione: ogni `build` annulla la precedente, che viene
 * rifiutata con `BuildCancelledError`. Da importare solo in client component
 * caricati dinamicamente (mai lato server).
 */

export type KernelStatus = "init" | "ready" | "unavailable";

export interface BuildProgress {
  readonly done: number;
  readonly total: number;
  readonly pieceId?: string;
}

export interface KernelClient {
  readonly status: KernelStatus;
  /** Motivo dell'indisponibilità (`status === "unavailable"`). */
  readonly error: string | undefined;
  /** Notifica i cambi di stato; restituisce la funzione di disiscrizione. */
  onStatusChange(listener: (status: KernelStatus, error?: string) => void): () => void;
  /** Risolve quando il kernel è pronto, rifiuta con `KernelUnavailableError`. */
  ready(): Promise<void>;
  /**
   * Costruisce i solidi dei pezzi (in ordine di input). `onProgress` riceve
   * pezzi completati / totali prima della risoluzione.
   */
  build(
    assembly: Pick<Assembly, "pieces">,
    onProgress?: (progress: BuildProgress) => void,
    options?: BuildOptions,
  ): Promise<PieceResult[]>;
  /**
   * Export STEP dei pezzi (9.1) eseguito nel worker: riusa i solidi in cache
   * della build con le stesse `options` (costruisce quelli mancanti). Non
   * annulla la build in corso. Rifiuta con `KernelExportError` se nessun
   * pezzo è esportabile.
   */
  exportStep(assembly: Pick<Assembly, "pieces">, options?: BuildOptions): Promise<StepExport>;
  /** Annulla la costruzione in corso (la sua promessa viene rifiutata). */
  cancel(): void;
  /** Termina il worker. */
  dispose(): void;
}

/** File STEP prodotto dal worker. */
export interface StepExport {
  readonly data: Uint8Array;
  /** Id dei pezzi scritti. */
  readonly written: readonly string[];
  /** Pezzi esclusi (solido non costruibile). */
  readonly errors: readonly PieceExportError[];
}

/** Il kernel non è disponibile (WASM non caricato, worker non avviabile). */
export class KernelUnavailableError extends Error {
  constructor(reason: string) {
    super(`Kernel geometrico non disponibile: ${reason}`);
    this.name = "KernelUnavailableError";
  }
}

/** La richiesta è stata superata da una più recente o annullata. */
export class BuildCancelledError extends Error {
  constructor(readonly requestId: number) {
    super(`Costruzione ${requestId} annullata`);
    this.name = "BuildCancelledError";
  }
}

/** Errore globale di una richiesta di costruzione. */
export class KernelBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KernelBuildError";
  }
}

/** Errore dell'export STEP nel worker. */
export class KernelExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KernelExportError";
  }
}

/** Sottoinsieme di `Worker` usato dal client (sostituibile nei test). */
export interface WorkerLike {
  postMessage(message: ClientMessage): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent | Event) => void) | null;
}

export interface KernelClientOptions {
  /** Crea il worker (default: `kernel.worker.ts` come module worker). */
  readonly createWorker?: () => WorkerLike;
  /** Base URL degli asset OCCT (default `/occt/<versione>/`). */
  readonly assetBase?: string;
}

const defaultWorker = (): WorkerLike =>
  new Worker(new URL("./kernel.worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;

/** Dati geometrici del pezzo (senza etichetta e famiglia). */
export const toGeometryInput = (p: Piece): PieceGeometryInput => ({
  id: p.id,
  type: p.type,
  section: p.section,
  length: p.length,
  ...(p.curve ? { curve: p.curve } : {}),
  machinings: p.machinings,
  pose: p.pose,
});

interface PendingBuild {
  readonly id: number;
  readonly order: readonly string[];
  readonly results: Map<string, PieceResult>;
  readonly onProgress?: (p: BuildProgress) => void;
  readonly resolve: (r: PieceResult[]) => void;
  readonly reject: (e: Error) => void;
}

export function createKernelClient(options: KernelClientOptions = {}): KernelClient {
  let status: KernelStatus = "init";
  let error: string | undefined;
  let nextId = 1;
  let pending: PendingBuild | null = null;
  const exports = new Map<number, { resolve: (r: StepExport) => void; reject: (e: Error) => void }>();
  const listeners = new Set<(s: KernelStatus, e?: string) => void>();
  const readyWaiters: { resolve: () => void; reject: (e: Error) => void }[] = [];
  let worker: WorkerLike | null = null;

  const setStatus = (s: KernelStatus, reason?: string) => {
    status = s;
    error = s === "unavailable" ? reason : undefined;
    for (const l of listeners) l(s, error);
    if (s === "ready") readyWaiters.splice(0).forEach((w) => w.resolve());
    if (s === "unavailable") {
      const err = new KernelUnavailableError(reason ?? "errore sconosciuto");
      readyWaiters.splice(0).forEach((w) => w.reject(err));
      if (pending) {
        pending.reject(err);
        pending = null;
      }
      for (const e of exports.values()) e.reject(err);
      exports.clear();
    }
  };

  const onMessage = (msg: WorkerMessage) => {
    switch (msg.kind) {
      case "ready":
        if (status !== "unavailable") setStatus("ready");
        return;
      case "error":
        if (msg.phase === "export" && msg.id !== null) {
          exports.get(msg.id)?.reject(new KernelExportError(msg.message));
          exports.delete(msg.id);
        } else if (msg.phase === "init") {
          setStatus("unavailable", msg.message);
        } else if (pending && pending.id === msg.id) {
          pending.reject(new KernelBuildError(msg.message));
          pending = null;
        }
        return;
      case "progress":
        if (pending && pending.id === msg.id) pending.onProgress?.(progressOf(msg));
        return;
      case "piece-result":
        if (pending && pending.id === msg.id) pending.results.set(msg.result.pieceId, msg.result);
        return;
      case "step-result": {
        const e = exports.get(msg.id);
        exports.delete(msg.id);
        e?.resolve({ data: msg.data, written: msg.written, errors: msg.errors });
        return;
      }
      case "done":
        if (pending && pending.id === msg.id) {
          const p = pending;
          pending = null;
          p.resolve(p.order.map((id) => p.results.get(id)).filter((r): r is PieceResult => r !== undefined));
        }
        return;
    }
  };

  try {
    worker = (options.createWorker ?? defaultWorker)();
    worker.onmessage = (event) => onMessage(event.data);
    worker.onerror = (event) => {
      const message = "message" in event && event.message ? event.message : "errore di caricamento del worker";
      setStatus("unavailable", message);
    };
    worker.postMessage({ kind: "init", ...(options.assetBase ? { assetBase: options.assetBase } : {}) });
  } catch (e) {
    worker = null;
    setStatus("unavailable", e instanceof Error ? e.message : String(e));
  }

  const cancelPending = () => {
    if (!pending) return;
    const p = pending;
    pending = null;
    worker?.postMessage({ kind: "cancel", id: p.id });
    p.reject(new BuildCancelledError(p.id));
  };

  return {
    get status() {
      return status;
    },
    get error() {
      return error;
    },
    onStatusChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ready() {
      if (status === "ready") return Promise.resolve();
      if (status === "unavailable") return Promise.reject(new KernelUnavailableError(error ?? "errore sconosciuto"));
      return new Promise((resolve, reject) => readyWaiters.push({ resolve, reject }));
    },
    build(assembly, onProgress, buildOptions) {
      if (status === "unavailable" || !worker)
        return Promise.reject(new KernelUnavailableError(error ?? "worker non avviato"));
      if (pending) {
        // Il worker scarta da sé le richieste superate: basta rifiutare la promessa.
        const p = pending;
        pending = null;
        p.reject(new BuildCancelledError(p.id));
      }
      const id = nextId++;
      const pieces = assembly.pieces.map(toGeometryInput);
      const promise = new Promise<PieceResult[]>((resolve, reject) => {
        pending = { id, order: pieces.map((p) => p.id), results: new Map(), onProgress, resolve, reject };
      });
      worker.postMessage({ kind: "build", id, pieces, ...(buildOptions ? { options: buildOptions } : {}) });
      return promise;
    },
    exportStep(assembly, buildOptions) {
      if (status === "unavailable" || !worker)
        return Promise.reject(new KernelUnavailableError(error ?? "worker non avviato"));
      const id = nextId++;
      const pieces = assembly.pieces.map(toGeometryInput);
      const promise = new Promise<StepExport>((resolve, reject) => exports.set(id, { resolve, reject }));
      worker.postMessage({ kind: "export-step", id, pieces, ...(buildOptions ? { options: buildOptions } : {}) });
      return promise;
    },
    cancel: cancelPending,
    dispose() {
      cancelPending();
      worker?.terminate();
      worker = null;
      setStatus("unavailable", "kernel terminato");
      listeners.clear();
    },
  };
}

const progressOf = (p: Progress): BuildProgress => ({
  done: p.done,
  total: p.total,
  ...(p.pieceId ? { pieceId: p.pieceId } : {}),
});
