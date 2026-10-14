import { describe, expect, it } from "vitest";
import { dot, vec3 } from "@/domain/math/vec3";
import { pieceBoxBrep } from "./neutral-brep-box";
import {
  NeutralBrepSchema,
  brepCounts,
  checkBrepTopology,
  loopNewellNormal,
  outwardNormal,
  type BrepPlaneFace,
} from "./neutral-brep";

describe("B-rep neutra", () => {
  const brep = pieceBoxBrep({ b: 120, h: 240 }, 3000);

  it("parallelepipedo puro TS: 6 facce piane, 12 spigoli, 8 vertici, 24 coedge", () => {
    const c = brepCounts(brep);
    expect(c.faces).toEqual({ piana: 6, cilindrica: 0, altro: 0 });
    expect(c.edges).toEqual({ retta: 12, cerchio: 0, altro: 0 });
    expect(c.vertices).toBe(8);
    expect(c.loops).toBe(6);
    expect(c.coedges).toBe(24);
    expect(NeutralBrepSchema.safeParse(brep).success).toBe(true);
    expect(checkBrepTopology(brep)).toEqual([]);
  });

  it("normali esterne e loop antiorari visti dall'esterno", () => {
    const center = vec3(1500, 0, 0);
    for (const f of brep.faces as BrepPlaneFace[]) {
      const n = outwardNormal(f);
      const toFace = vec3(f.origin.x - center.x, f.origin.y - center.y, f.origin.z - center.z);
      expect(dot(n, toFace)).toBeGreaterThan(0);
      expect(dot(loopNewellNormal(brep, f.loops[0]), n)).toBeGreaterThan(0);
    }
  });

  it("rileva riferimenti inesistenti e loop non chiusi", () => {
    const broken = { ...brep, edges: brep.edges.map((e, i) => (i === 0 ? { ...e, end: 99 } : e)) };
    expect(NeutralBrepSchema.safeParse(broken).success).toBe(false);
    const open = {
      ...brep,
      faces: brep.faces.map((f, i) => (i === 0 ? { ...f, loops: [{ coedges: f.loops[0].coedges.slice(0, 3) }] } : f)),
    };
    expect(checkBrepTopology(open).length).toBeGreaterThan(0);
  });
});
