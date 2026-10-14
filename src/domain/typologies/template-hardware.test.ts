import { describe, expect, it } from "vitest";
import { fromBasis } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { TemplateError, buildAssembly, type BuildStep, type TypologyTemplate } from "./template";

/**
 * "sandwich-test": 1 pilastro 90×90 e 2 tavole 45×120 che lo serrano, 2
 * bulloni passanti tavola–pilastro–tavola, staffa a bicchiere al piede e 3
 * viti conteggiate.
 */
const steps = (code = "staffa-terra-bicchiere-90"): BuildStep[] => {
  const yOff = 90 / 2 + 45 / 2;
  const plank = (ref: string, y: number): BuildStep => ({
    kind: "place",
    ref,
    type: "tavola",
    section: { b: 45, h: 120 },
    length: 1000,
    pose: fromBasis(vec3(-500, y, 2400 - 60), vec3(1, 0, 0), vec3(0, 0, 1)),
  });
  return [
    { kind: "place", ref: "pil", type: "pilastro", section: { b: 90, h: 90 }, length: 2400, pose: fromBasis(vec3(0, 0, 0), vec3(0, 0, 1), vec3(0, 1, 0)) },
    plank("tav-a", -yOff),
    plank("tav-b", yOff),
    ...[-30, 30].map(
      (offset): BuildStep => ({
        kind: "hardware",
        code: "bullone-passante",
        pieces: ["tav-a", "pil", "tav-b"],
        params: { face: "destra", at: 500, offset, diameter: 12 },
      }),
    ),
    { kind: "hardware", code, pieces: ["pil"] },
    { kind: "hardware", code: "vite-6x160", pieces: ["tav-a"], params: { count: 3 } },
  ];
};

const sandwichTest: TypologyTemplate = {
  slug: "sandwich-test",
  name: "Sandwich (test)",
  description: "Pilastro serrato tra due tavole con bulloni passanti.",
  category: "autoportante",
  tags: ["test"],
  params: [],
  build: () => steps(),
};

describe("step hardware dell'interprete", () => {
  it("2 bulloni su tavola–pilastro–tavola → 6 fori Ø13, 2 BUL con id deterministici", () => {
    const a = buildAssembly(sandwichTest);
    const holes = a.pieces.flatMap((p) => p.machinings.filter((m) => m.type === "foro"));
    expect(holes).toHaveLength(6);
    expect(holes.every((m) => m.type === "foro" && m.diameter === 13)).toBe(true);
    const bolts = a.hardware.filter((h) => h.kind === "bullone");
    expect(bolts.map((b) => [b.id, b.code])).toEqual([
      ["BUL-01", "bullone-m12x200"],
      ["BUL-02", "bullone-m12x200"],
    ]);
    expect(bolts[0].pieceIds).toEqual(["TAV-01", "PIL-01", "TAV-02"]);
    expect(holes.filter((m) => m.jointId === "BUL-02")).toHaveLength(3);
    expect(buildAssembly(sandwichTest)).toEqual(a);
  });

  it("staffa e viti accumulate e fuse: bicchiere + 4 viti 8×40, 3 viti 6×160", () => {
    const a = buildAssembly(sandwichTest);
    expect(a.hardware.map((h) => [h.id, h.code, h.quantity])).toEqual([
      ["BUL-01", "bullone-m12x200", 1],
      ["BUL-02", "bullone-m12x200", 1],
      ["STT-01", "staffa-terra-bicchiere-90", 1],
      ["VIT-01", "vite-8x40", 4],
      ["VIT-02", "vite-6x160", 3],
    ]);
  });

  it("lavorazioni della staffa applicate subito al pezzo (lama interna)", () => {
    const a = buildAssembly({ ...sandwichTest, build: () => steps("staffa-terra-lama-interna-90") });
    const pil = a.pieces.find((p) => p.id === "PIL-01")!;
    expect(pil.machinings.filter((m) => m.jointId === "STT-01").map((m) => m.type)).toEqual(["asola-lama", "foro", "foro"]);
    expect(a.hardware.find((h) => h.id === "STT-01")!.machiningIds).toHaveLength(3);
  });

  it("codice ignoto → TemplateError che cita il codice", () => {
    const t = { ...sandwichTest, build: () => steps("staffa-saldata") };
    expect(() => buildAssembly(t)).toThrow(TemplateError);
    expect(() => buildAssembly(t)).toThrow(/ferramenta fuori catalogo: "staffa-saldata"/);
  });

  it("errore di espansione → TemplateError con ferramenta e pezzi", () => {
    const t: TypologyTemplate = {
      ...sandwichTest,
      build: () => [
        ...steps().slice(0, 3),
        { kind: "hardware", code: "bullone-passante", pieces: ["tav-a", "pil", "tav-b"], params: { face: "destra", at: 900, offset: 0, diameter: 12 } },
      ],
    };
    expect(() => buildAssembly(t)).toThrow(/ferramenta bullone-passante su TAV-01, PIL-01, TAV-02:.*PIL-01 non è attraversato/);
  });
});
