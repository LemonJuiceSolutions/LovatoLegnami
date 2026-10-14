import { beforeAll, describe, expect, it } from "vitest";
import { generate } from "@/domain";
import type { Machining } from "@/domain/components/types";
import { identity } from "@/domain/math/mat4";
import { buildPieceSolid } from "@/geometry/occt/build-piece";
import { extractBrep } from "@/geometry/occt/extract-brep";
import { initOcct } from "@/geometry/occt/init";
import { nodeOcctFactory } from "@/geometry/occt/init-node";
import type { PieceResult } from "@/geometry/protocol";
import { exportSat, validateSat, writeSat } from ".";

beforeAll(async () => {
  await initOcct({ factory: nodeOcctFactory });
});

const date = new Date(2026, 9, 14, 9, 30, 0);

describe("SAT da solidi OCCT reali", () => {
  it("pezzo con due fori passanti → cone-surface e ellipse-curve, file valido", () => {
    const m = (id: string, at: number): Machining =>
      ({ id, pieceId: "PIL-01", type: "foro", face: "sinistra", at, diameter: 12, offset: 0 }) as Machining;
    const brep = extractBrep(
      buildPieceSolid({ id: "PIL-01", section: { b: 120, h: 120 }, length: 2400, machinings: [m("PIL-01-L01", 300), m("PIL-01-L02", 2100)] }),
    );
    const { text, errors } = writeSat([{ id: "PIL-01", brep, pose: identity() }], { date });
    expect(errors).toEqual([]);
    const v = validateSat(text);
    expect(v.errors).toEqual([]);
    expect(v.counts["cone-surface"]).toBe(2);
    expect(v.counts["ellipse-curve"]).toBe(4);
    expect(v.counts["straight-curve"]).toBe(12);
    expect(v.bodies[0].name).toBe("PIL-01");
  });

  it.each(["addossata-monofalda", "autoportante-bifalda"])("%s di default: tutti i pezzi lavorati in un file valido", (slug) => {
    const assembly = generate(slug);
    const results: PieceResult[] = assembly.pieces.map((p) => ({
      pieceId: p.id,
      cacheKey: p.id,
      pose: p.pose,
      brep: extractBrep(buildPieceSolid(p)),
    }));
    const out = exportSat(assembly.pieces, results, { date });
    expect(out.errors.map((e) => e.message)).toEqual([]);
    const v = validateSat(out.data as string);
    expect(v.errors).toEqual([]);
    expect(v.counts.body).toBe(assembly.pieces.length);
    expect(v.bodies.map((b) => b.name)).toEqual(assembly.pieces.map((p) => p.id));
  });
});
