import { describe, expect, it } from "vitest";
import { createKernel } from "./kernel-core";
import { OcctInitError, initOcct, isOcctReady } from "./occt/init";
import { nodeOcctFactory } from "./occt/init-node";
import type { WorkerMessage } from "./protocol";

// File separato: il modulo `init` è un singleton e qui non deve essere già inizializzato.
describe("inizializzazione del kernel", () => {
  const broken = async () => Promise.reject(new Error("asset WASM non trovato (404)"));

  it("errore di init → BuildError esplicito su init e su build", async () => {
    const messages: WorkerMessage[] = [];
    const kernel = createKernel({ factory: broken, post: (m) => messages.push(m) });
    await kernel.handle({ kind: "init" });
    expect(messages[0]).toMatchObject({ kind: "error", id: null, phase: "init" });
    expect(messages[0].kind === "error" && messages[0].message).toContain("404");
    await kernel.handle({ kind: "build", id: 1, pieces: [] });
    expect(messages[1]).toMatchObject({ kind: "error", id: 1, phase: "init" });
    expect(isOcctReady()).toBe(false);
  });

  it("dopo un errore si può ritentare", async () => {
    await expect(initOcct({ factory: broken })).rejects.toBeInstanceOf(OcctInitError);
    const messages: WorkerMessage[] = [];
    const kernel = createKernel({ factory: nodeOcctFactory, post: (m) => messages.push(m) });
    await kernel.handle({ kind: "init" });
    expect(messages).toEqual([{ kind: "ready" }]);
    expect(isOcctReady()).toBe(true);
  });
});
