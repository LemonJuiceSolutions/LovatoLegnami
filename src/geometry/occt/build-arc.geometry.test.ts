import { beforeAll, describe, expect, it } from "vitest";
import { measureVolume } from "replicad";
import { curveLength } from "@/domain/components/schemas";
import { headCutFromPlane, planeOfHeadCut } from "@/domain/components/head-cut";
import type { Machining } from "@/domain/components/types";
import { arcFrame, arcNormal, arcPoint, arcTangent } from "@/domain/math/arc";
import { identity } from "@/domain/math/mat4";
import { plane, signedDistance } from "@/domain/math/plane";
import { add, cross, dot, normalize, scale, sub, vec3 } from "@/domain/math/vec3";
import {
  brepCounts,
  checkBrepTopology,
  coedgeEnds,
  normalTowardsAxis,
  outwardNormal,
  type BrepCylinderFace,
  type BrepPlaneFace,
  type NeutralBrep,
} from "../neutral-brep";
import { PieceBuildError, buildPieceSolid, isValidShape, type PieceSolidInput } from "./build-piece";
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

const deg = (a: number): number => (a * Math.PI) / 180;

/** Vertici del loop esterno di una faccia. */
const faceVertices = (brep: NeutralBrep, f: NeutralBrep["faces"][number]) =>
  f.loops[0].coedges.map((c) => brep.vertices[coedgeEnds(brep, c).from].point);

describe("pezzi curvi (E6): lavorazioni", () => {
  it("2 fori Ø9 a 100 e 200 dalla testa finale → 2 cilindriche e 4 cerchi in più, assi ∥ Y sui punti dell'arco", () => {
    const solid = buildPieceSolid(
      arc([
        m(1, { type: "foro", face: "sinistra", at: L - 100, diameter: 9, offset: 0 }),
        m(2, { type: "foro", face: "destra", at: L - 200, diameter: 9, offset: 20 }),
      ]),
    );
    expect(isValidShape(solid)).toBe(true);
    expect(measureVolume(solid)).toBeCloseTo(90 * 90 * L - 2 * Math.PI * 4.5 ** 2 * 90, 0);
    const brep = extractBrep(solid);
    expect(checkBrepTopology(brep)).toEqual([]);
    const c = brepCounts(brep);
    expect(c.faces).toEqual({ piana: 4, cilindrica: 4, altro: 0 });
    // + 2 rette di cucitura delle superfici dei fori (come sui pezzi dritti).
    expect(c.edges).toEqual({ retta: 10, cerchio: 8, altro: 0 });
    expect(brep.edges.filter((e) => e.seam).map((e) => e.kind)).toEqual(["retta", "retta"]);
    const holes = brep.faces.filter((f): f is BrepCylinderFace => f.kind === "cilindrica" && f.radius < 10);
    expect(holes).toHaveLength(2);
    for (const h of holes) {
      expect(normalTowardsAxis(h)).toBe(true);
      expect(Math.abs(h.axis.y)).toBeCloseTo(1, 9);
    }
    // Centri attesi: punto dell'arco in `at` spostato di `offset` lungo la normale radiale (verso il centro).
    const expected = [
      arcPoint(curve.radius, L - 100),
      add(arcPoint(curve.radius, L - 200), scale(arcNormal(curve.radius, L - 200), 20)),
    ];
    for (const p of expected) {
      const hit = holes.some((h) => {
        const d = sub(p, h.origin);
        return Math.hypot(d.x, d.z) < 1e-6;
      });
      expect(hit, JSON.stringify(p)).toBe(true);
    }
    solid.delete();
  });

  it("taglio di testa radiale a 10° → testa piana con 4 rette, sul piano di planeOfHeadCut", () => {
    const at = L - 10;
    const cut = m(1, { type: "taglio-testa", face: "testa-fine", at, angle: 10 });
    const solid = buildPieceSolid(arc([cut]));
    expect(isValidShape(solid)).toBe(true);
    const brep = extractBrep(solid);
    expect(checkBrepTopology(brep)).toEqual([]);
    const c = brepCounts(brep);
    expect(c.faces).toEqual({ piana: 4, cilindrica: 2, altro: 0 });
    expect(c.edges).toEqual({ retta: 8, cerchio: 4, altro: 0 });
    // Normale attesa nel sistema della sezione in `at`: ∝ (1, 0, −tan 10°).
    const n = normalize(sub(arcTangent(curve.radius, at), scale(arcNormal(curve.radius, at), Math.tan(deg(10)))));
    const head = brep.faces.find((f): f is BrepPlaneFace => f.kind === "piana" && dot(outwardNormal(f), n) > 0.999)!;
    expect(head).toBeDefined();
    const edges = head.loops[0].coedges.map((ce) => brep.edges[ce.edge].kind);
    expect(edges).toEqual(["retta", "retta", "retta", "retta"]);
    const pl = planeOfHeadCut({ pose: identity(), curve }, { at, angle: 10, face: "testa-fine" });
    for (const v of faceVertices(brep, head)) expect(Math.abs(signedDistance(pl, v))).toBeLessThan(1e-6);
    solid.delete();
  });

  it("taglio da un piano (headCutFromPlane) sulla testa iniziale: la faccia del kernel giace sul piano", () => {
    // Piano verticale (contiene Y) vicino al piede, inclinato rispetto alla sezione.
    const pl = plane(vec3(30, 0, 0), normalize(vec3(-1, 0, 0.1)));
    const spec = headCutFromPlane({ pose: identity(), length: L, curve }, pl, "testa-inizio");
    expect(spec.angle2).toBeUndefined();
    const solid = buildPieceSolid(arc([m(1, spec as Record<string, unknown>)]));
    expect(isValidShape(solid)).toBe(true);
    const brep = extractBrep(solid);
    expect(brepCounts(brep).faces.altro).toBe(0);
    const head = brep.faces.find(
      (f): f is BrepPlaneFace => f.kind === "piana" && Math.abs(Math.abs(dot(outwardNormal(f), pl.normal)) - 1) < 1e-9,
    )!;
    expect(head).toBeDefined();
    for (const v of faceVertices(brep, head)) expect(Math.abs(signedDistance(pl, v))).toBeLessThan(1e-6);
    solid.delete();
  });

  it("utensili coerenti con arcFrame: il foro con offset sta alla distanza R − offset dal centro", () => {
    const frame = arcFrame(curve.radius, 500);
    const zAxis = vec3(frame[2], frame[6], frame[10]);
    expect(dot(zAxis, arcNormal(curve.radius, 500))).toBeCloseTo(1, 12);
    expect(dot(cross(arcTangent(curve.radius, 500), vec3(0, 1, 0)), zAxis)).toBeCloseTo(1, 12);
  });

  it.each([
    ["mezzo-legno", { type: "mezzo-legno", face: "superiore", at: 500, width: 90, depth: 45 }],
    ["foro sulla faccia superiore", { type: "foro", face: "superiore", at: 500, diameter: 9, offset: 0 }],
    ["taglio con angle2", { type: "taglio-testa", face: "testa-fine", at: L - 10, angle: 10, angle2: 5 }],
  ])("%s su un pezzo curvo → PieceBuildError", (_, spec) => {
    expect(() => buildPieceSolid(arc([m(1, spec)]))).toThrowError(PieceBuildError);
    expect(() => buildPieceSolid(arc([m(1, spec)]))).toThrowError(/non ammessa su pezzi curvi/);
  });
});

