// Test geometry end-to-end (13.2): assieme di default → kernel OCCT (logica del
// worker in Node) → B-rep → SAT reale validato e STEP, entro 60 s.
import { describe, expect, it } from "vitest";
import { assemblyBounds, generate } from "@/domain";
import { exportSat, validateSat } from "@/export/sat";
import { toGeometryInput } from "./client";
import { createKernel } from "./kernel-core";
import { nodeOcctFactory } from "./occt/init-node";
import type { PieceResult, WorkerMessage } from "./protocol";

const date = new Date(2026, 9, 14, 9, 30, 0);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

/** Coordinate di tutti i record `point` del SAT (ultimi tre numeri prima di `#`). */
function satPoints(sat: string): number[][] {
  return sat
    .split("\n")
    .filter((l) => /^(-\d+ )?point /.test(l))
    .map((l) => l.replace(/\s*#\s*$/, "").trim().split(/\s+/).slice(-3).map(Number));
}

describe.each(["addossata-monofalda", "autoportante-bifalda"])("%s di default: kernel → SAT + STEP", (slug) => {
  it("costruisce tutti i pezzi, SAT valido nel sistema assieme e STEP con un solido per pezzo, < 60 s", async () => {
    const t0 = performance.now();
    const messages: WorkerMessage[] = [];
    const kernel = createKernel({ factory: nodeOcctFactory, post: (m) => messages.push(m) });
    await kernel.handle({ kind: "init" });
    expect(messages.map((m) => m.kind)).toContain("ready");

    const assembly = generate(slug);
    const pieces = assembly.pieces.map(toGeometryInput);
    await kernel.handle({ kind: "build", id: 1, pieces });
    const results: PieceResult[] = messages.flatMap((m) => (m.kind === "piece-result" ? [m.result] : []));
    expect(results).toHaveLength(assembly.pieces.length);
    expect(results.filter((r) => r.error).map((r) => `${r.pieceId}: ${r.error?.message}`)).toEqual([]);
    expect(results.every((r) => r.brep && r.mesh && (r.volume ?? 0) > 0)).toBe(true);

    // SAT assieme unico: un body nominato per pezzo, file valido.
    const sat = exportSat(assembly.pieces, results, { date });
    expect(sat.errors.map((e) => e.message)).toEqual([]);
    const v = validateSat(sat.data as string);
    expect(v.errors).toEqual([]);
    expect(v.bodies.map((b) => b.name)).toEqual(assembly.pieces.map((p) => p.id));

    // Le coordinate SAT sono nel sistema assieme: stanno nel box dell'assieme.
    const bounds = assemblyBounds(assembly)!;
    const pts = satPoints(sat.data as string);
    expect(pts.length).toBeGreaterThan(assembly.pieces.length * 8);
    const axis = (k: 0 | 1 | 2) => pts.map((p) => p[k]);
    const keys = ["x", "y", "z"] as const;
    for (const k of [0, 1, 2] as const) {
      expect(Math.min(...axis(k))).toBeGreaterThanOrEqual(bounds.min[keys[k]] - 0.01);
      expect(Math.max(...axis(k))).toBeLessThanOrEqual(bounds.max[keys[k]] + 0.01);
    }

    // SAT per pezzo (ZIP): ogni file valido.
    const zip = exportSat(assembly.pieces, results, { date, fileMode: "un-file-per-pezzo" });
    expect(zip.files).toHaveLength(assembly.pieces.length);
    for (const f of zip.files) expect(validateSat(f.text).errors, f.name).toEqual([]);

    // STEP dai solidi in cache.
    const builds = kernel.stats.builds;
    await kernel.handle({ kind: "export-step", id: 2, pieces });
    expect(kernel.stats.builds).toBe(builds);
    const res = messages.at(-1)!;
    expect(res.kind).toBe("step-result");
    if (res.kind !== "step-result") return;
    expect(res.errors).toEqual([]);
    const step = text(res.data);
    expect(step.split("MANIFOLD_SOLID_BREP").length - 1).toBe(assembly.pieces.length);
    for (const p of assembly.pieces) expect(step).toContain(`'${p.id}'`);

    expect(performance.now() - t0).toBeLessThan(60_000);
  });
});
