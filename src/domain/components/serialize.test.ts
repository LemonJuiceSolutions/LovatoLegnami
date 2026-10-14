import { describe, expect, it } from "vitest";
import { fromBasis, translation } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { ValidationError } from "./errors";
import { expandJoints } from "./joints";
import { addMachining } from "./machinings";
import { createPiece } from "./schemas";
import { fromJSON, toJSON } from "./serialize";
import type { Assembly, Joint } from "./types";

function sample(): Assembly {
  const trave = createPiece({ id: "TRV-01", type: "trave", section: { b: 160, h: 200 }, length: 4000, pose: translation(vec3(0, 0, 2400)) });
  let puntone = createPiece({
    id: "PNT-01",
    type: "puntone",
    section: { b: 100, h: 100 },
    length: 1000,
    pose: fromBasis(vec3(2000, 0, 2440), vec3(0, 0, 1), vec3(1, 0, 0)),
    label: "Puntone 1",
  });
  puntone = addMachining(puntone, { type: "foro", diameter: 12, offset: 0, at: 500, face: "sinistra", depth: 50 });
  puntone = addMachining(puntone, { type: "taglio-testa", angle: 15, angle2: -5, at: 1000, face: "testa-fine" });
  const joints: Joint[] = [
    { id: "G-01", type: "tenone-mortasa", pieceA: "PNT-01", pieceB: "TRV-01", params: { width: 40, height: 80, length: 60, gap: 1 } },
  ];
  return {
    typologySlug: "piana-test",
    params: { larghezza: 4000, pendenza: 0, sezioneTrave: "160×200", controventi: true },
    pieces: expandJoints(joints, [trave, puntone]),
    joints,
    hardware: [],
    meta: { generatore: "test", schemaVersion: 1 },
  };
}

describe("serializzazione assieme", () => {
  it("round-trip JSON strutturalmente identico", () => {
    const a = sample();
    const text = toJSON(a);
    expect(typeof text).toBe("string");
    expect(fromJSON(text)).toEqual(a);
    expect(toJSON(fromJSON(text))).toBe(text); // stabile
  });

  it("chiavi in ordine stabile indipendente dall'ordine di inserimento", () => {
    const a = sample();
    const reordered: Assembly = {
      meta: a.meta,
      hardware: a.hardware,
      joints: a.joints,
      pieces: a.pieces,
      params: a.params,
      typologySlug: a.typologySlug,
    };
    expect(toJSON(reordered)).toBe(toJSON(a));
  });

  it("campo obbligatorio mancante → errore che cita il percorso", () => {
    const obj = JSON.parse(toJSON(sample()));
    delete obj.pieces[1].section.h;
    try {
      fromJSON(JSON.stringify(obj));
      throw new Error("nessun errore");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).issues.map((i) => i.path)).toContain("pieces[1].section.h");
      expect((e as Error).message).toMatch(/pieces\[1\]\.section\.h/);
    }
  });

  it("tipo errato → errore con percorso", () => {
    const obj = JSON.parse(toJSON(sample()));
    obj.pieces[0].machinings[0].depth = "61";
    expect(() => fromJSON(JSON.stringify(obj))).toThrow(/pieces\[0\]\.machinings\[0\]\.depth/);
  });

  it("riferimenti incoerenti e JSON malformato", () => {
    const obj = JSON.parse(toJSON(sample()));
    obj.joints[0].pieceB = "TRV-99";
    expect(() => fromJSON(JSON.stringify(obj))).toThrow(/joints\[0\]\.pieceB/);
    const dup = JSON.parse(toJSON(sample()));
    dup.pieces[1].id = "TRV-01";
    expect(() => fromJSON(JSON.stringify(dup))).toThrow(/duplicato/);
    expect(() => fromJSON("{ non json")).toThrow(ValidationError);
  });

  it("toJSON rifiuta un assieme non valido", () => {
    const a = sample();
    expect(() => toJSON({ ...a, typologySlug: "" })).toThrow(/typologySlug/);
  });
});
