import { describe, expect, it } from "vitest";
import { aabb } from "./aabb";
import { identity, multiply, rotationZ, translation } from "./mat4";
import { obbAabbPenetration, obbFromAabb, obbFromPose, obbIntersectsAabb, obbIntersectsObb, obbObbPenetration, obbVertices } from "./obb";
import { equals, vec3 } from "./vec3";

describe("obb", () => {
  it("da posa e dimensioni: sezione centrata, X da 0 a lunghezza", () => {
    const o = obbFromPose(translation(vec3(100, 0, 0)), vec3(2400, 120, 240));
    expect(equals(o.center, vec3(1300, 0, 0))).toBe(true);
    expect(o.halfSize).toEqual(vec3(1200, 60, 120));
  });

  it("origine locale personalizzata", () => {
    const o = obbFromPose(identity(), vec3(10, 20, 30), vec3(0, 0, 0));
    expect(equals(o.center, vec3(5, 10, 15))).toBe(true);
  });

  it("8 vertici", () => {
    const o = obbFromPose(rotationZ(Math.PI / 2), vec3(10, 2, 2));
    const vs = obbVertices(o);
    expect(vs).toHaveLength(8);
    // ruotato di 90° attorno a Z: la lunghezza va lungo +Y
    expect(vs.some((v) => equals(v, vec3(1, 10, 1)))).toBe(true);
    expect(vs.some((v) => equals(v, vec3(-1, 0, -1)))).toBe(true);
  });

  it("box separati, in contatto e compenetranti (allineati)", () => {
    const o = obbFromPose(identity(), vec3(10, 10, 10), vec3(0, 0, 0));
    expect(obbIntersectsAabb(o, aabb(vec3(12, 0, 0), vec3(20, 10, 10)))).toBe(false);
    expect(obbAabbPenetration(o, aabb(vec3(12, 0, 0), vec3(20, 10, 10)))).toBeCloseTo(-2);
    expect(obbIntersectsAabb(o, aabb(vec3(10, 0, 0), vec3(20, 10, 10)))).toBe(false);
    expect(obbAabbPenetration(o, aabb(vec3(10, 0, 0), vec3(20, 10, 10)))).toBeCloseTo(0);
    expect(obbIntersectsAabb(o, aabb(vec3(7, 0, 0), vec3(20, 10, 10)))).toBe(true);
    expect(obbAabbPenetration(o, aabb(vec3(7, 0, 0), vec3(20, 10, 10)))).toBeCloseTo(3);
  });

  it("box ruotato di 45° interseca solo grazie alla rotazione", () => {
    // cubo 2×2×2 centrato nell'origine
    const local = vec3(-1, -1, -1);
    const target = aabb(vec3(1.2, -0.1, -1), vec3(3, 0.1, 1));
    const straight = obbFromPose(identity(), vec3(2, 2, 2), local);
    const rotated = obbFromPose(rotationZ(Math.PI / 4), vec3(2, 2, 2), local);
    expect(obbIntersectsAabb(straight, target)).toBe(false);
    expect(obbIntersectsAabb(rotated, target)).toBe(true);
    expect(obbAabbPenetration(rotated, target)).toBeCloseTo(Math.SQRT2 - 1.2, 6);
  });

  it("box ruotato che non interseca lungo un asse diagonale", () => {
    // cubo ruotato 45°, AABB vicino all'angolo "vuoto" tra due facce
    const rotated = obbFromPose(
      multiply(translation(vec3(0, 0, 0)), rotationZ(Math.PI / 4)),
      vec3(2, 2, 2),
      vec3(-1, -1, -1),
    );
    const corner = aabb(vec3(0.8, 0.8, -1), vec3(2, 2, 1));
    expect(obbIntersectsAabb(rotated, corner)).toBe(false);
  });

  it("OBB–OBB: con un box allineato coincide con OBB–AABB (15 assi)", () => {
    const o = obbFromPose(multiply(translation(vec3(3, 4, 0)), rotationZ(0.3)), vec3(10, 2, 3));
    for (const box of [aabb(vec3(0, 0, 0), vec3(5, 5, 5)), aabb(vec3(20, 0, 0), vec3(30, 5, 5)), aabb(vec3(-1, 4, -1), vec3(14, 6, 1))])
      expect(obbObbPenetration(o, obbFromAabb(box))).toBe(obbAabbPenetration(o, box));
  });

  it("OBB–OBB ruotati: separati lungo un asse di faccia ruotato, compenetranti e in contatto", () => {
    const a = obbFromPose(rotationZ(Math.PI / 4), vec3(10, 2, 2));
    // b: stesso orientamento, spostato di 3 lungo la normale locale Y di a (spessore 2 ⇒ separati di 1)
    const shift = vec3(-3 * Math.SQRT1_2, 3 * Math.SQRT1_2, 0);
    const b = obbFromPose(multiply(translation(shift), rotationZ(Math.PI / 4)), vec3(10, 2, 2));
    expect(obbObbPenetration(a, b)).toBeCloseTo(-1, 9);
    expect(obbIntersectsObb(a, b)).toBe(false);
    const c = obbFromPose(multiply(translation(vec3(-Math.SQRT1_2, Math.SQRT1_2, 0)), rotationZ(Math.PI / 4)), vec3(10, 2, 2));
    expect(obbObbPenetration(a, c)).toBeCloseTo(1, 9);
    expect(obbIntersectsObb(a, c)).toBe(true);
    const touch = obbFromPose(multiply(translation(vec3(-2 * Math.SQRT1_2, 2 * Math.SQRT1_2, 0)), rotationZ(Math.PI / 4)), vec3(10, 2, 2));
    expect(obbObbPenetration(a, touch)).toBeCloseTo(0, 9);
    expect(obbIntersectsObb(a, touch, 1e-6)).toBe(false);
  });
});
