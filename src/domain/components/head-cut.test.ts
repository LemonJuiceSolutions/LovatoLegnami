import { describe, expect, it } from "vitest";
import { degToRad, fromBasis, multiply, rotationY, translation } from "../math/mat4";
import { GeometryError, plane, signedDistance } from "../math/plane";
import { cross, norm, normalize, vec3 } from "../math/vec3";
import { headCutFromPlane, planeOfHeadCut } from "./head-cut";
import { createMachining } from "./machinings";
import { createPiece } from "./schemas";

describe("taglio composto da un piano (1.7)", () => {
  it("trave inclinata di 12° contro un muro verticale → angle 12, angle2 0, at sull'asse", () => {
    const pose = multiply(translation(vec3(0, 500, 2400)), rotationY(degToRad(-12)));
    const trave = createPiece({ id: "TRV-01", type: "trave", section: { b: 45, h: 145 }, length: 3200, pose });
    const wall = plane(vec3(3000, 0, 0), vec3(1, 0, 0));
    const spec = headCutFromPlane(trave, wall, "testa-fine");
    expect(spec.angle).toBeCloseTo(12, 9);
    expect(spec.angle2 ?? 0).toBe(0);
    expect(spec.at).toBeCloseTo(3000 / Math.cos(degToRad(12)), 9);
    // la lavorazione è applicabile e il piano ricostruito è il muro
    expect(createMachining(trave, spec).type).toBe("taglio-testa");
    const back = planeOfHeadCut(trave, spec);
    expect(norm(cross(back.normal, wall.normal))).toBeLessThan(1e-9);
    expect(signedDistance(wall, back.point)).toBeCloseTo(0, 9);
  });

  it("cantonale a 45° in pianta e 18,5° di pendenza contro la faccia verticale del monaco → taglio composto", () => {
    const a = degToRad(18.5);
    const x = vec3(Math.cos(Math.PI / 4) * Math.cos(a), Math.sin(Math.PI / 4) * Math.cos(a), Math.sin(a));
    const y = normalize(cross(vec3(0, 0, 1), x));
    const z = cross(x, y);
    const cantonale = createPiece({ id: "CAN-01", type: "cantonale", section: { b: 70, h: 70 }, length: 2400, pose: fromBasis(vec3(0, 0, 2500), x, z) });
    // monaco quadrato 120×120 centrato in (1600, 1600): faccia rivolta verso −X
    const face = plane(vec3(1540, 1600, 3000), vec3(-1, 0, 0));
    const spec = headCutFromPlane(cantonale, face, "testa-fine");
    expect(Math.abs(spec.angle)).toBeGreaterThan(1);
    expect(Math.abs(spec.angle2 ?? 0)).toBeGreaterThan(1);
    expect(createMachining(cantonale, spec).type).toBe("taglio-testa");
    const back = planeOfHeadCut(cantonale, spec);
    expect(norm(cross(back.normal, face.normal))).toBeLessThan(1e-6);
    expect(Math.abs(signedDistance(face, back.point))).toBeLessThan(1e-6);
    for (const q of [vec3(1540, 1500, 2800), vec3(1540, 1700, 3100)]) expect(Math.abs(signedDistance(back, q))).toBeLessThan(1e-6);
    // il materiale rimosso è oltre la faccia del monaco (verso la testa)
    expect(back.normal.x).toBeGreaterThan(0);
  });

  it("piano parallelo all'asse → errore esplicito", () => {
    const trave = createPiece({ id: "TRV-01", type: "trave", section: { b: 45, h: 145 }, length: 3200, pose: translation(vec3(0, 0, 0)) });
    expect(() => headCutFromPlane(trave, plane(vec3(0, 200, 0), vec3(0, 1, 0)), "testa-fine")).toThrow(GeometryError);
    expect(() => headCutFromPlane(trave, plane(vec3(0, 0, 500), vec3(0, 0.6, 0.8)), "testa-inizio")).toThrow(/parallelo all'asse/);
  });

  it("testa iniziale: normale ricostruita verso la testa", () => {
    const trave = createPiece({ id: "TRV-01", type: "trave", section: { b: 45, h: 145 }, length: 3200, pose: translation(vec3(-100, 0, 0)) });
    const spec = headCutFromPlane(trave, plane(vec3(0, 0, 0), vec3(1, 0, 0.2)), "testa-inizio");
    expect(spec.at).toBeCloseTo(100, 9);
    expect(planeOfHeadCut(trave, spec).normal.x).toBeLessThan(0);
  });
});

describe("taglio radiale sui pezzi curvi (5.2)", () => {
  const R = 1000;
  const arco = createPiece({
    id: "ARC-01",
    type: "arco",
    section: { b: 90, h: 90 },
    length: (R * Math.PI) / 2,
    pose: translation(vec3(0, 0, 0)),
    curve: { radius: R, sweep: 90 },
  });

  it("piano verticale x = 500 su arco R1000 90° → at = R·30°, angle 30, nessun angle2, piano ricostruito", () => {
    const pl = plane(vec3(500, 0, 0), vec3(1, 0, 0));
    const spec = headCutFromPlane(arco, pl, "testa-inizio");
    expect(spec.at).toBeCloseTo((R * Math.PI) / 6, 9);
    expect(spec.angle).toBeCloseTo(30, 9);
    expect(spec.angle2).toBeUndefined();
    expect(createMachining(arco, spec).type).toBe("taglio-testa");
    const back = planeOfHeadCut(arco, spec);
    expect(norm(cross(back.normal, pl.normal))).toBeLessThan(1e-9);
    expect(Math.abs(signedDistance(pl, back.point))).toBeLessThan(1e-9);
  });

  it("piano che non contiene Y → errore (taglio obliquo non ammesso sui curvi)", () => {
    expect(() => headCutFromPlane(arco, plane(vec3(500, 0, 0), normalize(vec3(1, 0.3, 0))), "testa-fine")).toThrow(GeometryError);
  });
});
