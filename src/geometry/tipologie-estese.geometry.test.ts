import { beforeAll, describe, expect, it } from "vitest";
import { generate, getPreset, listTypologies, loadPreset, PRESET_CATALOG } from "@/domain";
import type { Assembly } from "@/domain/components/types";
import { pieceCacheKey } from "./cache";
import { toGeometryInput } from "./client";
import { createKernel } from "./kernel-core";
import { brepCounts, checkBrepTopology } from "./neutral-brep";
import { buildPieceSolid, isValidShape } from "./occt/build-piece";
import { extractBrep } from "./occt/extract-brep";
import { initOcct } from "./occt/init";
import { nodeOcctFactory } from "./occt/init-node";
import { meshShape } from "./occt/mesh";
import { BuildRequestSchema, type PieceResult, type WorkerMessage } from "./protocol";

/**
 * Costruzione completa nel kernel delle tipologie estese (task 8.5): ogni
 * pezzo è un solido valido, la B-rep neutra non ha facce/curve `altro` (il SAT
 * resta su piane e cilindriche) e la mesh non è vuota.
 */

beforeAll(async () => {
  await initOcct({ factory: nodeOcctFactory });
});

const presetAssembly = (id: string): Assembly => {
  const { typologySlug, params } = loadPreset(id);
  return generate(typologySlug, params);
};

/** Build del kernel come dal client: input serializzati e validati al confine del worker. */
async function kernelBuild(assembly: Assembly): Promise<PieceResult[]> {
  const messages: WorkerMessage[] = [];
  const kernel = createKernel({ factory: nodeOcctFactory, post: (m) => messages.push(m), yieldControl: async () => {} });
  const request = BuildRequestSchema.parse(
    JSON.parse(JSON.stringify({ kind: "build", id: 1, pieces: assembly.pieces.map(toGeometryInput) })),
  );
  await kernel.handle(request);
  kernel.clearCache();
  expect(messages.at(-1)).toMatchObject({ kind: "done", total: assembly.pieces.length });
  return messages.flatMap((m) => (m.kind === "piece-result" ? [m.result] : []));
}

describe("kernel: preset delle tipologie estese", () => {
  it.each([
    ["carport-5x3", "Carport arco 5×3"],
    ["gazebo-ottagonale-4000", "Gazebo ottagonale"],
  ])("%s: build di tutti i pezzi senza PieceBuildError, B-rep senza `altro`", async (id, name) => {
    expect(getPreset(id).name).toContain(name.split(" ")[0]);
    const assembly = presetAssembly(id);
    const results = await kernelBuild(assembly);
    expect(results).toHaveLength(assembly.pieces.length);
    expect(results.filter((r) => r.error).map((r) => r.error!.message)).toEqual([]);
    for (const r of results) {
      expect(r.mesh!.indices.length, r.pieceId).toBeGreaterThan(0);
      const c = brepCounts(r.brep!);
      expect(c.faces.altro, r.pieceId).toBe(0);
      expect(c.edges.altro, r.pieceId).toBe(0);
      expect(checkBrepTopology(r.brep!), r.pieceId).toEqual([]);
    }
    if (id === "carport-5x3") {
      const arcs = assembly.pieces.filter((p) => p.curve);
      expect(arcs.length).toBeGreaterThan(0);
      for (const a of arcs) {
        const r = results.find((x) => x.pieceId === a.id)!;
        // 2 cilindriche dell'arco + 1 per foro (bulloni della testa).
        const holes = a.machinings.filter((m) => m.type === "foro").length;
        expect(brepCounts(r.brep!).faces.cilindrica, a.id).toBe(2 + holes);
        expect(r.volume!, a.id).toBeLessThan(a.section.b * a.section.h * a.length);
        expect(r.volume!, a.id).toBeGreaterThan(0.95 * a.section.b * a.section.h * a.length);
      }
    }
  });
});

describe("kernel: tutte le tipologie e tutti i preset", () => {
  it("ogni pezzo (default delle 10 tipologie, varianti e 27 preset) è un solido valido con B-rep e mesh", () => {
    const sources: [string, () => Assembly][] = [
      ...listTypologies().map((t): [string, () => Assembly] => [t.slug, () => generate(t.slug)]),
      ...PRESET_CATALOG.map((p): [string, () => Assembly] => [`preset ${p.id}`, () => presetAssembly(p.id)]),
      ["portale-sandwich carpenteria", () => generate("portale-sandwich", { costruzione: "carpenteria" })],
      ["monofalda-scalare dardo", () => generate("monofalda-scalare", { giunzione: "dardo-di-giove" })],
      ["monofalda-scalare mezzo legno", () => generate("monofalda-scalare", { giunzione: "mezzo-legno", costruzione: "carpenteria" })],
      ["gazebo carpenteria", () => generate("gazebo-padiglione", { costruzione: "carpenteria", montantiIntermedi: 2, arcarecci: 600, grigliati: 2 })],
      ["gazebo 6 lati carpenteria", () => generate("gazebo-padiglione", { lati: "6", costruzione: "carpenteria" })],
      ["gazebo 8 lati bullonata", () => generate("gazebo-padiglione", { lati: "8", costruzione: "bullonata", arcarecci: 600 })],
      ["pensilina staffa 25°", () => generate("pensilina-sbalzo", { attacco: "staffa-inclinata-25" })],
    ];
    const outcome = new Map<string, string>();
    const failures: string[] = [];
    let pieces = 0;
    for (const [name, make] of sources) {
      const assembly = make();
      for (const p of assembly.pieces) {
        pieces++;
        const key = pieceCacheKey(p);
        let problem = outcome.get(key);
        if (problem === undefined) {
          try {
            const solid = buildPieceSolid(p);
            const brep = extractBrep(solid);
            const c = brepCounts(brep);
            const topo = checkBrepTopology(brep);
            problem = !isValidShape(solid)
              ? "solido non valido"
              : c.faces.altro || c.edges.altro
                ? `B-rep con altro ${JSON.stringify(c)}`
                : topo.length
                  ? topo[0]
                  : meshShape(solid).indices.length === 0
                    ? "mesh vuota"
                    : "";
            solid.delete();
          } catch (e) {
            problem = (e as Error).message;
          }
          outcome.set(key, problem);
        }
        if (problem) failures.push(`${name} ${p.id}: ${problem}`);
      }
    }
    expect(failures).toEqual([]);
    expect(pieces).toBeGreaterThan(700);
  }, 60_000);
});
