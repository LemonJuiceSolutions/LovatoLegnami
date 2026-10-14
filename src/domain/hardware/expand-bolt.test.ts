import { describe, expect, it } from "vitest";
import { createPiece } from "../components/schemas";
import type { Foro, Piece } from "../components/types";
import { arcLength } from "../math/arc";
import { applyToPoint, fromBasis, translation } from "../math/mat4";
import { equals, vec3 } from "../math/vec3";
import { HardwareError } from "./errors";
import { expandBolt } from "./expand";

/** Pilastro p×p verticale in (0,0) alto 2400 e due tavole 45×h lungo X ai suoi lati, a filo testa. */
function sandwich(post: number, plank: { b: number; h: number }): Piece[] {
  const pil = createPiece({
    id: "PIL-01",
    type: "pilastro",
    section: { b: post, h: post },
    length: 2400,
    pose: fromBasis(vec3(0, 0, 0), vec3(0, 0, 1), vec3(1, 0, 0)),
  });
  const y = post / 2 + plank.b / 2;
  const tav = (id: string, sign: number) =>
    createPiece({ id, type: "tavola", section: plank, length: 4000, pose: translation(vec3(-500, sign * y, 2400 - plank.h / 2)) });
  return [tav("TAV-01", 1), pil, tav("TAV-02", -1)];
}

const holes = (pieces: Piece[]) => pieces.map((p) => p.machinings.find((m) => m.type === "foro") as Foro);
/** Centro del foro (sistema assieme) sulla faccia d'ingresso. */
const holeCenter = (p: Piece, f: Foro) => {
  const half = f.face === "sinistra" || f.face === "destra" ? p.section.b / 2 : p.section.h / 2;
  const sign = f.face === "sinistra" || f.face === "superiore" ? 1 : -1;
  const local = f.face === "sinistra" || f.face === "destra" ? vec3(f.at, sign * half, f.offset) : vec3(f.at, f.offset, sign * half);
  return applyToPoint(p.pose, local);
};

describe("bullone passante (2.3)", () => {
  it("tavola 45×120 – pilastro 90 – tavola → 3 fori Ø13 allineati, bullone M12×200", () => {
    const pieces = sandwich(90, { b: 45, h: 120 });
    const out = expandBolt({ id: "BUL-01", pieces: ["TAV-01", "PIL-01", "TAV-02"], face: "sinistra", at: 500, offset: 0, diameter: 12 }, pieces);
    const fori = holes(out.pieces);
    expect(fori.every((f) => f.diameter === 13 && f.depth === undefined && f.jointId === "BUL-01")).toBe(true);
    // il pilastro ha Y locale = −Y assieme: il bullone (verso −Y) vi entra dalla faccia destra
    expect(fori.map((f) => f.face)).toEqual(["sinistra", "destra", "sinistra"]);
    // tutti sullo stesso asse: stessa x e z nel sistema assieme
    const centers = out.pieces.map((p, i) => holeCenter(p, fori[i]));
    for (const c of centers) {
      expect(c.x).toBeCloseTo(0, 9);
      expect(c.z).toBeCloseTo(2340, 9);
    }
    expect(fori[1].at).toBeCloseTo(2340, 9);
    expect(out.item).toMatchObject({
      id: "BUL-01",
      code: "bullone-m12x200",
      kind: "bullone",
      quantity: 1,
      pieceIds: ["TAV-01", "PIL-01", "TAV-02"],
      machiningIds: ["TAV-01-L01", "PIL-01-L01", "TAV-02-L01"],
    });
    expect(out.item.params.grip).toBeCloseTo(180, 9);
    expect(equals(applyToPoint(out.item.pose!, vec3(0, 0, 0)), vec3(0, 90, 2340), 1e-9)).toBe(true);
    // l'input non è mutato
    expect(pieces.every((p) => p.machinings.length === 0)).toBe(true);
  });

  it("pilastro 120 e tavole 45×145 → bullone M12×240", () => {
    const out = expandBolt(
      { id: "BUL-01", pieces: ["TAV-01", "PIL-01", "TAV-02"], face: "sinistra", at: 500, offset: 20, diameter: 12 },
      sandwich(120, { b: 45, h: 145 }),
    );
    expect(out.item.code).toBe("bullone-m12x240");
    const fori = holes(out.pieces);
    // sul pilastro verticale l'offset delle tavole (quota) diventa la posizione lungo l'asse
    expect(fori.map((f) => f.offset)).toEqual([20, expect.closeTo(0, 9), 20]);
    expect(fori[1].at).toBeCloseTo(2400 - 72.5 + 20, 9);
  });

  it("pezzo dichiarato e non attraversato → errore con pezzo e bullone", () => {
    const pieces = sandwich(90, { b: 45, h: 120 });
    const far = createPiece({ id: "TAV-03", type: "tavola", section: { b: 45, h: 120 }, length: 1000, pose: translation(vec3(2000, 200, 2340)) });
    try {
      expandBolt({ id: "BUL-02", pieces: ["TAV-01", "PIL-01", "TAV-03"], face: "sinistra", at: 500, offset: 0, diameter: 12 }, [...pieces, far]);
      throw new Error("nessun errore");
    } catch (e) {
      expect(e).toBeInstanceOf(HardwareError);
      expect((e as HardwareError).hardwareId).toBe("BUL-02");
      expect((e as Error).message).toMatch(/TAV-03 non è attraversato dall'asse del bullone BUL-02/);
    }
  });

  it("spessore oltre il catalogo → errore; testa di un arco tra due tavole → foro con at curvilineo", () => {
    expect(() =>
      expandBolt({ id: "BUL-01", pieces: ["TAV-01", "PIL-01", "TAV-02"], face: "sinistra", at: 500, offset: 0, diameter: 8 }, sandwich(90, { b: 45, h: 120 })),
    ).toThrow(/nessun bullone M8 a catalogo per uno spessore di 180 mm/);

    // arco nel piano X–Z (sezione 90, b lungo Y) e due tavole 45 ai lati della testa
    const R = 2400;
    const arco = createPiece({ id: "ARC-01", type: "arco", section: { b: 90, h: 90 }, length: arcLength(R, 90), pose: translation(vec3(0, 0, 0)), curve: { radius: R, sweep: 90 } });
    // testa a 90°: punto dell'asse (R, 0, R); centro del foro 50 mm prima della testa
    const t = (R * Math.PI) / 2 - 50;
    const hx = R * Math.sin(t / R);
    const hz = R * (1 - Math.cos(t / R));
    const tav = (id: string, sign: number) =>
      createPiece({ id, type: "tavola", section: { b: 45, h: 145 }, length: 1000, pose: translation(vec3(hx - 500, sign * 67.5, hz)) });
    const out = expandBolt({ id: "BUL-01", pieces: ["TAV-01", "ARC-01", "TAV-02"], face: "sinistra", at: 500, offset: 0, diameter: 12 }, [
      tav("TAV-01", 1),
      arco,
      tav("TAV-02", -1),
    ]);
    const f = holes(out.pieces)[1];
    expect(f).toMatchObject({ face: "sinistra", diameter: 13 });
    expect(f.at).toBeCloseTo(t, 6);
    expect(f.offset).toBeCloseTo(0, 6);
    expect(out.item.code).toBe("bullone-m12x200");
    // un M8 serra al massimo 120 mm (M8×140): basta per il solo arco 90
    const solo = expandBolt({ id: "BUL-02", pieces: ["ARC-01"], face: "sinistra", at: 1000, offset: 10, diameter: 8 }, [arco]);
    expect(solo.item.code).toBe("bullone-m8x120");
    expect(solo.pieces[0].machinings[0]).toMatchObject({ face: "sinistra", at: expect.closeTo(1000, 6), offset: expect.closeTo(10, 6), diameter: 9 });
  });
});
