import { describe, expect, it } from "vitest";
import { applyToPoint, multiply, rotationX, rotationZ, translation } from "./mat4";
import { GeometryError, intersectLinePlane, plane, planeFromPoints, signedDistance, transformPlane } from "./plane";
import { equals, vec3 } from "./vec3";

describe("piani", () => {
  it("distanza con segno su un piano noto", () => {
    const pl = plane(vec3(0, 0, 100), vec3(0, 0, 5));
    expect(pl.normal).toEqual(vec3(0, 0, 1));
    expect(signedDistance(pl, vec3(3, 4, 130))).toBeCloseTo(30);
    expect(signedDistance(pl, vec3(-7, 2, 40))).toBeCloseTo(-60);
  });

  it("piano per tre punti: normale destrorsa; punti allineati → errore", () => {
    const pl = planeFromPoints(vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0));
    expect(equals(pl.normal, vec3(0, 0, 1))).toBe(true);
    expect(() => planeFromPoints(vec3(0, 0, 0), vec3(1, 1, 1), vec3(2, 2, 2))).toThrow(GeometryError);
  });

  it("intersezione retta–piano e retta parallela → errore", () => {
    const wall = plane(vec3(0, 3000, 0), vec3(0, 1, 0));
    const hit = intersectLinePlane(vec3(100, 0, 2500), vec3(0, 2, 1), wall);
    expect(hit.t).toBeCloseTo(1500);
    expect(equals(hit.point, vec3(100, 3000, 4000))).toBe(true);
    expect(() => intersectLinePlane(vec3(0, 0, 0), vec3(1, 0, 0.5), wall)).toThrow(/parallela/);
  });

  it("la trasformazione rigida del piano conserva le distanze", () => {
    const pl = planeFromPoints(vec3(10, 0, 0), vec3(0, 20, 0), vec3(0, 0, 30));
    const m = multiply(translation(vec3(500, -200, 75)), multiply(rotationZ(0.7), rotationX(-0.3)));
    const moved = transformPlane(m, pl);
    for (const p of [vec3(1, 2, 3), vec3(-40, 17, 90), vec3(1000, 0, -5)])
      expect(signedDistance(moved, applyToPoint(m, p))).toBeCloseTo(signedDistance(pl, p), 9);
  });
});
