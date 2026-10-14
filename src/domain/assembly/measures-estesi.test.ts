import { describe, expect, it } from "vitest";
import { createPiece } from "../components/schemas";
import { PIECE_TYPES } from "../components/types";
import { fromBasis } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { CLEAR_HEIGHT_TYPES } from "./bounds";
import { SUPPORTERS, measureAssembly, measureSpan } from "./measures";

const post = (id: string, x: number, h = 2520) =>
  createPiece({ id, type: "pilastro", section: { b: 90, h: 90 }, length: h, pose: fromBasis(vec3(x, 0, 0), vec3(0, 0, 1), vec3(1, 0, 0)) });
/** Tavola 45×120 lungo X a fianco dei pilastri (sandwich), intradosso a 2400. */
const plank = (id: string, side: 1 | -1, length = 4000, x0 = 0) =>
  createPiece({ id, type: "tavola", section: { b: 45, h: 120 }, length, pose: fromBasis(vec3(x0, side * 67.5, 2460), vec3(1, 0, 0), vec3(0, 0, 1)) });

describe("appoggi dei nuovi tipi (E8)", () => {
  it("ogni tipo di pezzo ha una voce in SUPPORTERS (eventualmente vuota)", () => {
    for (const t of PIECE_TYPES) expect(SUPPORTERS[t], t).toBeDefined();
    expect(SUPPORTERS.tavola).toEqual(["pilastro", "arco", "banchina"]);
    expect(SUPPORTERS.travetto).toEqual(expect.arrayContaining(["tavola", "mensola", "cantonale", "monaco"]));
    expect(SUPPORTERS.cantonale).toEqual(["trave", "tavola", "monaco", "pilastro", "banchina"]); // banchina: compluvio della L (6.3)
    expect(SUPPORTERS.fascia).toEqual(["travetto", "mensola", "cantonale", "trave"]);
    expect(SUPPORTERS.arco).toEqual([]);
  });

  it("altezza libera anche sotto tavole, cantonali, mensole, fasce e monaci", () => {
    expect(CLEAR_HEIGHT_TYPES).toEqual(expect.arrayContaining(["tavola", "cantonale", "mensola", "fascia", "monaco"]));
    expect(CLEAR_HEIGHT_TYPES).not.toContain("arco");
  });

  it("tavola da 4000 serrata su due pilastri a 3400 in asse: luce 3400, sbalzi 300", () => {
    const pieces = [plank("TAV-01", -1), post("PIL-01", 300), post("PIL-02", 3700)];
    const m = measureSpan(pieces[0], pieces);
    expect(m.supports.map((s) => s.pieceId)).toEqual(["PIL-01", "PIL-02"]);
    expect(m.span).toBeCloseTo(3400, 6);
    expect(m.overhangStart).toBeCloseTo(300, 6);
    expect(m.overhangEnd).toBeCloseTo(300, 6);
  });

  it("travetto sopra le tavole: appoggio dal basso, zona d'appoggio = larghezza della tavola", () => {
    const joist = createPiece({ id: "TVT-01", type: "travetto", section: { b: 45, h: 90 }, length: 1000, pose: fromBasis(vec3(1000, -500, 2565), vec3(0, 1, 0), vec3(0, 0, 1)) });
    const pieces = [joist, plank("TAV-01", -1), plank("TAV-02", 1)];
    const m = measureSpan(joist, pieces);
    expect(m.supports.map((s) => [s.pieceId, s.to - s.from])).toEqual([
      ["TAV-01", expect.closeTo(45, 4)],
      ["TAV-02", expect.closeTo(45, 4)],
    ]);
  });

  it("testa di un arco tra le tavole: appoggio registrato, l'arco non ha luce", () => {
    // arco R1000 90°: piede verticale in (1000, 0, 1400), testa orizzontale in (2000, 0, 2460) tra le tavole
    const arc = createPiece({
      id: "ARC-01",
      type: "arco",
      section: { b: 90, h: 90 },
      length: (1000 * Math.PI) / 2,
      curve: { radius: 1000, sweep: 90 },
      pose: fromBasis(vec3(1000, 0, 1460), vec3(0, 0, 1), vec3(1, 0, 0)),
    });
    const pieces = [plank("TAV-01", -1, 1500, 1500), plank("TAV-02", 1, 1500, 1500), arc];
    const m = measureAssembly({ pieces });
    const t = m.spans.find((s) => s.pieceId === "TAV-01")!;
    expect(t.supports.map((s) => s.pieceId)).toEqual(["ARC-01"]);
    expect(m.spans.some((s) => s.pieceId === "ARC-01")).toBe(false);
  });

  it("staffa a muro collegata: appoggio puntuale nell'origine della voce (non per le mensole)", () => {
    const t = plank("TAV-01", -1);
    const pieces = [t, post("PIL-01", 300)];
    const staffa = { id: "STM-01", code: "staffa-muro-listoni-paralleli-90", kind: "staffa-muro" as const, description: "", quantity: 1, pose: fromBasis(vec3(4000, -67.5, 2460), vec3(-1, 0, 0), vec3(0, 0, 1)), pieceIds: ["TAV-01"], machiningIds: [], params: {} };
    const m = measureAssembly({ pieces, hardware: [staffa] }).spans.find((s) => s.pieceId === "TAV-01")!;
    expect(m.supports.map((s) => s.pieceId)).toEqual(["PIL-01", "STM-01"]);
    expect(m.span).toBeCloseTo(3700, 6);
    expect(m.overhangEnd).toBe(0);
    const mensola = createPiece({ id: "MEN-01", type: "mensola", section: { b: 90, h: 140 }, length: 1200, pose: fromBasis(vec3(0, 0, 2500), vec3(0, 1, 0), vec3(0, 0, 1)) });
    const mm = measureAssembly({ pieces: [mensola], hardware: [{ ...staffa, pieceIds: ["MEN-01"] }] }).spans[0];
    expect(mm.supports).toEqual([]);
    expect(mm.span).toBe(1200);
  });
});
