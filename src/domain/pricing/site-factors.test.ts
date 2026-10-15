import { describe, expect, it } from "vitest";
import { canonicalJson } from "../math/canonical";
import { assemblyBounds } from "../assembly/bounds";
import { parseEnvelope, type EnvelopeInput } from "../envelope/types";
import { floorFunction } from "../envelope/floor";
import { generate } from "../typologies/registry";
import { defaultPlanDeviations, inferAnchoring, siteFactors } from "./site-factors";

const monofalda = generate("addossata-monofalda");
const bifalda = generate("autoportante-bifalda");

/** Ingombro che contiene l'assieme (box arrotondato ai 100 mm). */
const envelopeFor = (extra: Partial<EnvelopeInput> = {}, assembly = monofalda) => {
  const b = assemblyBounds(assembly)!;
  const up = (v: number) => Math.ceil(v / 100) * 100;
  return parseEnvelope({ box: { width: up(b.max.x), depth: up(b.max.y), height: up(b.max.z) + 200 }, ...extra });
};

describe("siteFactors (4.1)", () => {
  it("cantiere rettangolare piano senza ostacoli → fattori nulli salvo le altezze", () => {
    const f = siteFactors(envelopeFor({}, bifalda), bifalda);
    expect(f).toMatchObject({
      planDeviationDeg: 0,
      wallDeviationDeg: 0,
      floorSlopePct: 0,
      floorRangeMm: 0,
      obstaclesCount: 0,
      embedmentMm: 0,
      access: "facile",
      anchoring: "terra",
    });
    expect(f.maxHeightMm).toBeCloseTo(assemblyBounds(bifalda)!.max.z, 6);
    expect(f.clearHeightMm).toBeGreaterThan(2000);
    expect(f.clearHeightMm).toBeLessThan(f.maxHeightMm);
  });

  it("3 ostacoli di cui 2 sull'impronta → obstaclesCount 2", () => {
    const env = envelopeFor({
      obstacles: [
        // grondaia sul muro posteriore: sopra i travetti, dentro l'impronta in pianta
        { id: "OST-01", type: "grondaia", side: "posteriore", elevation: 3300, height: 150, projection: 150 },
        // finestra sul lato destro, nella fascia di sbalzo laterale coperta
        { id: "OST-02", type: "finestra", side: "destro", offset: 500, width: 800, elevation: 1000, height: 1200, projection: 100 },
        // pozzetto a pavimento fuori dall'impronta (davanti alla pergola, y < 41)
        { id: "OST-03", type: "generico", side: "pavimento", offset: 2000, width: 300, elevation: 0, height: 30, projection: 50 },
      ],
    });
    const f = siteFactors(env, monofalda);
    expect(f.obstaclesCount).toBe(2);
  });

  it("pavimento in pendenza: dislivello e pendenza dai campioni, pilastri affondati rilevati", () => {
    const env = envelopeFor({ floor: { corners: { frontLeft: 0, frontRight: 0, backLeft: 180, backRight: 180 } } }, bifalda);
    const floor = floorFunction(env);
    const a = generate("autoportante-bifalda", undefined, { floorHeightAt: floor, embedment: 300 });
    const f = siteFactors(env, a);
    expect(f.floorRangeMm).toBeGreaterThan(150);
    expect(f.floorRangeMm).toBeLessThanOrEqual(180);
    expect(f.floorSlopePct).toBeCloseTo((180 / env.box.depth) * 100, 3);
    expect(f.embedmentMm).toBeCloseTo(300, 6);
  });

  it("fattori dichiarati e ancoraggio dedotto", () => {
    expect(inferAnchoring(monofalda)).toBe("misto");
    expect(inferAnchoring(generate("pensilina-sbalzo"))).toBe("muro");
    const f = siteFactors(envelopeFor(), monofalda, { access: "difficile", anchoring: "muro", embedmentMm: 50 });
    expect(f).toMatchObject({ access: "difficile", anchoring: "muro", embedmentMm: 50 });
  });

  it("le deviazioni arrivano dal provider della pianta (aggancio del gruppo 5)", () => {
    expect(defaultPlanDeviations(envelopeFor())).toEqual({ planDeviationDeg: 0, wallDeviationDeg: 0 });
    const f = siteFactors(envelopeFor(), monofalda, {}, { planDeviations: () => ({ planDeviationDeg: 6, wallDeviationDeg: 5 }) });
    expect(f.planDeviationDeg).toBe(6);
    expect(f.wallDeviationDeg).toBe(5);
  });

  it("serializzazione deterministica", () => {
    const env = envelopeFor({ floor: { corners: { backLeft: 37.123456789 } } });
    const a = canonicalJson(siteFactors(env, monofalda));
    const b = canonicalJson(siteFactors(env, generate("addossata-monofalda")));
    expect(a).toBe(b);
    expect(a).toMatchInlineSnapshot(`"{"access":"facile","anchoring":"misto","clearHeightMm":2394.210689,"embedmentMm":4.601822,"floorRangeMm":36.622404,"floorSlopePct":1.031207,"maxHeightMm":3598.395709,"obstaclesCount":0,"planDeviationDeg":0,"wallDeviationDeg":0}"`);
  });
});
