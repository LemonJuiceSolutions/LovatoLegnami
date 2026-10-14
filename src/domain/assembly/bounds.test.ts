import { describe, expect, it } from "vitest";
import { createPiece } from "../components/schemas";
import type { Assembly } from "../components/types";
import { fromBasis, translation } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { assemblyBounds, maxHeight, minClearHeight, pieceAabb } from "./bounds";

/** Portale fittizio: 2 pilastri 120×120 alti 2400, trave 120×240 lunga 3000 sopra. */
function portale(): Assembly {
  const pil = (id: string, x: number) =>
    createPiece({ id, type: "pilastro", section: { b: 120, h: 120 }, length: 2400, pose: fromBasis(vec3(x, 0, 0), vec3(0, 0, 1), vec3(0, 1, 0)) });
  return {
    typologySlug: "test",
    params: {},
    pieces: [
      pil("PIL-01", 60),
      pil("PIL-02", 2940),
      createPiece({ id: "TRV-01", type: "trave", section: { b: 120, h: 240 }, length: 3000, pose: translation(vec3(0, 0, 2520)) }),
    ],
    joints: [],
    meta: {},
  };
}

describe("bounding box dell'assieme", () => {
  it("AABB di un pilastro verticale", () => {
    const b = pieceAabb(portale().pieces[0]);
    expect(b.min.x).toBeCloseTo(0, 9);
    expect(b.max.x).toBeCloseTo(120, 9);
    expect(b.min.y).toBeCloseTo(-60, 9);
    expect(b.max.y).toBeCloseTo(60, 9);
    expect(b.min.z).toBeCloseTo(0, 9);
    expect(b.max.z).toBeCloseTo(2400, 9);
  });

  it("AABB dell'assieme = unione dei pezzi", () => {
    const b = assemblyBounds(portale())!;
    expect(b.min.x).toBeCloseTo(0, 9);
    expect(b.max.x).toBeCloseTo(3000, 9);
    expect(b.min.y).toBeCloseTo(-60, 9);
    expect(b.max.y).toBeCloseTo(60, 9);
    expect(b.min.z).toBeCloseTo(0, 9);
    expect(b.max.z).toBeCloseTo(2640, 9);
    expect(maxHeight(portale())).toBeCloseTo(2640, 9);
    expect(assemblyBounds({ pieces: [] })).toBeUndefined();
  });

  it("altezza libera minima sotto la trave, esclusi i pilastri", () => {
    expect(minClearHeight(portale())).toEqual({ value: expect.closeTo(2400, 9), pieceId: "TRV-01" });
  });

  it("altezza libera con pavimento non piano", () => {
    // pavimento che sale verso destra: +10 mm ogni metro
    const h = minClearHeight(portale(), { floorHeightAt: (x) => x / 100 })!;
    expect(h.value).toBeCloseTo(2400 - 30, 9);
  });

  it("nessun pezzo di copertura → undefined", () => {
    const a = portale();
    expect(minClearHeight({ pieces: a.pieces.slice(0, 2) })).toBeUndefined();
  });
});
