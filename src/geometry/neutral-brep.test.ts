import { describe, expect, it } from "vitest";
import { add, cross, distance, dot, scale, sub, vec3, type Vec3 } from "@/domain/math/vec3";
import { arcBrep, pieceBoxBrep } from "./neutral-brep-box";
import {
  NeutralBrepSchema,
  brepCounts,
  checkBrepTopology,
  coedgeEnds,
  loopNewellNormal,
  normalTowardsAxis,
  outwardNormal,
  signedDistanceToPlane,
  type BrepCircleEdge,
  type BrepCylinderFace,
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

describe("B-rep neutra dell'arco (arcBrep)", () => {
  const [R, sweep] = [2400, 93];
  const theta = (sweep * Math.PI) / 180;
  const brep = arcBrep({ b: 90, h: 90 }, R, sweep);
  const center = vec3(0, 0, R);
  /** Distanza di un punto dall'asse del cilindro (∥ Y per il centro). */
  const fromAxis = (p: Vec3) => Math.hypot(p.x - center.x, p.z - center.z);
  /** Normale esterna "media" di una faccia: punto medio dei vertici del loop. */
  const loopPoints = (f: (typeof brep.faces)[number]) =>
    f.loops[0].coedges.map((c) => brep.vertices[coedgeEnds(brep, c).from].point);

  it("8 vertici, 12 spigoli (4 cerchi con t0 < t1, 8 rette), 6 facce (2 cilindriche), topologia valida", () => {
    const c = brepCounts(brep);
    expect(c.vertices).toBe(8);
    expect(c.edges).toEqual({ retta: 8, cerchio: 4, altro: 0 });
    expect(c.faces).toEqual({ piana: 4, cilindrica: 2, altro: 0 });
    expect(c.loops).toBe(6);
    expect(c.coedges).toBe(24);
    expect(NeutralBrepSchema.safeParse(brep).success).toBe(true);
    expect(checkBrepTopology(brep)).toEqual([]);
    for (const e of brep.edges) expect(e.t1).toBeGreaterThan(e.t0);
  });

  it("geometria coerente: estremi dei cerchi su P(t0)/P(t1), vertici sulle superfici delle facce", () => {
    for (const e of brep.edges.filter((x): x is BrepCircleEdge => x.kind === "cerchio")) {
      expect(dot(cross(e.axis, e.xAxis), e.yAxis)).toBeCloseTo(1, 12);
      const P = (t: number) => add(e.center, scale(add(scale(e.xAxis, Math.cos(t)), scale(e.yAxis, Math.sin(t))), e.radius));
      expect(distance(P(e.t0), brep.vertices[e.start].point)).toBeLessThan(1e-9);
      expect(distance(P(e.t1), brep.vertices[e.end].point)).toBeLessThan(1e-9);
      expect(e.t1).toBeCloseTo(theta, 12);
    }
    for (const e of brep.edges)
      if (e.kind === "retta")
        expect(distance(add(e.origin, scale(e.direction, e.t1)), brep.vertices[e.end].point)).toBeLessThan(1e-9);
    for (const f of brep.faces) {
      for (const p of loopPoints(f)) {
        if (f.kind === "piana") expect(Math.abs(signedDistanceToPlane(f, p))).toBeLessThan(1e-9);
        if (f.kind === "cilindrica") expect(fromAxis(p)).toBeCloseTo(f.radius, 9);
      }
    }
    // Il piede è nell'origine, sezione centrata; la testa finale sul punto dell'arco a sviluppo R·θ.
    const xs = brep.vertices.map((v) => v.point.x);
    expect(Math.min(...xs)).toBeCloseTo(0, 9);
  });

  it("normali esterne coerenti: estradosso lontano dall'asse, intradosso verso l'asse (reversed), loop antiorari dall'esterno", () => {
    const cyl = brep.faces.filter((f): f is BrepCylinderFace => f.kind === "cilindrica").sort((a, b) => a.radius - b.radius);
    expect(cyl.map((f) => f.radius)).toEqual([2355, 2445]);
    expect(cyl[0].sense).toBe("reversed");
    expect(normalTowardsAxis(cyl[0])).toBe(true);
    expect(normalTowardsAxis(cyl[1])).toBe(false);
    // Punto interno del solido: sull'asse del pezzo a metà sviluppo.
    const mid = add(center, scale(vec3(Math.sin(theta / 2), 0, -Math.cos(theta / 2)), R));
    for (const f of brep.faces) {
      const pts = loopPoints(f);
      let c = scale(pts.reduce(add, vec3(0, 0, 0)), 1 / pts.length);
      let n: Vec3;
      if (f.kind === "piana") n = outwardNormal(f);
      else if (f.kind === "cilindrica") {
        // Il baricentro dei vertici sta sulla corda: si riporta sulla superficie.
        const r = sub(c, center);
        const radial = scale(vec3(r.x, 0, r.z), 1 / Math.hypot(r.x, r.z));
        c = add(vec3(center.x, c.y, center.z), scale(radial, f.radius));
        n = normalTowardsAxis(f) ? scale(radial, -1) : radial;
      } else throw new Error("faccia inattesa");
      // La normale esterna punta lontano dal materiale…
      expect(dot(n, sub(c, mid))).toBeGreaterThan(0);
      // …e il loop (poligono dei vertici, sweep < 180°) gira in senso antiorario attorno a essa.
      expect(dot(loopNewellNormal(brep, f.loops[0]), n)).toBeGreaterThan(0);
    }
  });
});

