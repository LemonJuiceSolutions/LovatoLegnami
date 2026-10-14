import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Assembly } from "@/domain";
import { identity } from "@/domain/math/mat4";
import {
  BuildCancelledError,
  KernelUnavailableError,
  type BuildProgress,
  type KernelClient,
  type KernelStatus,
} from "@/geometry/client";
import type { PieceResult } from "@/geometry/protocol";
import { createConfiguratoreStore, selectPieceResults, selectSolidsReady } from "./configuratore-store";

const result = (pieceId: string, error?: string): PieceResult => ({
  pieceId,
  cacheKey: "k",
  pose: identity(),
  ...(error
    ? { error: { message: error } }
    : { mesh: { positions: new Float32Array(9), normals: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) } }),
});

/** Client del kernel finto: le build restano in sospeso finché il test non le risolve. */
function fakeClient(initial: KernelStatus = "init") {
  let status: KernelStatus = initial;
  let error: string | undefined;
  const listeners = new Set<(s: KernelStatus, e?: string) => void>();
  const builds: {
    assembly: Pick<Assembly, "pieces">;
    onProgress?: (p: BuildProgress) => void;
    resolve: (r: PieceResult[]) => void;
    reject: (e: Error) => void;
  }[] = [];
  const client: KernelClient = {
    get status() {
      return status;
    },
    get error() {
      return error;
    },
    onStatusChange(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    ready: () => Promise.resolve(),
    build(assembly, onProgress) {
      const prev = builds.at(-1);
      return new Promise((resolve, reject) => {
        prev?.reject(new BuildCancelledError(builds.length));
        builds.push({ assembly, onProgress, resolve, reject });
      });
    },
    exportStep: vi.fn(async () => ({ data: new Uint8Array([1]), written: ["PIL-01"], errors: [] })),
    cancel: vi.fn(),
    dispose: vi.fn(),
  };
  const setStatus = (s: KernelStatus, e?: string) => {
    status = s;
    error = e;
    for (const l of listeners) l(s, e);
  };
  /** Completa l'ultima build con un risultato per pezzo. */
  const complete = (errors: Record<string, string> = {}) => {
    const b = builds.at(-1)!;
    const n = b.assembly.pieces.length;
    b.onProgress?.({ done: n, total: n });
    b.resolve(b.assembly.pieces.map((p) => result(p.id, errors[p.id])));
  };
  return { client, builds, setStatus, complete };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("slice kernel", () => {
  it("idle finché non si avvia; al ready costruisce l'assieme corrente e abilita gli export CAD", async () => {
    const fake = fakeClient();
    const factory = vi.fn(() => fake.client);
    const store = createConfiguratoreStore({ kernelFactory: factory });
    expect(store.getState().kernel.status).toBe("idle");
    store.getState().setParam("larghezza", 5000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(factory).not.toHaveBeenCalled();

    store.getState().startKernel();
    store.getState().startKernel(); // idempotente
    expect(factory).toHaveBeenCalledOnce();
    expect(store.getState().kernel.status).toBe("init");
    fake.setStatus("ready");
    expect(fake.builds).toHaveLength(1);
    expect(store.getState().kernel.building).toBe(true);
    expect(selectSolidsReady(store.getState())).toBe(false);
    fake.complete();
    await flush();
    const { kernel, derived } = store.getState();
    expect(kernel.building).toBe(false);
    expect(kernel.builtFor).toBe(derived.assembly);
    expect(Object.keys(kernel.results)).toHaveLength(derived.assembly!.pieces.length);
    expect(kernel.progress).toMatchObject({ done: derived.assembly!.pieces.length });
    expect(selectSolidsReady(store.getState())).toBe(true);
    expect(selectPieceResults(store.getState()).map((r) => r.pieceId)).toEqual(derived.assembly!.pieces.map((p) => p.id));
    expect(selectPieceResults(store.getState())).toBe(selectPieceResults(store.getState()));
  });

  it("rebuild con debounce di 300 ms: modifiche ravvicinate → una sola build", async () => {
    const fake = fakeClient("ready");
    const store = createConfiguratoreStore({ kernelFactory: () => fake.client });
    store.getState().startKernel();
    fake.complete();
    await flush();
    expect(fake.builds).toHaveLength(1);

    store.getState().setParam("larghezza", 5000);
    await vi.advanceTimersByTimeAsync(100);
    store.getState().setParam("larghezza", 5200);
    await vi.advanceTimersByTimeAsync(100);
    store.getState().setParam("larghezza", 5400);
    expect(store.getState().kernel.building).toBe(true);
    expect(selectSolidsReady(store.getState())).toBe(false);
    await vi.advanceTimersByTimeAsync(299);
    expect(fake.builds).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.builds).toHaveLength(2);
    expect(fake.builds[1].assembly).toBe(store.getState().derived.assembly);
    fake.complete();
    await flush();
    expect(store.getState().kernel.builtFor?.params.larghezza).toBe(5400);
  });

  it("parametro non valido: nessuna build (l'assieme non cambia)", async () => {
    const fake = fakeClient("ready");
    const store = createConfiguratoreStore({ kernelFactory: () => fake.client });
    store.getState().startKernel();
    fake.complete();
    await flush();
    store.getState().setParam("pendenza", 50);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.builds).toHaveLength(1);
  });

  it("build superata ignorata; errore per pezzo → export CAD non abilitati", async () => {
    const fake = fakeClient("ready");
    const store = createConfiguratoreStore({ kernelFactory: () => fake.client, debounceMs: 10 });
    store.getState().startKernel();
    store.getState().setParam("larghezza", 5000);
    await vi.advanceTimersByTimeAsync(10); // la seconda build annulla la prima
    expect(fake.builds).toHaveLength(2);
    expect(store.getState().kernel.error).toBeNull();
    const first = store.getState().derived.assembly!.pieces[0].id;
    fake.complete({ [first]: "booleana fallita" });
    await flush();
    expect(store.getState().kernel.results[first].error?.message).toBe("booleana fallita");
    expect(selectSolidsReady(store.getState())).toBe(false);
  });

  it("kernel non disponibile → status unavailable con il motivo, nessuna build", async () => {
    const fake = fakeClient();
    const store = createConfiguratoreStore({ kernelFactory: () => fake.client });
    store.getState().startKernel();
    fake.setStatus("unavailable", "WASM non caricato");
    expect(store.getState().kernel).toMatchObject({ status: "unavailable", error: "WASM non caricato", building: false });
    store.getState().setParam("larghezza", 5000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.builds).toHaveLength(0);
    await expect(store.getState().rebuildNow()).resolves.toBeUndefined();
  });

  it("build rifiutata per kernel caduto o errore globale", async () => {
    const fake = fakeClient("ready");
    const store = createConfiguratoreStore({ kernelFactory: () => fake.client });
    store.getState().startKernel();
    fake.builds[0].reject(new Error("memoria esaurita"));
    await flush();
    expect(store.getState().kernel).toMatchObject({ error: "memoria esaurita", building: false, status: "ready" });
    const p = store.getState().rebuildNow();
    fake.builds[1].reject(new KernelUnavailableError("worker terminato"));
    await p;
    expect(store.getState().kernel.status).toBe("unavailable");
  });

  it("exportStep usa il client con l'assieme corrente; stopKernel termina il worker", async () => {
    const fake = fakeClient("ready");
    const store = createConfiguratoreStore({ kernelFactory: () => fake.client });
    await expect(store.getState().exportStep()).rejects.toBeInstanceOf(KernelUnavailableError);
    store.getState().startKernel();
    await expect(store.getState().exportStep()).resolves.toMatchObject({ written: ["PIL-01"] });
    expect(fake.client.exportStep).toHaveBeenCalledWith(store.getState().derived.assembly, undefined);
    store.getState().stopKernel();
    expect(fake.client.dispose).toHaveBeenCalled();
    expect(store.getState().kernel.status).toBe("idle");
  });
});
