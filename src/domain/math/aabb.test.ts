import { describe, expect, it } from "vitest";
import {
  aabb,
  aabbFromPoints,
  aabbIntersection,
  aabbIntersects,
  aabbPenetrationDepth,
  aabbSize,
  aabbUnion,
  containsBox,
  containsPoint,
} from "./aabb";
import { vec3 } from "./vec3";

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
  aabb(vec3(x0, y0, z0), vec3(x1, y1, z1));

describe("aabb", () => {
  it("da punti e dimensioni", () => {
    const b = aabbFromPoints([vec3(1, 5, -2), vec3(-3, 2, 4), vec3(0, 0, 0)]);
    expect(b).toEqual(box(-3, 0, -2, 1, 5, 4));
    expect(aabbSize(b)).toEqual(vec3(4, 5, 6));
    expect(() => aabbFromPoints([])).toThrow();
  });

  it("unione", () => {
    expect(aabbUnion(box(0, 0, 0, 1, 1, 1), box(2, -1, 0, 3, 0.5, 5))).toEqual(box(0, -1, 0, 3, 1, 5));
  });

  it("contiene punto e box con tolleranza", () => {
    const b = box(0, 0, 0, 10, 10, 10);
    expect(containsPoint(b, vec3(10, 5, 0))).toBe(true);
    expect(containsPoint(b, vec3(10 + 1e-7, 5, 0))).toBe(true);
    expect(containsPoint(b, vec3(10.5, 5, 0))).toBe(false);
    expect(containsPoint(b, vec3(10.5, 5, 0), 1)).toBe(true);
    expect(containsBox(b, box(1, 1, 1, 9, 9, 10))).toBe(true);
    expect(containsBox(b, box(1, 1, 1, 9, 9, 11))).toBe(false);
  });

  it("box separati: nessuna intersezione, profondità negativa", () => {
    const a = box(0, 0, 0, 10, 10, 10);
    const b = box(12, 0, 0, 20, 10, 10);
    expect(aabbIntersects(a, b)).toBe(false);
    expect(aabbIntersection(a, b)).toBeNull();
    expect(aabbPenetrationDepth(a, b)).toBeCloseTo(-2);
  });

  it("box in contatto: profondità 0, non compenetranti", () => {
    const a = box(0, 0, 0, 10, 10, 10);
    const b = box(10, 0, 0, 20, 10, 10);
    expect(aabbPenetrationDepth(a, b)).toBe(0);
    expect(aabbIntersects(a, b)).toBe(false);
  });

  it("box compenetranti: profondità attesa e intersezione", () => {
    const a = box(0, 0, 0, 10, 10, 10);
    const b = box(8, 3, -5, 20, 20, 4);
    expect(aabbIntersects(a, b)).toBe(true);
    expect(aabbPenetrationDepth(a, b)).toBeCloseTo(2);
    expect(aabbIntersection(a, b)).toEqual(box(8, 3, 0, 10, 10, 4));
  });
});
