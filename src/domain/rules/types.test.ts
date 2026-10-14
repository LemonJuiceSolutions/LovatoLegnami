import { describe, expect, it } from "vitest";
import { RuleSetError, loadRuleSet } from "./types";

const sixRules = {
  id: "test",
  rules: [
    { id: "luce", name: "Luce massima", severity: "errore", kind: "max-span-by-section", table: { trave: { "120x240": 4500 } } },
    { id: "interasse", name: "Interasse travetti", severity: "errore", kind: "max-joist-spacing", max: 800 },
    { id: "sbalzo", name: "Sbalzo massimo", severity: "avviso", kind: "max-overhang", max: 600, pieceTypes: ["travetto"] },
    { id: "altezza", name: "Altezza libera", severity: "errore", kind: "min-clear-height", min: 2100 },
    { id: "pendenza", name: "Pendenza", severity: "avviso", kind: "slope-range", min: 8, max: 30 },
    { id: "sez-pil", name: "Sezione minima pilastri", severity: "errore", kind: "min-section", pieceType: "pilastro", section: "120 x 120" },
  ],
};

describe("loadRuleSet", () => {
  it("accetta 6 regole di tipi diversi e le elenca con id, nome e severità", () => {
    const rs = loadRuleSet(sixRules);
    expect(rs.id).toBe("test");
    expect(rs.rules.map((r) => [r.id, r.name, r.severity])).toEqual([
      ["luce", "Luce massima", "errore"],
      ["interasse", "Interasse travetti", "errore"],
      ["sbalzo", "Sbalzo massimo", "avviso"],
      ["altezza", "Altezza libera", "errore"],
      ["pendenza", "Pendenza", "avviso"],
      ["sez-pil", "Sezione minima pilastri", "errore"],
    ]);
    expect(new Set(rs.rules.map((r) => r.kind)).size).toBe(6);
  });

  it("normalizza le sezioni in forma canonica b×h", () => {
    const rs = loadRuleSet(sixRules);
    const luce = rs.rules[0];
    const sez = rs.rules[5];
    expect(luce.kind === "max-span-by-section" && luce.table.trave).toEqual({ "120×240": 4500 });
    expect(sez.kind === "min-section" && sez.section).toBe("120×120");
  });

  it("rifiuta un tipo di vincolo sconosciuto indicando l'id della regola", () => {
    const bad = { id: "x", rules: [...sixRules.rules, { id: "vento", name: "Vento", severity: "errore", kind: "max-wind", max: 1 }] };
    expect(() => loadRuleSet(bad)).toThrow(RuleSetError);
    expect(() => loadRuleSet(bad)).toThrow(/regola "vento".*tipo di vincolo non supportato "max-wind"/);
    try {
      loadRuleSet(bad);
    } catch (e) {
      expect((e as RuleSetError).ruleId).toBe("vento");
    }
  });

  it("rifiuta parametri non validi e id duplicati citando la regola", () => {
    const neg = { id: "x", rules: [{ id: "i", name: "I", severity: "errore", kind: "max-joist-spacing", max: -5 }] };
    expect(() => loadRuleSet(neg)).toThrow(/rules\[0\]\.max: regola "i"/);
    const sev = { id: "x", rules: [{ id: "i", name: "I", severity: "grave", kind: "max-joist-spacing", max: 5 }] };
    expect(() => loadRuleSet(sev)).toThrow(/regola "i": severità non valida/);
    const dup = { id: "x", rules: [sixRules.rules[1], sixRules.rules[1]] };
    expect(() => loadRuleSet(dup)).toThrow(/regola "interasse": id duplicato/);
    const range = { id: "x", rules: [{ id: "p", name: "P", severity: "avviso", kind: "slope-range", min: 30, max: 8 }] };
    expect(() => loadRuleSet(range)).toThrow(/regola "p": min deve essere ≤ max/);
  });
});
