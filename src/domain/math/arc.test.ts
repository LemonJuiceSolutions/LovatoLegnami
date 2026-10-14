import { describe, expect, it } from "vitest";
import { applyToPoint, axisOf } from "./mat4";
import { arcFrame, arcLength, arcNormal, arcPoint, arcSegments, arcTangent } from "./arc";
import { distance, dot, equals, norm, vec3 } from "./vec3";

describe("asse curvo", () => {
  it("arco R1000 90°: punto, tangente e normale a metà sviluppo (s = π·250, θ = 45°)", () => {
    // il task cita s = π·500, che per R1000 è l'intero sviluppo (θ = 90°): il punto atteso
    // (1000·sin 45°, 0, 1000·(1 − cos 45°)) corrisponde a metà sviluppo; l'estremo è verificato sotto
    expect(arcLength(1000, 90)).toBeCloseTo(Math.PI * 500, 9);
    expect(equals(arcPoint(1000, Math.PI * 500), vec3(1000, 0, 1000), 1e-9)).toBe(true);
    const s = Math.PI * 250;
    const c = Math.SQRT1_2;
    expect(equals(arcPoint(1000, s), vec3(1000 * c, 0, 1000 * (1 - c)), 1e-9)).toBe(true);
    const t = arcTangent(1000, s);
    expect(norm(t)).toBeCloseTo(1, 12);
    expect(equals(t, vec3(c, 0, c), 1e-12)).toBe(true);
    const n = arcNormal(1000, s);
    expect(dot(n, t)).toBeCloseTo(0, 12);
    // la normale punta verso il centro (0, 0, R)
    expect(distance(arcPoint(1000, s), vec3(0, 0, 1000))).toBeCloseTo(1000, 9);
    expect(equals(applyToPoint(arcFrame(1000, s), vec3(0, 0, 1000)), vec3(0, 0, 1000), 1e-9)).toBe(true);
  });

  it("in s = 0 parte dall'origine tangente a +X; la terna locale è destrorsa con Y = +Y", () => {
    expect(equals(arcPoint(2400, 0), vec3(0, 0, 0))).toBe(true);
    expect(equals(arcTangent(2400, 0), vec3(1, 0, 0))).toBe(true);
    const f = arcFrame(2400, 1234);
    expect(equals(axisOf(f, 1), vec3(0, 1, 0), 1e-12)).toBe(true);
  });

  it("segmenti: ceil(sweep / passo), estremi sull'asse e sviluppo totale", () => {
    const segs = arcSegments(2400, 93, 15);
    expect(segs).toHaveLength(7);
    expect(segs[0].from).toBe(0);
    expect(segs[6].to).toBeCloseTo(arcLength(2400, 93), 9);
    expect(arcSegments(1000, 90, 15)).toHaveLength(6);
    expect(arcSegments(1000, 10, 15)).toHaveLength(1);
    for (const sg of segs) expect(equals(sg.end, arcPoint(2400, sg.to), 1e-9)).toBe(true);
  });
});
