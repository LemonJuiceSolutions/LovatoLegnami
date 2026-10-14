import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fromJSON } from "../../components/serialize";
import { SECTION_CATALOG, sectionLabel } from "../../components/sections";
import { evaluateRules } from "../engine";
import { DEFAULT_LOVATO_RULES } from "./default-lovato";

const ruleOf = <K extends string>(kind: K) => DEFAULT_LOVATO_RULES.rules.find((r) => r.kind === kind)!;

describe("set di regole di default Lovato", () => {
  it("contiene i valori iniziali della spec", () => {
    expect(ruleOf("slope-range")).toMatchObject({ min: 5, max: 35 });
    expect(ruleOf("min-clear-height")).toMatchObject({ min: 2100 });
    expect(ruleOf("max-overhang")).toMatchObject({ max: 800 });
    expect(ruleOf("max-joist-spacing")).toMatchObject({ max: 800 });
  });

  it("ogni sezione del catalogo ha una luce massima per trave, travetto, colmo e puntone", () => {
    const luce = ruleOf("max-span-by-section");
    if (luce.kind !== "max-span-by-section") throw new Error("regola luce mancante");
    for (const type of ["trave", "travetto", "colmo", "puntone"] as const)
      for (const s of SECTION_CATALOG) expect(luce.table[type]?.[sectionLabel(s)], `${type} ${sectionLabel(s)}`).toBeGreaterThan(0);
  });

  it("è documentato come da validare con l'ufficio tecnico", () => {
    const src = readFileSync(fileURLToPath(new URL("./default-lovato.ts", import.meta.url)), "utf8");
    expect(src).toContain("DA VALIDARE CON UFFICIO TECNICO");
  });

  for (const file of ["monofalda-default.json", "bifalda-default.json"])
    it(`la fixture golden ${file} non ha violazioni di severità errore`, () => {
      const a = fromJSON(readFileSync(fileURLToPath(new URL(`../../__fixtures__/${file}`, import.meta.url)), "utf8"));
      const res = evaluateRules(a, DEFAULT_LOVATO_RULES);
      expect(res.violations.filter((v) => v.severity === "errore")).toEqual([]);
      expect(res.valid).toBe(true);
    });
});
