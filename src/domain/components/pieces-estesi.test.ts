import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../assembly/ids";
import { identity } from "../math/mat4";
import { ValidationError } from "./errors";
import { createPiece, curveLength, parsePiece } from "./schemas";
import { FAMILY_OF, PIECE_FAMILIES, PIECE_TYPES } from "./types";

function errorOf(fn: () => unknown): ValidationError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    return e as ValidationError;
  }
  throw new Error("nessun errore lanciato");
}

const arcLen = curveLength({ radius: 2400, sweep: 93 });

describe("primitivi estesi e pezzi curvi (1.1)", () => {
  it("catalogo: 14 tipi, famiglie distinte e coerenti", () => {
    expect(PIECE_TYPES).toHaveLength(14);
    expect(new Set(Object.values(FAMILY_OF)).size).toBe(14);
    for (const t of PIECE_TYPES) expect(PIECE_FAMILIES).toContain(FAMILY_OF[t]);
  });

  it("tavola 45×120 accettata con famiglia TAV e id TAV-nn", () => {
    const id = createIdGenerator().nextPiece("tavola");
    expect(id).toMatch(/^TAV-\d{2}$/);
    const p = createPiece({ id, type: "tavola", section: { b: 45, h: 120 }, length: 4000, pose: identity() });
    expect(p.family).toBe("TAV");
    expect(p.curve).toBeUndefined();
  });

  it("cantonale con famiglia PNT → rifiutato per incoerenza tipo/famiglia", () => {
    const p = createPiece({ id: "CAN-01", type: "cantonale", section: { b: 70, h: 70 }, length: 2000, pose: identity() });
    const e = errorOf(() => parsePiece({ ...p, family: "PNT" }));
    expect(e.issues.map((i) => i.path)).toEqual(["family"]);
    expect(e.message).toMatch(/famiglia PNT incoerente con il tipo cantonale/);
  });

  it("arco R2400 93° con lunghezza 3895 ± 1 accettato", () => {
    expect(arcLen).toBeCloseTo(3895.6, 1);
    for (const length of [3895, arcLen, 3896]) {
      const p = createPiece({
        id: "ARC-01",
        type: "arco",
        section: { b: 90, h: 90 },
        length,
        pose: identity(),
        curve: { radius: 2400, sweep: 93 },
      });
      expect(p.family).toBe("ARC");
      expect(p.curve).toEqual({ radius: 2400, sweep: 93 });
    }
  });

  it("arco con lunghezza 3000 → rifiutato citando lo sviluppo", () => {
    const e = errorOf(() =>
      createPiece({ id: "ARC-01", type: "arco", section: { b: 90, h: 90 }, length: 3000, pose: identity(), curve: { radius: 2400, sweep: 93 } }),
    );
    expect(e.issues.map((i) => i.path)).toEqual(["length"]);
    expect(e.message).toMatch(/non corrisponde allo sviluppo/);
    expect(e.message).toContain("3895,6");
  });

  it("arco senza curvatura → rifiutato; trave con curvatura → rifiutata", () => {
    const e1 = errorOf(() => createPiece({ id: "ARC-01", type: "arco", section: { b: 90, h: 90 }, length: 3000, pose: identity() }));
    expect(e1.issues.map((i) => i.path)).toEqual(["curve"]);
    expect(e1.message).toMatch(/richiede la curvatura/);
    const e2 = errorOf(() =>
      createPiece({ id: "TRV-01", type: "trave", section: { b: 90, h: 90 }, length: 3895, pose: identity(), curve: { radius: 2400, sweep: 93 } }),
    );
    expect(e2.issues.map((i) => i.path)).toEqual(["curve"]);
    expect(e2.message).toMatch(/solo arco ammette la curvatura/);
  });

  it("curvatura malformata → errore con percorso", () => {
    const e = errorOf(() =>
      createPiece({ id: "ARC-01", type: "arco", section: { b: 90, h: 90 }, length: 100, pose: identity(), curve: { radius: 0, sweep: 400 } }),
    );
    expect(e.issues.map((i) => i.path)).toEqual(expect.arrayContaining(["curve.radius", "curve.sweep"]));
  });
});
