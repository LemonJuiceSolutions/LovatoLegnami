import { describe, expect, it } from "vitest";
import { ValidationError } from "../components/errors";
import { signedDistance } from "../math/plane";
import { vec3 } from "../math/vec3";
import { planDeviations, planOf, planPenetration, pointInPlan, sidePlane, sideSegment, wallPlane } from "./plan";
import { parseEnvelope } from "./types";

const rad = (d: number) => (d * Math.PI) / 180;
const W = 5000;
const D = 3000;
const rise = W * Math.tan(rad(5));
/** Lato posteriore ruotato di 5° (trapezio rettangolo: fianchi lungo Y, muro che si allontana verso destra). */
const skewed = parseEnvelope({
  box: { width: W, depth: D + rise, height: 3000 },
  plan: { corners: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D + rise }, { x: 0, y: D }] },
});

describe("pianta dell'ingombro", () => {
  it("senza pianta → rettangolo del box, deviazioni 0, piani dei lati del box", () => {
    const e = parseEnvelope({ box: { width: 6000, depth: 3500, height: 3000 } });
    expect(e.plan).toBeUndefined();
    expect(planOf(e).corners).toEqual([{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 3500 }, { x: 0, y: 3500 }]);
    const d = planDeviations(planOf(e));
    expect(d.maxCornerDeg).toBe(0);
    expect(Object.values(d.sides)).toEqual([0, 0, 0, 0]);
    expect(Object.values(d.corners)).toEqual([0, 0, 0, 0]);
    expect(wallPlane(e)).toEqual({ point: { x: 0, y: 3500, z: 0 }, normal: { x: 0, y: -1, z: 0 } });
    expect(sidePlane(e, "sinistro").normal).toEqual({ x: 1, y: 0, z: 0 });
    expect(sidePlane(e, "destro")).toEqual({ point: { x: 6000, y: 0, z: 0 }, normal: { x: -1, y: 0, z: 0 } });
    expect(sidePlane(e, "anteriore").normal).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("lato posteriore ruotato di 5° → deviazione 5° e piano del muro con normale inclinata di 5°", () => {
    const d = planDeviations(planOf(skewed));
    expect(d.sides.posteriore).toBeCloseTo(5, 9);
    expect(d.sides.anteriore).toBe(0);
    expect(d.maxCornerDeg).toBeCloseTo(5, 9);
    expect(d.corners.posterioreSinistro).toBeCloseTo(5, 9); // angolo interno 95°
    expect(d.corners.posterioreDestro).toBeCloseTo(-5, 9);
    const wall = wallPlane(skewed);
    const tilt = (Math.acos(-wall.normal.y) * 180) / Math.PI;
    expect(tilt).toBeCloseTo(5, 9);
    expect(wall.normal.z).toBe(0);
    // la profondità varia lungo la larghezza: il muro passa per (0, D) e (W, D + rise)
    expect(signedDistance(wall, vec3(0, D, 0))).toBeCloseTo(0, 9);
    expect(signedDistance(wall, vec3(W, D + rise, 1000))).toBeCloseTo(0, 9);
    expect(signedDistance(wall, vec3(W / 2, D, 0))).toBeGreaterThan(0); // interno
    expect(sideSegment(planOf(skewed), "posteriore").length).toBeCloseTo(W / Math.cos(rad(5)), 9);
  });

  it("planPenetration e pointInPlan: lato più violato e distanza con segno", () => {
    const p = planOf(skewed);
    expect(pointInPlan(p, { x: 4000, y: D + 0.5 * rise })).toBe(true);
    const out = planPenetration(p, { x: 0, y: D + 100 });
    expect(out.side).toBe("posteriore");
    expect(out.depth).toBeCloseTo(100 * Math.cos(rad(5)), 9);
    expect(planPenetration(p, { x: -20, y: 1000 })).toEqual({ side: "sinistro", depth: 20 });
    expect(planPenetration(p, { x: 1000, y: 1000 }).depth).toBeLessThan(0);
    expect(pointInPlan(p, { x: 1000, y: -1 })).toBe(false);
    expect(pointInPlan(p, { x: 1000, y: -1 }, 2)).toBe(true);
  });

  it("angolo rientrante → errore con il nome dell'angolo", () => {
    const bad = { box: { width: 5000, depth: 3000, height: 3000 }, plan: { corners: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 4000, y: 1500 }, { x: 0, y: 3000 }] } };
    const reflex = { ...bad, plan: { corners: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 3000 }] } };
    expect(() => parseEnvelope(reflex)).toThrow(ValidationError);
    expect(() => parseEnvelope(reflex)).toThrow(/plan\.corners\[2\]: angolo posteriore destro rientrante/);
    // orario: tutti gli angoli "rientranti", il primo citato è l'anteriore sinistro
    const cw = { ...bad, plan: { corners: [{ x: 0, y: 0 }, { x: 0, y: 3000 }, { x: 5000, y: 3000 }, { x: 5000, y: 0 }] } };
    expect(() => parseEnvelope(cw)).toThrow(/angolo anteriore sinistro rientrante/);
    expect(() => parseEnvelope({ ...bad, plan: { corners: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5000, y: 3000 }, { x: 0, y: 3000 }] } })).toThrow(/lato anteriore di lunghezza nulla/);
  });

  it("box diverso dal rettangolo che contiene la pianta (oltre 1 mm) → errore sull'angolo", () => {
    const corners = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D + rise }, { x: 0, y: D }];
    expect(() => parseEnvelope({ box: { width: W, depth: D, height: 3000 }, plan: { corners } })).toThrow(
      /plan\.corners\[2\]: angolo posteriore destro a y = 3437,4 mm: la pianta deve arrivare alla profondità del box/,
    );
    expect(() => parseEnvelope({ box: { width: W, depth: D + rise + 0.9, height: 3000 }, plan: { corners } })).not.toThrow();
    const shifted = corners.map((c) => ({ x: c.x + 10, y: c.y }));
    expect(() => parseEnvelope({ box: { width: W + 10, depth: D + rise, height: 3000 }, plan: { corners: shifted } })).toThrow(/plan\.corners\[0\]: angolo anteriore sinistro a x = 10 mm/);
  });

  it("JSON esistenti senza `plan` restano validi e invariati", () => {
    const json = { box: { width: 6000, depth: 3600, height: 3700 }, wallSide: "posteriore", obstacles: [], floor: { corners: { frontLeft: 0, frontRight: 0, backLeft: 0, backRight: 0 }, points: [] } };
    const e = parseEnvelope(json);
    expect(e).toEqual(json);
    expect("plan" in e).toBe(false);
    expect(parseEnvelope(JSON.parse(JSON.stringify(skewed)))).toEqual(skewed);
  });
});
