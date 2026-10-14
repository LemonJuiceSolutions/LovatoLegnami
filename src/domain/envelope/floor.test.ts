import { describe, expect, it } from "vitest";
import { floorFunction, floorHeightAt } from "./floor";
import { parseEnvelope } from "./types";

const env = (floor: Record<string, unknown> = {}) => parseEnvelope({ box: { width: 6000, depth: 3000, height: 3000 }, floor });

describe("quota del pavimento", () => {
  it("pavimento piano: 0 in ogni punto", () => {
    const e = env();
    for (const [x, y] of [[0, 0], [3000, 1500], [6000, 3000], [1234, 2777]]) expect(floorHeightAt(e, x, y)).toEqual({ value: 0, outside: false });
  });

  it("angoli anteriori 0 e posteriori −100: al centro −50", () => {
    const e = env({ corners: { backLeft: -100, backRight: -100 } });
    expect(floorHeightAt(e, 3000, 1500).value).toBeCloseTo(-50, 9);
    expect(floorHeightAt(e, 100, 0).value).toBeCloseTo(0, 9);
    expect(floorHeightAt(e, 100, 3000).value).toBeCloseTo(-100, 9);
  });

  it("punto aggiuntivo (3000, 1500, −30) rispettato esattamente (Delaunay)", () => {
    const e = env({ points: [{ x: 3000, y: 1500, z: -30 }] });
    expect(floorHeightAt(e, 3000, 1500).value).toBe(-30);
    expect(floorHeightAt(e, 0, 0).value).toBe(0);
    const mid = floorHeightAt(e, 1500, 750).value;
    expect(mid).toBeLessThan(0);
    expect(mid).toBeGreaterThan(-30);
  });

  it("fuori dal box: estrapolato dal bordo più vicino con avviso", () => {
    const e = env({ corners: { backLeft: -100, backRight: -100 } });
    const r = floorHeightAt(e, 3000, 3500);
    expect(r.value).toBeCloseTo(-100, 9);
    expect(r.outside).toBe(true);
    expect(r.warning).toMatch(/fuori dall'ingombro/);
    const withPoints = env({ points: [{ x: 3000, y: 1500, z: -30 }] });
    expect(floorHeightAt(withPoints, -200, 1500)).toMatchObject({ value: 0, outside: true });
  });

  it("floorFunction: stessa quota e avvisi raccolti", () => {
    const e = env({ points: [{ x: 3000, y: 1500, z: -30 }] });
    const warnings: string[] = [];
    const f = floorFunction(e, (w) => warnings.push(w));
    expect(f(3000, 1500)).toBe(-30);
    expect(warnings).toEqual([]);
    f(7000, 0);
    expect(warnings).toHaveLength(1);
  });
});
