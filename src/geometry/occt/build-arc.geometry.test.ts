import { beforeAll, describe, expect, it } from "vitest";
import { measureVolume } from "replicad";
import { curveLength } from "@/domain/components/schemas";
import type { Machining } from "@/domain/components/types";
import { brepCounts, checkBrepTopology, normalTowardsAxis, type BrepCylinderFace } from "../neutral-brep";
import { buildPieceSolid, isValidShape, type PieceSolidInput } from "./build-piece";
import { extractBrep } from "./extract-brep";
import { initOcct } from "./init";
import { nodeOcctFactory } from "./init-node";
import { meshShape } from "./mesh";

beforeAll(async () => {
  await initOcct({ factory: nodeOcctFactory });
});

const curve = { radius: 2400, sweep: 93 };
const L = curveLength(curve);
const arc = (machinings: Machining[] = []): PieceSolidInput => ({
  id: "ARC-01",
  section: { b: 90, h: 90 },
  length: L,
  curve,
  machinings,
});
const m = (id: number, spec: Record<string, unknown>): Machining =>
  ({ id: `ARC-01-L0${id}`, pieceId: "ARC-01", ...spec }) as Machining;

describe("pezzi curvi (E6): solido di base per rivoluzione", () => {
  it("arco 90×90 R2400 93° → solido valido, volume b·h·sviluppo, B-rep 2 cilindriche + 4 piane, 4 cerchi + 8 rette", () => {
    expect(L).toBeCloseTo(3895.6, 0);
    const solid = buildPieceSolid(arc());
    expect(isValidShape(solid)).toBe(true);
    const volume = measureVolume(solid);
    expect(Math.abs(volume - 90 * 90 * 3895) / (90 * 90 * 3895)).toBeLessThan(1e-3);
    expect(volume).toBeCloseTo(90 * 90 * L, 0);

    // Orientamento (E1): parte in origine tangente a +X e curva verso +Z.
    const bb = solid.boundingBox.bounds;
    expect(bb[0][1]).toBeCloseTo(-45, 6);
    expect(bb[1][1]).toBeCloseTo(45, 6);
    expect(bb[0][2]).toBeCloseTo(-45, 3);
    expect(bb[1][0]).toBeCloseTo(2400 + 45, 3); // estradosso oltre 90°
    expect(bb[1][2]).toBeGreaterThan(2400);

    const brep = extractBrep(solid);
    expect(checkBrepTopology(brep)).toEqual([]);
    const c = brepCounts(brep);
    expect(c.faces).toEqual({ piana: 4, cilindrica: 2, altro: 0 });
    expect(c.edges).toEqual({ retta: 8, cerchio: 4, altro: 0 });
    expect(c.vertices).toBe(8);
    for (const e of brep.edges) expect(e.t1).toBeGreaterThan(e.t0);

    const cyl = brep.faces.filter((f): f is BrepCylinderFace => f.kind === "cilindrica");
    const byRadius = [...cyl].sort((a, b) => a.radius - b.radius);
    expect(byRadius.map((f) => f.radius)).toEqual([expect.closeTo(2355, 6), expect.closeTo(2445, 6)]);
    // Intradosso concavo (normale esterna verso l'asse), estradosso convesso.
    expect(normalTowardsAxis(byRadius[0])).toBe(true);
    expect(normalTowardsAxis(byRadius[1])).toBe(false);
    for (const f of cyl) {
      expect(Math.abs(f.axis.y)).toBeCloseTo(1, 9);
      expect(f.origin.x).toBeCloseTo(0, 6);
      expect(f.origin.z).toBeCloseTo(2400, 6);
    }

    const mesh = meshShape(solid);
    expect(mesh.indices.length).toBeGreaterThan(0);
    solid.delete();
  });
});
