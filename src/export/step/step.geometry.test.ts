import { makeBox } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { generate } from "@/domain";
import { translation } from "@/domain/math/mat4";
import { vec3 } from "@/domain/math/vec3";
import { createKernel } from "@/geometry/kernel-core";
import { initOcct } from "@/geometry/occt/init";
import { nodeOcctFactory } from "@/geometry/occt/init-node";
import { toGeometryInput } from "@/geometry/client";
import type { WorkerMessage } from "@/geometry/protocol";
import { StepExportError, exportStep } from ".";

beforeAll(async () => {
  await initOcct({ factory: nodeOcctFactory });
});

const text = (data: Uint8Array) => new TextDecoder().decode(data);
const count = (s: string, token: string) => s.split(token).length - 1;

describe("exportStep", () => {
  it("2 box → 2 MANIFOLD_SOLID_BREP e i nomi dei pezzi, in mm", async () => {
    const a = makeBox([0, 0, 0], [100, 120, 2400]);
    const b = makeBox([500, 0, 0], [600, 120, 2400]);
    const step = text(await exportStep([a, b], ["PIL-01", "PIL-02"]));
    expect(step.startsWith("ISO-10303-21;")).toBe(true);
    expect(count(step, "MANIFOLD_SOLID_BREP")).toBe(2);
    expect(step).toContain("'PIL-01'");
    expect(step).toContain("'PIL-02'");
    expect(step).toMatch(/SI_UNIT\(\.MILLI\.,\.METRE\.\)/);
    a.delete();
    b.delete();
  });

  it("nomi non accoppiati o duplicati → errore", async () => {
    const a = makeBox([0, 0, 0], [10, 10, 10]);
    await expect(exportStep([a], [])).rejects.toBeInstanceOf(StepExportError);
    await expect(exportStep([a, a], ["X", "X"])).rejects.toThrow(/duplicato/);
    a.delete();
  });
});

describe("messaggio export-step del worker", () => {
  it("monofalda di default: un solido nominato per pezzo, posizionato con la posa", async () => {
    const messages: WorkerMessage[] = [];
    const kernel = createKernel({ factory: nodeOcctFactory, post: (m) => messages.push(m) });
    const assembly = generate("addossata-monofalda");
    const pieces = assembly.pieces.map(toGeometryInput);
    await kernel.handle({ kind: "build", id: 1, pieces });
    const builds = kernel.stats.builds;
    await kernel.handle({ kind: "export-step", id: 2, pieces });
    expect(kernel.stats.builds).toBe(builds); // solidi riusati dalla cache
    const res = messages.at(-1)!;
    expect(res.kind).toBe("step-result");
    if (res.kind !== "step-result") return;
    expect(res.id).toBe(2);
    expect(res.errors).toEqual([]);
    expect(res.written).toEqual(assembly.pieces.map((p) => p.id));
    const step = text(res.data);
    expect(count(step, "MANIFOLD_SOLID_BREP")).toBe(assembly.pieces.length);
    for (const p of assembly.pieces) expect(step).toContain(`'${p.id}'`);
  });

  it("applica la posa: box traslato di 5000 in X; pezzo non costruibile segnalato senza bloccare", async () => {
    const messages: WorkerMessage[] = [];
    const kernel = createKernel({ factory: nodeOcctFactory, post: (m) => messages.push(m) });
    const base = { type: "pilastro" as const, section: { b: 100, h: 100 }, length: 1000, machinings: [] };
    const bad = {
      ...base,
      id: "PIL-02",
      pose: translation(vec3(0, 0, 0)),
      machinings: [{ id: "PIL-02-L01", pieceId: "PIL-02", type: "fresatura", at: 10 } as never],
    };
    await kernel.handle({
      kind: "export-step",
      id: 1,
      pieces: [{ ...base, id: "PIL-01", pose: translation(vec3(5000, 0, 0)) }, bad],
    });
    const res = messages.at(-1)!;
    expect(res.kind).toBe("step-result");
    if (res.kind !== "step-result") return;
    expect(res.written).toEqual(["PIL-01"]);
    expect(res.errors.map((e) => e.pieceId)).toEqual(["PIL-02"]);
    const step = text(res.data);
    expect(count(step, "MANIFOLD_SOLID_BREP")).toBe(1);
    const xs = [...step.matchAll(/CARTESIAN_POINT\('[^']*',\(([-\d.E+]+),/g)].map((m) => Number(m[1]));
    expect(Math.max(...xs)).toBeCloseTo(6000, 3);
  });

  it("nessun pezzo esportabile → errore di fase export", async () => {
    const messages: WorkerMessage[] = [];
    const kernel = createKernel({ factory: nodeOcctFactory, post: (m) => messages.push(m) });
    const bad = {
      id: "X-1",
      type: "pilastro" as const,
      section: { b: 100, h: 100 },
      length: 1000,
      pose: translation(vec3(0, 0, 0)),
      machinings: [{ id: "X-1-L01", pieceId: "X-1", type: "fresatura", at: 10 } as never],
    };
    await kernel.handle({ kind: "export-step", id: 3, pieces: [bad] });
    expect(messages.at(-1)).toMatchObject({ kind: "error", id: 3, phase: "export" });
  });
});
