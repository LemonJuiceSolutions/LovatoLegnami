import { describe, expect, it } from "vitest";
import { createPiece } from "../components/schemas";
import type { Piece } from "../components/types";
import { degToRad, fromBasis, translation } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { generate } from "../typologies/registry";
import { evaluateRules } from "./engine";
import { type Rule, type RuleSet, loadRuleSet } from "./types";

const pilastro = (id: string, x: number, y = 0, h = 2400) =>
  createPiece({ id, type: "pilastro", section: { b: 120, h: 120 }, length: h, pose: fromBasis(vec3(x, y, 0), vec3(0, 0, 1), vec3(0, 1, 0)) });
/** Trave lungo X con asse in y e intradosso a quota z. */
const trave = (id: string, length: number, y = 0, z = 2400, section = { b: 120, h: 240 }) =>
  createPiece({ id, type: "trave", section, length, pose: translation(vec3(0, y, z + section.h / 2)) });
/** Travetto 80×160 orizzontale lungo Y appoggiato sulle travi con estradosso a 2640. */
const travettoPiano = (id: string, x: number, yStart: number, yEnd: number, section = { b: 80, h: 160 }) =>
  createPiece({ id, type: "travetto", section, length: yEnd - yStart, pose: fromBasis(vec3(x, yStart, 2640 + section.h / 2), vec3(0, 1, 0), vec3(0, 0, 1)) });
/** Travetto inclinato di `deg` gradi lungo Y (senza appoggi). */
const travettoInclinato = (id: string, x: number, deg: number) => {
  const s = degToRad(deg);
  return createPiece({
    id,
    type: "travetto",
    section: { b: 80, h: 160 },
    length: 3000,
    pose: fromBasis(vec3(x, 0, 2800), vec3(0, Math.cos(s), Math.sin(s)), vec3(0, -Math.sin(s), Math.cos(s))),
  });
};

const rule = (r: Record<string, unknown>): RuleSet => loadRuleSet({ id: "t", rules: [{ name: "Regola", severity: "errore", ...r }] });

/** Due travi (y = 0 e y = 3200) su pilastri e travetti orizzontali sopra. */
function telaio(opts: { xs?: number[]; yStart?: number; yEnd?: number; joist?: { b: number; h: number } } = {}): { pieces: Piece[] } {
  const xs = opts.xs ?? [40, 640];
  return {
    pieces: [
      trave("TRV-01", 3000, 0),
      trave("TRV-02", 3000, 3200),
      pilastro("PIL-01", 200, 0),
      pilastro("PIL-02", 2800, 0),
      pilastro("PIL-03", 200, 3200),
      pilastro("PIL-04", 2800, 3200),
      ...xs.map((x, i) => travettoPiano(`TVT-0${i + 1}`, x, opts.yStart ?? -300, opts.yEnd ?? 3300, opts.joist)),
    ],
  };
}

describe("luce massima per sezione", () => {
  const luce = (table: Record<string, Record<string, number>>) => rule({ id: "luce", kind: "max-span-by-section", table });
  const assieme = { pieces: [trave("TRV-01", 5400), pilastro("PIL-01", 200), pilastro("PIL-02", 5200)] };

  it("trave 120×240 su 5000 mm con limite 4500 → errore con valore, limite e id", () => {
    const { violations, valid } = evaluateRules(assieme, luce({ trave: { "120×240": 4500 } }));
    expect(valid).toBe(false);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ ruleId: "luce", severity: "errore", pieceIds: ["TRV-01"], limit: 4500 });
    expect(violations[0].measured).toBeCloseTo(5000, 6);
    expect(violations[0].message).toMatch(/Luce eccessiva.*5000 mm.*4500 mm/);
  });

  it("travetto 80×160 su 3200 mm con tabella 3500 → nessuna violazione", () => {
    const { violations } = evaluateRules(telaio(), luce({ travetto: { "80×160": 3500 } }));
    expect(violations).toEqual([]);
  });

  it("sezione assente dalla tabella → avviso \"sezione non tabellata\" con id pezzo", () => {
    const { violations, valid } = evaluateRules(telaio({ joist: { b: 70, h: 150 } }), luce({ travetto: { "80×160": 3500 } }));
    expect(valid).toBe(true);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ severity: "avviso", code: "sezione-non-tabellata", pieceIds: ["TVT-01", "TVT-02"] });
    expect(violations[0].message).toMatch(/Sezione non tabellata: travetto 70×150/);
  });
});

describe("interasse, sbalzo, altezza libera, pendenza", () => {
  it("interasse effettivo 900 con massimo 800 → violazione 900/800", () => {
    const { violations } = evaluateRules(telaio({ xs: [40, 940] }), rule({ id: "int", kind: "max-joist-spacing", max: 800 }));
    expect(violations).toHaveLength(1);
    expect(violations[0].measured).toBeCloseTo(900, 6);
    expect(violations[0].limit).toBe(800);
    expect(violations[0].pieceIds).toEqual(["TVT-01", "TVT-02"]);
  });

  it("sbalzo di gronda 700 con massimo 600 → violazione che cita lo sbalzo", () => {
    const r = rule({ id: "sb", kind: "max-overhang", max: 600, pieceTypes: ["travetto"] });
    const { violations } = evaluateRules(telaio({ yStart: -760 }), r);
    expect(violations).toHaveLength(1);
    expect(violations[0].measured).toBeCloseTo(700, 3);
    expect(violations[0].message).toMatch(/^Sbalzo di 700 mm \(travetto\) oltre il massimo di 600 mm/);
    expect(evaluateRules(telaio({ yStart: -600 }), r).violations).toEqual([]);
  });

  it("altezza libera 2050 con minimo 2100 → errore con valore 2050", () => {
    const assieme = { pieces: [trave("TRV-01", 3000, 0, 2050), pilastro("PIL-01", 200, 0, 2050)] };
    const { violations, valid } = evaluateRules(assieme, rule({ id: "h", kind: "min-clear-height", min: 2100 }));
    expect(valid).toBe(false);
    expect(violations[0]).toMatchObject({ severity: "errore", pieceIds: ["TRV-01"], limit: 2100 });
    expect(violations[0].measured).toBeCloseTo(2050, 6);
  });

  it("altezza libera misurata sul pavimento indicato", () => {
    const assieme = { pieces: [trave("TRV-01", 3000, 0, 2150)] };
    const r = rule({ id: "h", kind: "min-clear-height", min: 2100 });
    expect(evaluateRules(assieme, r).violations).toEqual([]);
    expect(evaluateRules(assieme, r, { floorHeightAt: () => 100 }).violations[0].measured).toBeCloseTo(2050, 6);
  });

  it("pendenza 4° con intervallo 8°–30° → violazione che indica l'intervallo", () => {
    const { violations } = evaluateRules({ pieces: [travettoInclinato("TVT-01", 40, 4)] }, rule({ id: "p", kind: "slope-range", min: 8, max: 30 }));
    expect(violations).toHaveLength(1);
    expect(violations[0].measured).toBeCloseTo(4, 9);
    expect(violations[0].limit).toBe(8);
    expect(violations[0].message).toBe("Pendenza di 4° fuori dall'intervallo ammesso 8°–30°.");
  });

  it("sezione minima: pilastro 100×100 sotto 120×120", () => {
    const p = createPiece({ id: "PIL-01", type: "pilastro", section: { b: 100, h: 100 }, length: 2400, pose: translation(vec3(0, 0, 0)) });
    const { violations } = evaluateRules({ pieces: [p] }, rule({ id: "s", kind: "min-section", pieceType: "pilastro", section: "120×120" }));
    expect(violations).toMatchObject([{ ruleId: "s", pieceIds: ["PIL-01"], message: "Sezione pilastro 100×100 inferiore alla minima 120×120." }]);
  });
});

describe("assieme conforme", () => {
  const regole: Rule[] = loadRuleSet({
    id: "permissivo",
    rules: [
      { id: "luce", name: "Luce", severity: "errore", kind: "max-span-by-section", table: { trave: { "120×240": 4500 }, travetto: { "80×160": 3500 } } },
      { id: "int", name: "Interasse", severity: "errore", kind: "max-joist-spacing", max: 800 },
      { id: "sb", name: "Sbalzo", severity: "errore", kind: "max-overhang", max: 800 },
      { id: "h", name: "Altezza libera", severity: "errore", kind: "min-clear-height", min: 2100 },
      { id: "p", name: "Pendenza", severity: "errore", kind: "slope-range", min: 5, max: 35 },
      { id: "s", name: "Sezione pilastri", severity: "errore", kind: "min-section", pieceType: "pilastro", section: "120×120" },
    ],
  }).rules as Rule[];

  it("la monofalda di default rispetta tutte le regole → elenco vuoto e valido", () => {
    const res = evaluateRules(generate("addossata-monofalda"), { id: "permissivo", rules: regole });
    expect(res.violations).toEqual([]);
    expect(res.valid).toBe(true);
  });
});
