import { describe, expect, it } from "vitest";
import { createPiece } from "../components/schemas";
import { SECTION_CATALOG, sectionLabel } from "../components/sections";
import type { Piece } from "../components/types";
import { degToRad, fromBasis } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { DEFAULT_LOVATO_RULES } from "./data/default-lovato";
import { evaluateRules } from "./engine";
import { loadRuleSet } from "./types";

/** Travetto 45×90 lungo Y inclinato di `deg`, appoggiato su nulla (pendenza misurata dall'asse). */
const joist = (id: string, deg: number): Piece => {
  const a = degToRad(deg);
  return createPiece({
    id,
    type: "travetto",
    section: { b: 45, h: 90 },
    length: 2000,
    pose: fromBasis(vec3(0, 0, 2500), vec3(0, Math.cos(a), Math.sin(a)), vec3(0, -Math.sin(a), Math.cos(a))),
  });
};

const slopeRules = (allowFlat?: boolean) =>
  loadRuleSet({
    id: "pendenza",
    rules: [{ id: "p", name: "Pendenza", severity: "errore", kind: "slope-range", min: 5, max: 35, ...(allowFlat !== undefined ? { allowFlat } : {}) }],
  });

describe("coperture piane ammesse", () => {
  it("allowFlat: travetti orizzontali (anche a 0,4°) → nessuna violazione", () => {
    expect(evaluateRules({ pieces: [joist("TVT-01", 0), joist("TVT-02", 0.4)] }, slopeRules(true)).violations).toEqual([]);
  });

  it("allowFlat con minimo 5°: travetti a 2° → violazione di pendenza", () => {
    const v = evaluateRules({ pieces: [joist("TVT-01", 2)] }, slopeRules(true)).violations;
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: "slope-range", pieceIds: ["TVT-01"], limit: 5 });
    expect(v[0].measured).toBeCloseTo(2, 6);
  });

  it("senza allowFlat la piana viola il minimo; il default Lovato ammette la piana", () => {
    expect(evaluateRules({ pieces: [joist("TVT-01", 0)] }, slopeRules()).violations).toHaveLength(1);
    expect(DEFAULT_LOVATO_RULES.rules.find((r) => r.kind === "slope-range")).toMatchObject({ allowFlat: true });
    expect(evaluateRules({ pieces: [joist("TVT-01", 0)] }, DEFAULT_LOVATO_RULES).violations.filter((x) => x.kind === "slope-range")).toEqual([]);
  });

  it("allowFlat non booleano → set rifiutato", () => {
    expect(() =>
      loadRuleSet({ id: "x", rules: [{ id: "p", name: "P", severity: "errore", kind: "slope-range", min: 5, max: 35, allowFlat: "sì" }] }),
    ).toThrow(/regola "p"/);
  });
});

describe("tabelle per i tipi e le sezioni del riferimento commerciale", () => {
  it("catalogo sezioni con 45×90, 45×120, 45×145, 70×70, 90×90, 38×300", () => {
    const labels = SECTION_CATALOG.map(sectionLabel);
    for (const l of ["45×90", "45×120", "45×145", "70×70", "90×90", "38×300"]) expect(labels).toContain(l);
  });

  it("luci tabellate per tavola, cantonale, mensola e fascia", () => {
    const luce = DEFAULT_LOVATO_RULES.rules.find((r) => r.kind === "max-span-by-section");
    if (luce?.kind !== "max-span-by-section") throw new Error("regola luce mancante");
    expect(luce.table.tavola).toMatchObject({ "45×120": expect.any(Number), "45×145": expect.any(Number) });
    for (const t of ["cantonale", "mensola", "fascia"] as const) expect(Object.keys(luce.table[t] ?? {}).length).toBeGreaterThan(0);
  });

  it("mensola 90×140 a sbalzo di 2500 senza appoggi → violazione con il limite tabellato", () => {
    const mensola = createPiece({ id: "MEN-01", type: "mensola", section: { b: 90, h: 140 }, length: 2500, pose: fromBasis(vec3(0, 0, 2500), vec3(0, 1, 0), vec3(0, 0, 1)) });
    const v = evaluateRules({ pieces: [mensola] }, DEFAULT_LOVATO_RULES).violations.filter((x) => x.kind === "max-span-by-section");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ severity: "errore", pieceIds: ["MEN-01"], measured: 2500, limit: 1500 });
  });

  it("sezione minima dei pilastri come avviso: pilastri 90×90 non bloccanti", () => {
    const post = createPiece({ id: "PIL-01", type: "pilastro", section: { b: 90, h: 90 }, length: 2400, pose: fromBasis(vec3(0, 0, 0), vec3(0, 0, 1), vec3(0, 1, 0)) });
    const res = evaluateRules({ pieces: [post] }, DEFAULT_LOVATO_RULES);
    expect(res.violations.map((x) => [x.kind, x.severity])).toEqual([["min-section", "avviso"]]);
    expect(res.valid).toBe(true);
  });
});
