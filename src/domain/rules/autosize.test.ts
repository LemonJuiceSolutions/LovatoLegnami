import { describe, expect, it } from "vitest";
import { toJSON } from "../components/serialize";
import { generate } from "../typologies/registry";
import { autoSize } from "./autosize";
import { evaluateRules } from "./engine";
import { loadRuleSet } from "./types";

const SLUG = "addossata-monofalda";

const ruleSet = (rules: Record<string, unknown>[]) =>
  loadRuleSet({ id: "t", rules: rules.map((r, i) => ({ id: `r${i}`, name: `Regola ${i}`, severity: "errore", ...r })) });

describe("autoSize", () => {
  it("trave 120×200 oltre la luce → propone 120×240 (prima sezione in tabella che la rispetta, stessa base)", () => {
    // luce trave di default 2340 mm
    const a = generate(SLUG, { sezioneTrave: "120×200" });
    const rs = ruleSet([
      { kind: "max-span-by-section", table: { trave: { "100×200": 2500, "120×200": 2000, "120×240": 2500, "160×200": 2400 } } },
    ]);
    const before = toJSON(a);
    const res = autoSize(a, rs);
    expect(res.proposals).toHaveLength(1);
    expect(res.proposals[0]).toMatchObject({ param: "sezioneTrave", from: "120×200", to: "120×240", message: "trave: 120×200 → 120×240", ruleIds: ["r0"] });
    expect(res.proposals[0].pieceIds).toEqual(["TRV-01"]);
    expect(res.unresolved).toEqual([]);
    expect(res.params.sezioneTrave).toBe("120×240");
    expect(toJSON(a)).toBe(before); // non muta l'input
    expect(evaluateRules(generate(SLUG, res.params), rs).violations).toEqual([]);
  });

  it("senza sezione con la stessa base sceglie la più piccola che rispetta la luce", () => {
    const a = generate(SLUG, { sezioneTrave: "120×200" });
    const rs = ruleSet([{ kind: "max-span-by-section", table: { trave: { "120×200": 2000, "160×200": 2400, "160×160": 2350 } } }]);
    expect(autoSize(a, rs).proposals[0].to).toBe("160×160");
  });

  it("interasse 900 oltre il massimo 800 → interasse ≤ 800 che divide esattamente la larghezza utile", () => {
    const a = generate(SLUG, { interasse: 900 });
    const rs = ruleSet([{ kind: "max-joist-spacing", max: 800 }]);
    expect(evaluateRules(a, rs).violations).toHaveLength(1);
    const res = autoSize(a, rs);
    expect(res.proposals).toHaveLength(1);
    const p = res.proposals[0];
    expect(p.param).toBe("interasse");
    expect(p.from).toBe(900);
    const spacing = p.to as number;
    expect(spacing).toBeLessThanOrEqual(800);
    const usable = 6000 - 80; // tra gli assi dei travetti d'estremità
    expect(usable / spacing).toBeCloseTo(Math.round(usable / spacing), 9);
    expect(spacing).toBeCloseTo(740, 9);
    const after = evaluateRules(generate(SLUG, res.params), rs);
    expect(after.violations).toEqual([]);
    expect(after.measures.joistSpacing).toBeCloseTo(740, 6);
  });

  it("sezione minima: alza alla minima a catalogo", () => {
    const a = generate(SLUG, { sezionePilastro: "100×100" });
    const res = autoSize(a, ruleSet([{ kind: "min-section", pieceType: "pilastro", section: "120×120" }]));
    expect(res.proposals.map((p) => p.message)).toEqual(["pilastro: 100×100 → 120×120"]);
  });

  it("solo altezza libera insufficiente → nessuna proposta, violazione a carico dell'utente", () => {
    const a = generate(SLUG, { altezza: 2050 });
    const res = autoSize(a, ruleSet([{ kind: "min-clear-height", min: 2100 }]));
    expect(res.proposals).toEqual([]);
    expect(res.unresolved).toHaveLength(1);
    expect(res.unresolved[0].kind).toBe("min-clear-height");
    expect(res.params).toEqual(a.params);
  });

  it("nessuna sezione in tabella sufficiente → violazione irrisolta", () => {
    const a = generate(SLUG, { sezioneTrave: "120×200" });
    const res = autoSize(a, ruleSet([{ kind: "max-span-by-section", table: { trave: { "120×200": 2000, "120×240": 2100 } } }]));
    expect(res.proposals).toEqual([]);
    expect(res.unresolved).toHaveLength(1);
  });
});
