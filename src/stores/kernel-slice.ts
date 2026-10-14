import type { Assembly } from "@/domain";
import {
  BuildCancelledError,
  KernelUnavailableError,
  createKernelClient,
  type BuildProgress,
  type KernelClient,
  type StepExport,
} from "@/geometry/client";
import type { BuildOptions, PieceResult } from "@/geometry/protocol";

/**
 * Slice `kernel` dello store (D10): stato del kernel geometrico, avanzamento
 * e risultati per pezzo. Il client (`createKernelClient`, Web Worker) è creato
 * solo con `startKernel()` (la pagina del configuratore lo chiama al mount);
 * da quel momento ogni nuovo assieme in `derived` provoca un `rebuild()` con
 * debounce (300 ms) e la build precedente viene annullata.
 */

/** `idle` = kernel non avviato (nessun worker). */
export type KernelSliceStatus = "idle" | "init" | "ready" | "unavailable";

export interface KernelState {
  readonly status: KernelSliceStatus;
  /** Motivo dell'indisponibilità o ultimo errore di costruzione. */
  readonly error: string | null;
  /** Costruzione in corso (o in attesa del debounce). */
  readonly building: boolean;
  readonly progress: BuildProgress | null;
  /** Ultimi risultati per id pezzo. */
  readonly results: Readonly<Record<string, PieceResult>>;
  /** Assieme a cui si riferiscono `results` (`null` prima della prima costruzione). */
  readonly builtFor: Assembly | null;
}

export interface KernelActions {
  /** Avvia il kernel (idempotente) e costruisce l'assieme corrente appena pronto. */
  startKernel(): void;
  /** Richiede una nuova costruzione con debounce. */
  rebuild(): void;
  /** Costruisce subito (annulla il debounce in attesa). */
  rebuildNow(): Promise<void>;
  /** Export STEP dell'assieme corrente nel worker. */
  exportStep(): Promise<StepExport>;
  /** Termina il worker e torna a `idle`. */
  stopKernel(): void;
}

export interface KernelSliceOptions {
  /** Crea il client del kernel (default `createKernelClient()`; nei test un finto). */
  readonly kernelFactory?: () => KernelClient;
  /** Debounce di `rebuild()` in ms (default 300). */
  readonly debounceMs?: number;
  /** Opzioni di tessellazione/B-rep passate a `build` (e a `exportStep` per riusare la cache). */
  readonly buildOptions?: BuildOptions;
}

export const INITIAL_KERNEL_STATE: KernelState = {
  status: "idle",
  error: null,
  building: false,
  progress: null,
  results: {},
  builtFor: null,
};

export const REBUILD_DEBOUNCE_MS = 300;

interface Host {
  readonly kernel: KernelState;
  readonly derived: { readonly assembly: Assembly | null };
}

export function kernelSlice<S extends Host>(
  set: (partial: Partial<S>) => void,
  get: () => S,
  options: KernelSliceOptions = {},
): KernelActions {
  const debounceMs = options.debounceMs ?? REBUILD_DEBOUNCE_MS;
  let client: KernelClient | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | null = null;

  const patch = (p: Partial<KernelState>) => set({ kernel: { ...get().kernel, ...p } } as Partial<S>);

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const buildNow = async (): Promise<void> => {
    clearTimer();
    const assembly = get().derived.assembly;
    if (!client || !assembly || client.status === "unavailable") {
      if (get().kernel.building) patch({ building: false });
      return;
    }
    patch({ building: true, error: null, progress: { done: 0, total: assembly.pieces.length } });
    try {
      const list = await client.build(assembly, (progress) => patch({ progress }), options.buildOptions);
      const results: Record<string, PieceResult> = {};
      for (const r of list) results[r.pieceId] = r;
      patch({ results, builtFor: assembly, building: false });
    } catch (e) {
      if (e instanceof BuildCancelledError) return; // superata da una build più recente
      if (e instanceof KernelUnavailableError) patch({ status: "unavailable", error: client?.error ?? e.message, building: false });
      else patch({ error: e instanceof Error ? e.message : String(e), building: false });
    }
  };

  const schedule = () => {
    if (!client || client.status === "unavailable") return;
    clearTimer();
    if (!get().kernel.building) patch({ building: true });
    timer = setTimeout(() => void buildNow(), debounceMs);
  };

  return {
    startKernel() {
      if (client) return;
      client = (options.kernelFactory ?? createKernelClient)();
      const c = client;
      unsubscribe = c.onStatusChange((status, error) => {
        patch({ status, error: error ?? null, ...(status === "unavailable" ? { building: false } : {}) });
        if (status === "ready") void buildNow();
      });
      patch({ status: c.status, error: c.error ?? null });
      if (c.status === "ready") void buildNow(); // altrimenti si attende `ready`
    },
    rebuild: schedule,
    rebuildNow: buildNow,
    exportStep() {
      const assembly = get().derived.assembly;
      if (!client) return Promise.reject(new KernelUnavailableError("kernel non avviato"));
      if (!assembly) return Promise.reject(new Error("nessun assieme da esportare"));
      return client.exportStep(assembly, options.buildOptions);
    },
    stopKernel() {
      clearTimer();
      unsubscribe?.();
      unsubscribe = null;
      client?.dispose();
      client = null;
      set({ kernel: INITIAL_KERNEL_STATE } as Partial<S>);
    },
  };
}

/** `true` se i risultati coprono l'assieme corrente, senza errori: export CAD abilitati. */
export function solidsReady(kernel: KernelState, assembly: Assembly | null): boolean {
  if (kernel.status !== "ready" || kernel.building || !assembly || kernel.builtFor !== assembly) return false;
  return assembly.pieces.every((p) => {
    const r = kernel.results[p.id];
    return r !== undefined && !r.error;
  });
}
