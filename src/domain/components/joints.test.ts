import { describe, expect, it } from "vitest";
import { fromBasis, translation } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { JointError } from "./errors";
import { expandJoint, expandJoints } from "./joints";
import { createPiece } from "./schemas";
import type { Joint, Mortasa, MezzoLegno, Piece, Tenone } from "./types";

const byId = (ps: readonly Piece[], id: string): Piece => ps.find((p) => p.id === id)!;

describe("giunto tenone-mortasa", () => {
  // trave lungo X, piano superiore a quota 2500
  const trave = createPiece({ id: "TRV-01", type: "trave", section: { b: 160, h: 200 }, length: 4000, pose: translation(vec3(0, 0, 2400)) });
  // puntone verticale che entra dall'alto: punta del tenone 60 mm dentro la trave
  const puntone = createPiece({
    id: "PNT-01",
    type: "puntone",
    section: { b: 100, h: 100 },
    length: 1000,
    pose: fromBasis(vec3(2000, 0, 2440), vec3(0, 0, 1), vec3(1, 0, 0)),
  });
  const joint: Joint = {
    id: "G-01",
    type: "tenone-mortasa",
    pieceA: "PNT-01",
    pieceB: "TRV-01",
    params: { width: 40, height: 80, length: 60, gap: 1 },
  };

  it("tenone 40×80×60 sul puntone e mortasa 41×81×61 sulla trave nel punto di incrocio", () => {
    const out = expandJoint(joint, [trave, puntone]);
    expect(out.map((p) => p.id)).toEqual(["TRV-01", "PNT-01"]);
    const [t] = byId(out, "PNT-01").machinings as Tenone[];
    expect(t).toMatchObject({ type: "tenone", width: 40, height: 80, length: 60, at: 0, face: "testa-inizio", jointId: "G-01" });
    const [m] = byId(out, "TRV-01").machinings as Mortasa[];
    expect(m).toMatchObject({ type: "mortasa", width: 41, height: 81, depth: 61, face: "superiore", jointId: "G-01" });
    expect(m.at).toBeCloseTo(2000, 9);
    expect(m.offset).toBeCloseTo(0, 9);
    expect(m.angle).toBeCloseTo(90, 9); // la larghezza del tenone (Y del puntone) è trasversale alla trave
    expect(trave.machinings).toEqual([]); // input non mutati
  });

  it("tenone sulla testa più vicina: puntone dal basso entra nella faccia inferiore", () => {
    const sotto = createPiece({
      ...puntone,
      pose: fromBasis(vec3(1500, 30, 2300 - 1000 + 60), vec3(0, 0, 1), vec3(0, 1, 0)),
    });
    const out = expandJoint(joint, [trave, sotto]);
    expect(byId(out, "PNT-01").machinings[0]).toMatchObject({ face: "testa-fine", at: 1000 });
    const m = byId(out, "TRV-01").machinings[0] as Mortasa;
    expect(m.face).toBe("inferiore");
    expect(m.at).toBeCloseTo(1500, 9);
    expect(m.offset).toBeCloseTo(30, 9);
    expect(m.angle).toBeCloseTo(0, 9); // Y del puntone lungo X della trave
  });

  it("pezzo mancante → errore con id giunto", () => {
    expect(() => expandJoint(joint, [trave])).toThrow(JointError);
    expect(() => expandJoint(joint, [trave])).toThrow(/G-01.*PNT-01/);
  });
});

describe("giunto mezzo legno", () => {
  const a = createPiece({ id: "TRV-01", type: "trave", section: { b: 160, h: 200 }, length: 4000, pose: translation(vec3(0, 0, 0)) });
  const b = createPiece({
    id: "TRV-02",
    type: "trave",
    section: { b: 120, h: 200 },
    length: 3000,
    pose: fromBasis(vec3(1000, -500, 0), vec3(0, 1, 0), vec3(0, 0, 1)),
  });
  const joint: Joint = { id: "G-02", type: "mezzo-legno", pieceA: "TRV-01", pieceB: "TRV-02", params: {} };

  it("ogni trave riceve un mezzo legno profondo metà altezza nella zona di sovrapposizione", () => {
    const out = expandJoint(joint, [a, b]);
    const ma = byId(out, "TRV-01").machinings[0] as MezzoLegno;
    const mb = byId(out, "TRV-02").machinings[0] as MezzoLegno;
    expect(ma).toMatchObject({ type: "mezzo-legno", depth: 100, face: "superiore", jointId: "G-02" });
    expect(ma.at).toBeCloseTo(1000, 9);
    expect(ma.width).toBeCloseTo(120, 9);
    expect(mb).toMatchObject({ type: "mezzo-legno", depth: 100, face: "inferiore" });
    expect(mb.at).toBeCloseTo(500, 9);
    expect(mb.width).toBeCloseTo(160, 9);
  });

  it("travi a quote diverse: la superiore è intagliata sotto, l'inferiore sopra", () => {
    const alta = createPiece({ ...b, pose: fromBasis(vec3(1000, -500, 50), vec3(0, 1, 0), vec3(0, 0, 1)) });
    const out = expandJoint({ ...joint, pieceA: "TRV-02", pieceB: "TRV-01" }, [a, alta]);
    expect(byId(out, "TRV-02").machinings[0].face).toBe("inferiore");
    expect(byId(out, "TRV-01").machinings[0].face).toBe("superiore");
  });

  it("travi che non si toccano → errore", () => {
    const lontana = createPiece({ ...b, pose: fromBasis(vec3(5000, -500, 0), vec3(0, 1, 0), vec3(0, 0, 1)) });
    expect(() => expandJoint(joint, [a, lontana])).toThrow(/non si sovrappongono/);
  });

  it("expandJoints applica tutti i giunti in ordine", () => {
    const out = expandJoints([joint], [a, b]);
    expect(out.flatMap((p) => p.machinings.map((m) => m.id))).toEqual(["TRV-01-L01", "TRV-02-L01"]);
  });
});
