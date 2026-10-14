import { describe, expect, it } from "vitest";
import {
  EPS,
  add,
  cross,
  distance,
  dot,
  equals,
  neg,
  norm,
  normalize,
  scale,
  sub,
  vec3,
} from "./vec3";

describe("vec3", () => {
  it("somma, sottrazione, scala, negazione", () => {
    expect(add(vec3(1, 2, 3), vec3(4, 5, 6))).toEqual({ x: 5, y: 7, z: 9 });
    expect(sub(vec3(4, 5, 6), vec3(1, 2, 3))).toEqual({ x: 3, y: 3, z: 3 });
    expect(scale(vec3(1, -2, 3), 2)).toEqual({ x: 2, y: -4, z: 6 });
    expect(neg(vec3(1, -2, 0))).toEqual({ x: -1, y: 2, z: -0 });
  });

  it("prodotto scalare e vettoriale", () => {
    expect(dot(vec3(1, 2, 3), vec3(4, -5, 6))).toBe(12);
    expect(cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual({ x: 0, y: 0, z: 1 });
    expect(cross(vec3(0, 1, 0), vec3(0, 0, 1))).toEqual({ x: 1, y: 0, z: 0 });
  });

  it("norma, normalizzazione, distanza", () => {
    expect(norm(vec3(3, 4, 0))).toBe(5);
    expect(norm(normalize(vec3(10, -3, 7)))).toBeCloseTo(1, 12);
    expect(distance(vec3(1, 1, 1), vec3(4, 5, 1))).toBe(5);
    expect(() => normalize(vec3(0, 0, 0))).toThrow();
  });

  it("uguaglianza con tolleranza 1e-6", () => {
    expect(EPS).toBe(1e-6);
    expect(equals(vec3(1, 2, 3), vec3(1 + 5e-7, 2, 3 - 5e-7))).toBe(true);
    expect(equals(vec3(1, 2, 3), vec3(1 + 2e-6, 2, 3))).toBe(false);
    expect(equals(vec3(1, 2, 3), vec3(1.1, 2, 3), 0.2)).toBe(true);
  });
});
