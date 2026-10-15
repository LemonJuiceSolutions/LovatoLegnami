import { describe, expect, it } from "vitest";
import type { TaglioTesta } from "../components/types";
import { DEFAULT_PRICE_LIST, DEFAULT_PRICE_LIST_VERSION } from "../pricing/data/default-listino";
import { priceAssembly } from "../pricing/engine";
import { siteFactors } from "../pricing/site-factors";
import { DEFAULT_LOVATO_RULES } from "../rules/data/default-lovato";
import { axisOf } from "../math/mat4";
import { generate, getTypology } from "../typologies/registry";
import { checkCollisions } from "./collisions";
import { fitToEnvelope } from "./fit";
import { rectanglePlan, wallBuildOptions } from "./plan";
import { parseEnvelope } from "./types";

const rad = (d: number) => (d * Math.PI) / 180;

/** Pianta trapezia: muro posteriore inclinato di `angle` gradi (si allontana verso destra). */
const trapezoid = (width: number, depth: number, height: number, angle: number, wallSide = "posteriore") => {
  const rise = width * Math.tan(rad(angle));
  return parseEnvelope({
    box: { width, depth: depth + rise, height },
    wallSide,
    plan: { corners: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: depth + rise }, { x: 0, y: depth }] },
  });
};

describe("piani dei muri nel flusso", () => {
  it("wallBuildOptions: solo con pianta, tipologia a muro e muro ruotato", () => {
    const env = trapezoid(5000, 3000, 3500, 5);
    expect(Object.keys(wallBuildOptions(getTypology("addossata-monofalda"), env))).toEqual(["wallPlane"]);
    expect(Object.keys(wallBuildOptions(getTypology("a-elle"), env))).toEqual(["wallPlane", "wallPlane2"]);
    expect(wallBuildOptions(getTypology("autoportante-bifalda"), env)).toEqual({});
    expect(wallBuildOptions(getTypology("addossata-monofalda"), { ...env, plan: undefined })).toEqual({});
    const box = { width: 5000, depth: 3000, height: 3500 };
    expect(wallBuildOptions(getTypology("addossata-monofalda"), parseEnvelope({ box, plan: rectanglePlan(box) }))).toEqual({});
    // muro su un altro lato: i template costruiscono il muro sul lato posteriore
    expect(wallBuildOptions(getTypology("addossata-monofalda"), trapezoid(5000, 3000, 3500, 5, "sinistro"))).toEqual({});
  });

  it("pergola libera adattata a pianta trapezia → resta rettangolare e senza collisioni", () => {
    const env = trapezoid(5000, 4000, 3500, 6);
    const fit = fitToEnvelope("autoportante-bifalda", env, {}, DEFAULT_LOVATO_RULES);
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(checkCollisions(fit.assembly, env)).toEqual([]);
    // pianta rettangolare: ogni asse in pianta lungo X o lungo Y
    for (const p of fit.assembly.pieces) {
      const X = axisOf(p.pose, 0);
      expect(Math.min(Math.abs(X.x), Math.abs(X.y))).toBeLessThan(1e-9);
    }
    // la profondità è limitata dal muro nel punto più vicino (fianco sinistro, y = 4000)
    expect(fit.limits.find((l) => l.param === "profondita")!.cause).toMatchObject({ kind: "ingombro" });
  });

  it("monofalda adattata alla pianta con il muro a 5°: muro reale nel template, nessuna collisione", () => {
    const env = trapezoid(6000, 3600, 3700, 5);
    const fit = fitToEnvelope("addossata-monofalda", env, { larghezza: 6000 }, DEFAULT_LOVATO_RULES);
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(checkCollisions(fit.assembly, env)).toEqual([]);
    const tvt = fit.assembly.pieces.filter((p) => p.type === "travetto");
    const cut = tvt[0].machinings.filter((m): m is TaglioTesta => m.type === "taglio-testa").at(-1)!;
    expect(Math.abs(cut.angle2 ?? 0)).toBeGreaterThan(5);
    expect(tvt.at(-1)!.length - tvt[0].length).toBeGreaterThan(400);
  });

  it("fattori di cantiere dalla pianta: fuorisquadra e deviazione del muro; complicazione nel preventivo", () => {
    const env = trapezoid(6000, 3600, 3700, 5);
    const a = generate("addossata-monofalda", {}, wallBuildOptions(getTypology("addossata-monofalda"), env));
    const f = siteFactors(env, a);
    expect(f.planDeviationDeg).toBeCloseTo(5, 6);
    expect(f.wallDeviationDeg).toBeCloseTo(5, 6);
    expect(siteFactors(parseEnvelope({ box: env.box }), a)).toMatchObject({ planDeviationDeg: 0, wallDeviationDeg: 0 });
    const q = priceAssembly({ assembly: a, envelope: env, options: { species: "abete", quality: "lamellare", cap: "37100" }, priceList: DEFAULT_PRICE_LIST, version: DEFAULT_PRICE_LIST_VERSION });
    expect(q.firedRules).toContain("fuorisquadra");
    expect(q.lines.find((l) => l.ruleId === "fuorisquadra")!.label).toMatch(/fuorisquadra 5°/);
  });
});
