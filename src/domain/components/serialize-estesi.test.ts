import { describe, expect, it } from "vitest";
import { arcLength } from "../math/arc";
import { translation } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { ValidationError } from "./errors";
import { addMachining } from "./machinings";
import { createPiece, parseHardwareItem } from "./schemas";
import { fromJSON, toJSON } from "./serialize";
import type { Assembly, HardwareItem, Piece } from "./types";

function sample(): Assembly {
  let pil = createPiece({ id: "PIL-01", type: "pilastro", section: { b: 90, h: 90 }, length: 2400, pose: translation(vec3(0, 0, 0)) });
  let tav1 = createPiece({ id: "TAV-01", type: "tavola", section: { b: 45, h: 120 }, length: 4000, pose: translation(vec3(-500, 67.5, 2340)) });
  let tav2 = createPiece({ id: "TAV-02", type: "tavola", section: { b: 45, h: 120 }, length: 4000, pose: translation(vec3(-500, -67.5, 2340)) });
  let arco = createPiece({
    id: "ARC-01",
    type: "arco",
    section: { b: 90, h: 90 },
    length: arcLength(2400, 93),
    pose: translation(vec3(800, 0, 0)),
    curve: { radius: 2400, sweep: 93 },
  });
  const bolt = (id: string, at: number, pieces: Piece[]): [Piece[], HardwareItem] => {
    const out = pieces.map((p) => addMachining(p, { type: "foro", face: "sinistra", at, diameter: 13, offset: 0, jointId: id }));
    return [
      out,
      {
        id,
        code: "bullone-m12x200",
        kind: "bullone",
        description: "Bullone passante M12×200",
        quantity: 1,
        pose: translation(vec3(0, 0, 2340)),
        pieceIds: out.map((p) => p.id),
        machiningIds: out.map((p) => p.machinings[p.machinings.length - 1].id),
        params: { diameter: 12, length: 200 },
      },
    ];
  };
  let b1: HardwareItem;
  [[tav1, tav2], b1] = bolt("BUL-01", 500, [tav1, tav2]);
  let b2: HardwareItem;
  [[tav1, pil, tav2], b2] = bolt("BUL-02", 600, [tav1, pil, tav2]);
  arco = addMachining(arco, { type: "foro", face: "sinistra", at: 3700, diameter: 9, offset: 0, jointId: "BUL-03" });
  const b3: HardwareItem = {
    id: "BUL-03",
    code: "bullone-m8x120",
    kind: "bullone",
    description: "Bullone M8×120",
    quantity: 1,
    pieceIds: ["ARC-01"],
    machiningIds: [arco.machinings[0].id],
    params: {},
  };
  return {
    typologySlug: "carport-test",
    params: { costruzione: "bullonata" },
    pieces: [pil, tav1, tav2, arco],
    joints: [],
    hardware: [b1, b2, b3],
    meta: {},
  };
}

describe("serializzazione con ferramenta e pezzi curvi (1.8)", () => {
  it("JSON senza hardware (file precedente) → letto con elenco vuoto, riscritto con hardware: []", () => {
    const obj = JSON.parse(toJSON(sample()));
    delete obj.hardware;
    const a = fromJSON(JSON.stringify(obj));
    expect(a.hardware).toEqual([]);
    expect(JSON.parse(toJSON(a)).hardware).toEqual([]);
  });

  it("round-trip di un assieme con un arco e tre voci di ferramenta identico", () => {
    const a = sample();
    const text = toJSON(a);
    expect(JSON.parse(text).pieces[3].curve).toEqual({ radius: 2400, sweep: 93 });
    expect(fromJSON(text)).toEqual(a);
    expect(toJSON(fromJSON(text))).toBe(text);
  });

  it("riferimenti della ferramenta a pezzi o lavorazioni inesistenti e id duplicati → errore con percorso", () => {
    const a = sample();
    const bad = { ...a, hardware: [{ ...a.hardware[0], pieceIds: ["PIL-99"], machiningIds: ["X-L01"] }, { ...a.hardware[1], id: "BUL-01" }] };
    try {
      toJSON(bad);
      throw new Error("nessun errore");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).issues.map((i) => i.path)).toEqual(["hardware[0].pieceIds[0]", "hardware[0].machiningIds[0]", "hardware[1].id"]);
    }
  });

  it("voce di ferramenta con tipo sconosciuto → errore sul percorso kind", () => {
    const item = sample().hardware[0];
    expect(() => parseHardwareItem({ ...item, kind: "chiodo" })).toThrow(/kind: tipo di ferramenta non supportato: "chiodo"/);
    expect(() => parseHardwareItem({ ...item, quantity: 1.5 })).toThrow(/quantity/);
  });
});
