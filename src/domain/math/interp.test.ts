import { describe, expect, it } from "vitest";
import { bilinear } from "./interp";

const rect = { x0: 0, y0: 0, x1: 6000, y1: 3000 };

describe("interpolazione bilineare", () => {
  it("piano → valore costante", () => {
    const c = { ...rect, z00: 0, z10: 0, z01: 0, z11: 0 };
    for (const [x, y] of [[0, 0], [1234, 567], [6000, 3000], [3000, 1500]]) {
      expect(bilinear(c, x, y)).toEqual({ value: 0, outside: false });
    }
  });

  it("pendenza fronte→retro → −50 al centro", () => {
    const c = { ...rect, z00: 0, z10: 0, z01: -100, z11: -100 };
    expect(bilinear(c, 3000, 1500).value).toBeCloseTo(-50, 9);
    expect(bilinear(c, 0, 3000).value).toBe(-100);
  });

  it("angoli rispettati e valore bilineare generico", () => {
    const c = { x0: 0, y0: 0, x1: 2, y1: 2, z00: 0, z10: 10, z01: 20, z11: 40 };
    expect(bilinear(c, 2, 0).value).toBe(10);
    expect(bilinear(c, 0, 2).value).toBe(20);
    expect(bilinear(c, 1, 1).value).toBeCloseTo(17.5, 9);
  });

  it("fuori dal rettangolo → valore del bordo più vicino con flag outside", () => {
    const c = { ...rect, z00: 0, z10: 0, z01: -100, z11: -100 };
    expect(bilinear(c, 3000, 4000)).toEqual({ value: -100, outside: true });
    expect(bilinear(c, -500, 1500).value).toBeCloseTo(-50, 9);
    expect(bilinear(c, -500, 1500).outside).toBe(true);
  });

  it("rettangolo degenere → errore", () => {
    expect(() => bilinear({ ...rect, x1: 0, z00: 0, z10: 0, z01: 0, z11: 0 }, 0, 0)).toThrow();
  });
});
