import { beforeAll, describe, expect, it } from "vitest";
import { generate } from "@/domain";
import type { Machining } from "@/domain/components/types";
import { dot, norm, sub, vec3 } from "@/domain/math/vec3";
import {
  brepCounts,
  checkBrepTopology,
  loopNewellNormal,
  normalTowardsAxis,
  outwardNormal,
  type BrepCylinderFace,
  type BrepPlaneFace,
} from "../neutral-brep";
import { buildPieceSolid, type PieceSolidInput } from "./build-piece";
import { extractBrep } from "./extract-brep";
import { initOcct } from "./init";
import { nodeOcctFactory } from "./init-node";
import { meshShape, triangleArea } from "./mesh";

beforeAll(async () => {
  await initOcct({ factory: nodeOcctFactory });
});

const m = (spec: Record<string, unknown>): Machining => ({ id: "P-01-L01", pieceId: "P-01", ...spec }) as Machining;
const piece = (machinings: Machining[]): PieceSolidInput => ({
  id: "P-01",
  section: { b: 120, h: 200 },
  length: 2400,
  machinings,
});
const center = vec3(1200, 0, 0);

describe("extractBrep", () => {
  it("parallelepipedo → 6 facce piane, 12 spigoli, 8 vertici, normali esterne", () => {
    const brep = extractBrep(buildPieceSolid(piece([])));
    const c = brepCounts(brep);
    expect(c.faces).toEqual({ piana: 6, cilindrica: 0, altro: 0 });
    expect(c.edges).toEqual({ retta: 12, cerchio: 0, altro: 0 });
    expect(c.vertices).toBe(8);
    expect(c.coedges).toBe(24);
    expect(checkBrepTopology(brep)).toEqual([]);
    for (const f of brep.faces as BrepPlaneFace[]) {
      const n = outwardNormal(f);
      expect(norm(n)).toBeCloseTo(1, 9);
      // il centro del pezzo sta dal lato interno di ogni faccia
      const anyVertex = brep.vertices[brep.edges[f.loops[0].coedges[0].edge].start].point;
      expect(dot(sub(anyVertex, center), n)).toBeGreaterThan(0);
      // loop esterno antiorario visto dall'esterno
      expect(dot(loopNewellNormal(brep, f.loops[0]), n)).toBeGreaterThan(0);
    }
    const xs = brep.vertices.map((v) => v.point.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0, 9);
    expect(xs[7]).toBeCloseTo(2400, 9);
  });

  it("foro passante Ø12 → faccia cilindrica di raggio 6 con normale verso l'asse", () => {
    const brep = extractBrep(
      buildPieceSolid(piece([m({ type: "foro", face: "sinistra", at: 1000, diameter: 12, offset: 10 })])),
    );
    const c = brepCounts(brep);
    expect(c.faces).toEqual({ piana: 6, cilindrica: 1, altro: 0 });
    expect(c.edges.cerchio).toBe(2);
    expect(checkBrepTopology(brep)).toEqual([]);
    const cyl = brep.faces.find((f): f is BrepCylinderFace => f.kind === "cilindrica")!;
    expect(cyl.radius).toBeCloseTo(6, 9);
    expect(Math.abs(cyl.axis.y)).toBeCloseTo(1, 9);
    expect(cyl.origin.x).toBeCloseTo(1000, 6);
    expect(cyl.origin.z).toBeCloseTo(10, 6);
    expect(normalTowardsAxis(cyl)).toBe(true);
    // il cilindro ha una cucitura: spigolo usato due volte nello stesso loop
    const seam = brep.edges.filter((e) => e.seam);
    expect(seam).toHaveLength(1);
    expect(seam[0].kind).toBe("retta");
    // le facce forate hanno un loop esterno e uno interno (orario visto dall'esterno)
    const holed = (brep.faces.filter((f) => f.kind === "piana") as BrepPlaneFace[]).filter((f) => f.loops.length === 2);
    expect(holed).toHaveLength(2);
    for (const f of holed) {
      const inner = f.loops[1];
      const circle = brep.edges[inner.coedges[0].edge];
      expect(circle.kind).toBe("cerchio");
      if (circle.kind !== "cerchio") continue;
      // verso di percorrenza del cerchio rispetto alla normale esterna: orario ⇒ negativo
      const ccw = dot(circle.axis, outwardNormal(f)) * (inner.coedges[0].sense === "forward" ? 1 : -1);
      expect(ccw).toBeLessThan(0);
      expect(circle.t1).toBeGreaterThan(circle.t0);
    }
  });

  it("taglio di testa e becco d'uccello: B-rep topologicamente valida", () => {
    const brep = extractBrep(
      buildPieceSolid(
        piece([
          m({ type: "taglio-testa", face: "testa-inizio", at: 30, angle: 15 }),
          m({ id: "P-01-L02", type: "becco-uccello", face: "inferiore", at: 800, depth: 30, angle: 15 }),
        ]),
      ),
    );
    expect(checkBrepTopology(brep)).toEqual([]);
    expect(brepCounts(brep).faces.altro).toBe(0);
  });

  it.each(["addossata-monofalda", "autoportante-bifalda"])("pezzi di %s: B-rep valide, solo facce piane e cilindriche", (slug) => {
    for (const p of generate(slug).pieces) {
      const solid = buildPieceSolid(p);
      const brep = extractBrep(solid);
      expect(checkBrepTopology(brep), p.id).toEqual([]);
      expect(brepCounts(brep).faces.altro, p.id).toBe(0);
      solid.delete();
    }
  });
});

describe("meshShape", () => {
  it("mesh senza indici fuori range né triangoli degeneri, normali coerenti", () => {
    const solid = buildPieceSolid(
      piece([
        m({ type: "foro", face: "superiore", at: 500, diameter: 12, offset: 0 }),
        m({ id: "P-01-L02", type: "taglio-testa", face: "testa-fine", at: 2350, angle: 15 }),
      ]),
    );
    const mesh = meshShape(solid);
    const n = mesh.positions.length / 3;
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.indices.length).toBeGreaterThan(36);
    let outward = 0;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b, c] = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]];
      expect(Math.max(a, b, c)).toBeLessThan(n);
      expect(a !== b && b !== c && a !== c).toBe(true);
      expect(triangleArea(mesh.positions, a, b, c)).toBeGreaterThan(0);
      // il triangolo (antiorario) ha normale concorde con quella del vertice
      const p = mesh.positions;
      const u = vec3(p[3 * b] - p[3 * a], p[3 * b + 1] - p[3 * a + 1], p[3 * b + 2] - p[3 * a + 2]);
      const v = vec3(p[3 * c] - p[3 * a], p[3 * c + 1] - p[3 * a + 1], p[3 * c + 2] - p[3 * a + 2]);
      const tn = vec3(u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z, u.x * v.y - u.y * v.x);
      const vn = vec3(mesh.normals[3 * a], mesh.normals[3 * a + 1], mesh.normals[3 * a + 2]);
      if (dot(tn, vn) > 0) outward++;
    }
    expect(outward).toBe(mesh.indices.length / 3);
  });

  it("tolleranza più fine → più triangoli sul foro", () => {
    const solid = buildPieceSolid(piece([m({ type: "foro", face: "superiore", at: 500, diameter: 40, offset: 0 })]));
    const coarse = meshShape(solid, { tolerance: 2 });
    const fine = meshShape(solid, { tolerance: 0.05, angularTolerance: 0.1 });
    expect(fine.indices.length).toBeGreaterThan(coarse.indices.length);
  });
});
