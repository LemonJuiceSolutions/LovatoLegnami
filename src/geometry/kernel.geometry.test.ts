import { beforeAll, describe, expect, it } from "vitest";
import { generate } from "@/domain";
import type { Machining } from "@/domain/components/types";
import { multiply, translation } from "@/domain/math/mat4";
import { vec3 } from "@/domain/math/vec3";
import { createKernel } from "./kernel-core";
import { initOcct } from "./occt/init";
import { nodeOcctFactory } from "./occt/init-node";
import { WorkerMessageSchema, type PieceGeometryInput, type WorkerMessage } from "./protocol";

beforeAll(async () => {
  await initOcct({ factory: nodeOcctFactory });
});

function setup() {
  const messages: WorkerMessage[] = [];
  const kernel = createKernel({ factory: nodeOcctFactory, post: (m) => messages.push(m) });
  return { kernel, messages };
}

const joist = generate("addossata-monofalda").pieces.find((p) => p.type === "travetto")!;

describe("kernel worker (logica)", () => {
  it("10 travetti identici → 1 costruzione e 10 risultati con pose diverse", async () => {
    const { kernel, messages } = setup();
    const pieces: PieceGeometryInput[] = Array.from({ length: 10 }, (_, i) => ({
      ...joist,
      id: `TVT-${String(i + 1).padStart(2, "0")}`,
      machinings: joist.machinings.map((m) => ({ ...m, id: `TVT-${i + 1}-${m.id}`, pieceId: `TVT-${i + 1}` })),
      pose: multiply(translation(vec3(600 * i, 0, 0)), joist.pose),
    }));
    await kernel.handle({ kind: "build", id: 1, pieces });
    expect(kernel.stats.builds).toBe(1);
    const results = messages.filter((m) => m.kind === "piece-result");
    expect(results).toHaveLength(10);
    for (const m of messages) expect(WorkerMessageSchema.safeParse(m).success, m.kind).toBe(true);
    const keys = new Set(results.map((r) => r.kind === "piece-result" && r.result.cacheKey));
    expect(keys.size).toBe(1);
    const xs = results.map((r) => (r.kind === "piece-result" ? r.result.pose[3] : NaN));
    expect(new Set(xs).size).toBe(10);
    expect(results.every((r) => r.kind === "piece-result" && r.result.mesh && r.result.brep && !r.result.error)).toBe(true);
    const done = messages.at(-1)!;
    expect(done).toMatchObject({ kind: "done", id: 1, total: 10, built: 1 });

    // Seconda generazione: tutto dalla cache.
    await kernel.handle({ kind: "build", id: 2, pieces });
    expect(kernel.stats.builds).toBe(1);
    expect(messages.at(-1)).toMatchObject({ kind: "done", id: 2, built: 0 });
  });

  it("progress prima del completamento e errore per pezzo senza bloccare gli altri", async () => {
    const { kernel, messages } = setup();
    const assembly = generate("addossata-monofalda");
    const pieces = assembly.pieces.slice(0, 4).map((p) => ({ ...p }));
    pieces[1] = { ...pieces[1], machinings: [{ ...(pieces[1].machinings[0] ?? {}), type: "fresatura", at: 10 } as unknown as Machining] };
    await kernel.handle({ kind: "build", id: 7, pieces });
    const kinds = messages.map((m) => m.kind);
    expect(kinds[0]).toBe("progress");
    expect(kinds.at(-1)).toBe("done");
    const results = messages.flatMap((m) => (m.kind === "piece-result" ? [m.result] : []));
    expect(results).toHaveLength(4);
    expect(results[1].error?.message).toContain(pieces[1].id);
    expect(results[1].error?.machiningType).toBe("fresatura");
    expect(results.filter((r) => r.error)).toHaveLength(1);
  });

  it("una nuova richiesta annulla la precedente: solo il risultato nuovo viene consegnato", async () => {
    const { kernel, messages } = setup();
    const pieces = generate("autoportante-bifalda").pieces;
    const first = kernel.handle({ kind: "build", id: 1, pieces });
    const second = kernel.handle({ kind: "build", id: 2, pieces: pieces.slice(0, 3) });
    await Promise.all([first, second]);
    expect(messages.filter((m) => m.kind === "done")).toEqual([expect.objectContaining({ id: 2, total: 3 })]);
    expect(messages.filter((m) => m.kind === "piece-result" && m.id === 1)).toHaveLength(0);
  });

  it("cancel interrompe la richiesta corrente", async () => {
    const { kernel, messages } = setup();
    const pieces = generate("autoportante-bifalda").pieces;
    const p = kernel.handle({ kind: "build", id: 5, pieces });
    await kernel.handle({ kind: "cancel", id: 5 });
    await p;
    expect(messages.some((m) => m.kind === "done")).toBe(false);
  });
});
