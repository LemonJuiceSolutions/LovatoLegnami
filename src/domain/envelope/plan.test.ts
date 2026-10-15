import { describe, expect, it } from "vitest";
import { ValidationError } from "../components/errors";
import { signedDistance } from "../math/plane";
import { vec3 } from "../math/vec3";
import {
  PlanMeasuresError,
  boxOfPlan,
  measuresFromPlan,
  planBounds,
  planDeviations,
  planFromDiagonals,
  planOf,
  planPenetration,
  pointInPlan,
  sidePlane,
  sideSegment,
  wallPlane,
} from "./plan";
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

describe("pianta dalle diagonali", () => {
  it("diagonali uguali e lati a coppie → rettangolo", () => {
    const d = Math.hypot(5000, 3000);
    const p = planFromDiagonals({ front: 5000, back: 5000, left: 3000, right: 3000, d1: d, d2: d });
    const expected = [[0, 0], [5000, 0], [5000, 3000], [0, 3000]];
    p.corners.forEach((c, i) => {
      expect(c.x).toBeCloseTo(expected[i][0], 6);
      expect(c.y).toBeCloseTo(expected[i][1], 6);
    });
    expect(planDeviations(p).maxCornerDeg).toBeCloseTo(0, 6);
  });

  it("fronte 5000, muro 5000, fianchi 3000/3000, diagonali 5900/5760 → parallelogramma fuori squadra", () => {
    const m = { front: 5000, back: 5000, left: 3000, right: 3000, d1: 5900, d2: 5760 };
    const p = planFromDiagonals(m);
    const dev = planDeviations(p);
    expect(Math.round(dev.maxCornerDeg * 10) / 10).toBe(1.6); // deviazione in gradi con un decimale
    expect(dev.sides.sinistro).toBeCloseTo(dev.sides.destro, 1); // fianchi (quasi) paralleli
    expect(dev.sides.posteriore).toBeCloseTo(0, 1); // muro (quasi) parallelo al fronte
    expect(planBounds(p).minX).toBe(0);
    // il box ricavato dalla pianta la rende valida
    expect(() => parseEnvelope({ box: boxOfPlan(p, 3000), plan: p })).not.toThrow();
    const back = measuresFromPlan(p);
    // misure compensate: tutte entro 1 mm (il chiuso darebbe 1,24 mm di errore sul solo muro)
    for (const k of ["front", "back", "left", "right", "d1", "d2"] as const) expect(Math.abs(back[k] - m[k])).toBeLessThan(1);
    // fronte sempre su X
    expect(p.corners[0].y).toBe(0);
    expect(p.corners[1].y).toBe(0);
  });

  it("parallelogramma inclinato a sinistra: traslato in X perché il box parta da 0", () => {
    const p = planFromDiagonals({ front: 5000, back: 5000, left: 3000, right: 3000, d1: 5760, d2: 5900 });
    expect(planBounds(p).minX).toBe(0);
    expect(p.corners[3].x).toBe(0);
    expect(p.corners[0].x).toBeGreaterThan(80);
  });

  it("misure impossibili → \"misure non coerenti: ricontrolla le diagonali\"", () => {
    const base = { front: 5000, back: 5000, left: 3000, right: 3000 };
    expect(() => planFromDiagonals({ ...base, d1: 9000, d2: 5830 })).toThrow(/^misure non coerenti: ricontrolla le diagonali/);
    expect(() => planFromDiagonals({ ...base, d1: 6200, d2: 6200 })).toThrow(PlanMeasuresError); // muro ≠ 5000 oltre 20 mm
    expect(() => planFromDiagonals({ ...base, d1: 5831, d2: 5831 }, 0.2)).not.toThrow();
    expect(() => planFromDiagonals({ ...base, back: 5100, d1: 5831, d2: 5831 })).toThrow(/larghezza al muro sarebbe 5000/);
    expect(() => planFromDiagonals({ ...base, back: 5050, d1: 5831, d2: 5831 }, 60)).not.toThrow();
    expect(() => planFromDiagonals({ ...base, d1: 0, d2: 5831 })).toThrow(/d1 deve essere/);
  });
});

describe("measuresFromPlan", () => {
  it("andata e ritorno: le misure di una pianta ridanno la stessa pianta", () => {
    const p = planFromDiagonals(measuresFromPlan(planOf(skewed)));
    p.corners.forEach((c, i) => {
      expect(c.x).toBeCloseTo(planOf(skewed).corners[i].x, 6);
      expect(c.y).toBeCloseTo(planOf(skewed).corners[i].y, 6);
    });
  });
});
