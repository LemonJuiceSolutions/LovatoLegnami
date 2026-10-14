import { describe, expect, it } from "vitest";
import { identity } from "../math/mat4";
import { ValidationError } from "./errors";
import { MachiningSpecSchema, createPiece, parseJoint, parsePiece } from "./schemas";

const valid = {
  id: "TRV-01",
  type: "trave",
  section: { b: 160, h: 200 },
  length: 4000,
  pose: identity(),
};

function errorOf(fn: () => unknown): ValidationError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    return e as ValidationError;
  }
  throw new Error("nessun errore lanciato");
}

describe("schemi componenti", () => {
  it("pezzo valido: espone id, tipo, famiglia, sezione, lunghezza, posa ed etichetta", () => {
    const p = createPiece({ ...valid, label: "Trave di fronte" });
    expect(p).toEqual({
      id: "TRV-01",
      type: "trave",
      family: "TRV",
      section: { b: 160, h: 200 },
      length: 4000,
      pose: identity(),
      label: "Trave di fronte",
      machinings: [],
    });
    expect(parsePiece(p)).toEqual(p);
  });

  it("tipo non in catalogo → errore che indica il tipo non supportato", () => {
    const e = errorOf(() => createPiece({ ...valid, type: "capriata" }));
    expect(e.issues[0].path).toBe("type");
    expect(e.message).toMatch(/type: tipo di componente non supportato: "capriata"/);
  });

  it.each([
    ["section.b", { ...valid, section: { b: 0, h: 200 } }],
    ["section.h", { ...valid, section: { b: 160, h: -5 } }],
    ["length", { ...valid, length: 0 }],
  ])("dimensione ≤ 0 → errore sul campo %s", (path, input) => {
    const e = errorOf(() => createPiece(input));
    expect(e.issues.map((i) => i.path)).toEqual([path]);
    expect(e.message).toContain(`${path}: deve essere maggiore di 0`);
  });

  it("famiglia incoerente con il tipo e posa malformata", () => {
    const p = createPiece(valid);
    const e = errorOf(() => parsePiece({ ...p, family: "PIL", pose: [1, 0, 0] }));
    expect(e.issues.map((i) => i.path).sort()).toEqual(["family", "pose"]);
    const e2 = errorOf(() => parsePiece({ ...p, family: "PIL" }));
    expect(e2.issues[0].path).toBe("family");
  });

  it("lavorazioni: unione discriminata, tipo sconosciuto rifiutato", () => {
    const ok = MachiningSpecSchema.safeParse({ type: "foro", at: 100, face: "superiore", diameter: 12, offset: 0 });
    expect(ok.success).toBe(true);
    const bad = MachiningSpecSchema.safeParse({ type: "fresatura", at: 100, face: "superiore" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].message).toMatch(/tipo di lavorazione non supportato: "fresatura"/);
    const badFace = MachiningSpecSchema.safeParse({ type: "tenone", at: 0, face: "superiore", width: 1, height: 1, length: 1 });
    expect(badFace.success).toBe(false);
  });

  it("lavorazione con pieceId diverso dal pezzo → errore con percorso", () => {
    const p = createPiece(valid);
    const m = { id: "X-L01", pieceId: "X", type: "foro", at: 10, face: "superiore", diameter: 12, offset: 0 };
    const e = errorOf(() => parsePiece({ ...p, machinings: [m] }));
    expect(e.issues[0].path).toBe("machinings[0].pieceId");
  });

  it("giunti", () => {
    expect(
      parseJoint({ id: "G1", type: "tenone-mortasa", pieceA: "PNT-01", pieceB: "TRV-01", params: { width: 40, height: 80, length: 60, gap: 1 } }),
    ).toBeTruthy();
    expect(parseJoint({ id: "G2", type: "mezzo-legno", pieceA: "TRV-01", pieceB: "TRV-02", params: {} })).toBeTruthy();
    const e = errorOf(() => parseJoint({ id: "G3", type: "incastro", pieceA: "A", pieceB: "B", params: {} }));
    expect(e.message).toMatch(/tipo di giunto non supportato/);
  });
});
