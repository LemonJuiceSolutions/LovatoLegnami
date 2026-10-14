import { describe, expect, it } from "vitest";
import { delaunay, interpolateAt, triangulate } from "./delaunay";
import { vec3 } from "./vec3";

const corners = (z00: number, z10: number, z01: number, z11: number) => [
  vec3(0, 0, z00),
  vec3(6000, 0, z10),
  vec3(0, 3000, z01),
  vec3(6000, 3000, z11),
];

describe("delaunay (Bowyer–Watson)", () => {
  it("4 angoli → 2 triangoli; con un punto interno → 4", () => {
    expect(delaunay(corners(0, 0, 0, 0).map(({ x, y }) => ({ x, y })))).toHaveLength(2);
    expect(delaunay([...corners(0, 0, 0, 0), vec3(3000, 1500, 0)])).toHaveLength(4);
  });

  it("proprietà di Delaunay: nessun punto dentro un cerchio circoscritto", () => {
    const pts = [
      ...corners(0, 0, 0, 0),
      vec3(1000, 700, 0),
      vec3(4200, 2100, 0),
      vec3(2500, 2900, 0),
      vec3(5500, 400, 0),
    ];
    const tris = delaunay(pts);
    for (const [a, b, c] of tris) {
      const [A, B, C] = [pts[a], pts[b], pts[c]];
      const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
      const ux = ((A.x ** 2 + A.y ** 2) * (B.y - C.y) + (B.x ** 2 + B.y ** 2) * (C.y - A.y) + (C.x ** 2 + C.y ** 2) * (A.y - B.y)) / d;
      const uy = ((A.x ** 2 + A.y ** 2) * (C.x - B.x) + (B.x ** 2 + B.y ** 2) * (A.x - C.x) + (C.x ** 2 + C.y ** 2) * (B.x - A.x)) / d;
      const r = Math.hypot(A.x - ux, A.y - uy);
      pts.forEach((p, i) => {
        if (i === a || i === b || i === c) return;
        expect(Math.hypot(p.x - ux, p.y - uy)).toBeGreaterThanOrEqual(r - 1e-6);
      });
    }
  });

  it("piano → valore costante", () => {
    const t = triangulate(corners(0, 0, 0, 0));
    expect(interpolateAt(t, 1234, 2345)).toEqual({ value: 0, outside: false });
  });

  it("pendenza → −50 al centro", () => {
    const t = triangulate(corners(0, 0, -100, -100));
    expect(interpolateAt(t, 3000, 1500).value).toBeCloseTo(-50, 9);
  });

  it("punto extra rispettato esattamente", () => {
    const t = triangulate([...corners(0, 0, 0, 0), vec3(3000, 1500, -30)]);
    expect(interpolateAt(t, 3000, 1500)).toEqual({ value: -30, outside: false });
    expect(interpolateAt(t, 1500, 750).value).toBeCloseTo(-15, 9);
  });

  it("punto fuori dall'involucro → estrapolazione dal bordo con outside: true", () => {
    const t = triangulate(corners(0, 0, -100, -100));
    const r = interpolateAt(t, 3000, 3500);
    expect(r.outside).toBe(true);
    expect(r.value).toBeCloseTo(-100, 9);
    const side = interpolateAt(t, 7000, 1500);
    expect(side.outside).toBe(true);
    expect(side.value).toBeCloseTo(-50, 9);
  });

  it("deterministico e robusto a punti duplicati; errore se < 3 punti non allineati", () => {
    const pts = [...corners(0, 0, 0, 0), vec3(3000, 1500, -30)];
    expect(triangulate(pts).triangles).toEqual(triangulate(pts).triangles);
    const dup = triangulate([...pts, vec3(3000, 1500, -30)]);
    expect(interpolateAt(dup, 3000, 1500).value).toBe(-30);
    expect(() => triangulate([vec3(0, 0, 0), vec3(1, 1, 0), vec3(2, 2, 0)])).toThrow();
    expect(() => triangulate([vec3(0, 0, 0), vec3(1, 1, 0)])).toThrow();
  });
});
