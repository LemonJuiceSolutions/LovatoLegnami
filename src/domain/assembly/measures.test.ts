import { describe, expect, it } from "vitest";
import { createPiece } from "../components/schemas";
import type { Piece } from "../components/types";
import { degToRad, fromBasis, translation } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { contactRange, measureAssembly, measureJoistGroups, measureSpan } from "./measures";

const pilastro = (id: string, x: number, y = 0, h = 2400) =>
  createPiece({ id, type: "pilastro", section: { b: 120, h: 120 }, length: h, pose: fromBasis(vec3(x, y, 0), vec3(0, 0, 1), vec3(0, 1, 0)) });
const trave = (id: string, length: number, y = 0, z = 2400) =>
  createPiece({ id, type: "trave", section: { b: 120, h: 240 }, length, pose: translation(vec3(0, y, z + 120)) });

const S = degToRad(15);
const [cs, sn, tn] = [Math.cos(S), Math.sin(S), Math.tan(S)];

/**
 * Travetto 80×160 che sale verso +Y con pendenza 15°: intradosso passante per
 * lo spigolo superiore in asse della trave (y = 0, z = 2640) e della banchina
 * (y = 3000); spigolo inferiore della testa iniziale a y = yStart.
 */
function travetto(id: string, x: number, yStart = -500, yEnd = 3050): Piece {
  const zAt = (y: number) => 2640 + y * tn;
  const xAxis = vec3(0, cs, sn);
  const zAxis = vec3(0, -sn, cs);
  const origin = vec3(x, yStart - 80 * sn, zAt(yStart) + 80 * cs);
  return createPiece({ id, type: "travetto", section: { b: 80, h: 160 }, length: (yEnd - yStart) / cs, pose: fromBasis(origin, xAxis, zAxis) });
}
const banchina = () =>
  createPiece({ id: "BNC-01", type: "banchina", section: { b: 100, h: 200 }, length: 6000, pose: translation(vec3(0, 3000, 2640 + 3000 * tn - 100)) });

describe("zona d'appoggio", () => {
  it("pilastro sotto la trave: intervallo della faccia superiore del pilastro", () => {
    const r = contactRange(trave("TRV-01", 5400), pilastro("PIL-01", 2700))!;
    expect(r.from).toBeCloseTo(2640, 2);
    expect(r.to).toBeCloseTo(2760, 2);
  });

  it("pezzi distanti → nessun contatto", () => {
    expect(contactRange(trave("TRV-01", 5400), pilastro("PIL-01", 2700, 1000))).toBeUndefined();
  });
});

describe("luce e sbalzo", () => {
  const pezzi = [trave("TRV-01", 5400), pilastro("PIL-01", 200), pilastro("PIL-02", 2700), pilastro("PIL-03", 5200)];

  it("trave su 3 pilastri: luce = distanza tra gli assi, sbalzo oltre le facce esterne", () => {
    const m = measureSpan(pezzi[0], pezzi);
    expect(m.supports.map((s) => s.pieceId)).toEqual(["PIL-01", "PIL-02", "PIL-03"]);
    expect(m.span).toBeCloseTo(2500, 2);
    expect(m.overhangStart).toBeCloseTo(140, 2);
    expect(m.overhangEnd).toBeCloseTo(140, 2);
  });

  it("trave senza appoggi: luce = lunghezza", () => {
    const t = trave("TRV-01", 4000);
    expect(measureSpan(t, [t]).span).toBe(4000);
  });

  it("travetto inclinato su trave e banchina: luce lungo l'asse, sbalzo di gronda in pianta", () => {
    const t = travetto("TVT-01", 40);
    const m = measureSpan(t, [t, trave("TRV-01", 6000), banchina()]);
    expect(m.supports.map((s) => s.pieceId)).toEqual(["TRV-01", "BNC-01"]);
    // centri delle zone d'appoggio: metà a valle di ciascun appoggio (−60..0 e 2950..3000)
    expect(m.span).toBeCloseTo(3005 / cs, 1);
    expect(m.overhangStart).toBeCloseTo(440, 1); // da faccia esterna trave (y = −60) a y = −500
    expect(m.overhangEnd).toBeCloseTo(50, 1); // dalla banchina (y = 3000) alla testa (y = 3050)
  });
});

describe("interasse travetti", () => {
  it("gruppi per falda, interasse effettivo = massimo tra consecutivi", () => {
    const g = measureJoistGroups([travetto("TVT-01", 40), travetto("TVT-03", 1340), travetto("TVT-02", 640)]);
    expect(g).toHaveLength(1);
    expect(g[0].pieceIds).toEqual(["TVT-01", "TVT-02", "TVT-03"]);
    expect(g[0].spacings[0]).toBeCloseTo(600, 6);
    expect(g[0].spacings[1]).toBeCloseTo(700, 6);
    expect(g[0].spacing).toBeCloseTo(700, 6);
  });
});

describe("misure dell'assieme", () => {
  const pezzi = [
    banchina(),
    trave("TRV-01", 6000),
    pilastro("PIL-01", 660),
    pilastro("PIL-02", 3000),
    pilastro("PIL-03", 5340),
    travetto("TVT-01", 40),
    travetto("TVT-02", 640),
  ];
  const m = measureAssembly({ pieces: pezzi });

  it("luci di trave e travetti, interasse, sbalzo massimo", () => {
    const byId = Object.fromEntries(m.spans.map((s) => [s.pieceId, s]));
    expect(Object.keys(byId).sort()).toEqual(["TRV-01", "TVT-01", "TVT-02"]);
    expect(byId["TRV-01"].span).toBeCloseTo(2340, 2);
    expect(byId["TRV-01"].overhang).toBeCloseTo(600, 2);
    expect(m.joistSpacing).toBeCloseTo(600, 6);
    expect(m.maxOverhang).toEqual({ value: expect.closeTo(600, 2), pieceId: "TRV-01" });
  });

  it("altezza libera sotto la trave e pendenza effettiva", () => {
    expect(m.clearHeight?.pieceId).toBe("TRV-01");
    expect(m.clearHeight?.value).toBeCloseTo(2400, 6);
    expect(m.slope).toBeCloseTo(15, 9);
    expect(m.slopes).toHaveLength(2);
  });

  it("assieme senza travetti: niente interasse né pendenza", () => {
    const n = measureAssembly({ pieces: pezzi.slice(1, 5) });
    expect(n.joistSpacing).toBeUndefined();
    expect(n.slope).toBeUndefined();
  });
});
