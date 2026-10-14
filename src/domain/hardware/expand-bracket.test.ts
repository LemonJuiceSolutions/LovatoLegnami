import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../assembly/ids";
import { createPiece } from "../components/schemas";
import type { Piece } from "../components/types";
import { degToRad, fromBasis, translation } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { HardwareError } from "./errors";
import { expandBracket, expandJointNode, nodeWays } from "./expand";

const post = (id: string, s = 90, top = 2400, x = 0, y = 0): Piece =>
  createPiece({ id, type: "pilastro", section: { b: s, h: s }, length: top, pose: fromBasis(vec3(x, y, 0), vec3(0, 0, 1), vec3(1, 0, 0)) });

/** Trave orizzontale che parte a `gap` dal nodo (x0, y0, z) in direzione (dx, dy). */
const beam = (id: string, node: { x: number; y: number; z: number }, dx: number, dy: number, gap = 90, length = 2400, slopeDeg = 0): Piece => {
  const c = Math.cos(degToRad(slopeDeg));
  const dir = vec3(dx * c, dy * c, Math.sin(degToRad(slopeDeg)));
  const up = vec3(-dx * Math.sin(degToRad(slopeDeg)), -dy * Math.sin(degToRad(slopeDeg)), c);
  return createPiece({
    id,
    type: "trave",
    section: { b: 90, h: 90 },
    length,
    pose: fromBasis(vec3(node.x + dir.x * gap, node.y + dir.y * gap, node.z + dir.z * gap), dir, up),
  });
};

describe("staffe e supporti (2.4)", () => {
  it("lama interna su pilastro 90 → asola di testa + 2 fori Ø13 alle quote dichiarate", () => {
    const r = expandBracket({ id: "STT-01", code: "staffa-terra-lama-interna-90", piece: "PIL-01" }, post("PIL-01"));
    expect(r.piece.machinings.map((m) => m.type)).toEqual(["asola-lama", "foro", "foro"]);
    expect(r.piece.machinings[0]).toMatchObject({ face: "testa-inizio", at: 0, width: 8, height: 68, depth: 180, jointId: "STT-01" });
    expect(r.piece.machinings.slice(1)).toEqual([
      expect.objectContaining({ face: "sinistra", at: 60, offset: 0, diameter: 13, jointId: "STT-01" }),
      expect.objectContaining({ face: "sinistra", at: 120, offset: 0, diameter: 13, jointId: "STT-01" }),
    ]);
    expect(r.item).toMatchObject({ id: "STT-01", kind: "staffa-terra", pieceIds: ["PIL-01"], machiningIds: ["PIL-01-L01", "PIL-01-L02", "PIL-01-L03"] });
    expect(r.extras).toEqual([]);
  });

  it("supporto-scomparsa-17 sulla testa a muro di una mensola → asola 8×105×250 + 2 fori Ø15, angolo 17", () => {
    const mensola = createPiece({ id: "MEN-01", type: "mensola", section: { b: 90, h: 160 }, length: 1200, pose: translation(vec3(0, 0, 2800)) });
    const r = expandBracket({ id: "STM-01", code: "supporto-scomparsa-17", piece: "MEN-01" }, mensola);
    expect(r.piece.machinings[0]).toMatchObject({ type: "asola-lama", face: "testa-fine", at: 1200, width: 8, height: 105, depth: 250 });
    expect(r.piece.machinings.slice(1).map((m) => [m.type, m.at, (m as { diameter: number }).diameter])).toEqual([
      ["foro", 1120, 15],
      ["foro", 1010, 15],
    ]);
    expect(r.item.params.angle).toBe(17);
    expect(r.extras).toEqual([expect.objectContaining({ id: "TAS:tassello-10x85", code: "tassello-10x85", quantity: 4 })]);
  });

  it("bicchiere → nessuna lavorazione, voce della staffa e 4 viti 8×40", () => {
    const r = expandBracket({ id: "STT-01", code: "staffa-terra-bicchiere-90", piece: "PIL-01" }, post("PIL-01"));
    expect(r.piece.machinings).toEqual([]);
    expect(r.item).toMatchObject({ code: "staffa-terra-bicchiere-90", machiningIds: [], quantity: 1 });
    expect(r.extras).toEqual([
      { id: "VIT:vite-8x40", code: "vite-8x40", kind: "vite", description: "Vite 8×40", quantity: 4, pieceIds: ["PIL-01"], machiningIds: [], params: {} },
    ]);
  });

  it("sezione non compatibile o schema non applicabile → HardwareError con la staffa", () => {
    expect(() => expandBracket({ id: "STT-02", code: "staffa-terra-lama-interna-90", piece: "PIL-01" }, post("PIL-01", 70))).toThrow(
      /STT-02 "staffa-terra-lama-interna-90": sezione 70×70 del pezzo PIL-01 non compatibile/,
    );
    const corta = createPiece({ id: "MEN-01", type: "mensola", section: { b: 90, h: 100 }, length: 1200, pose: translation(vec3(0, 0, 0)) });
    expect(() => expandBracket({ id: "STM-01", code: "supporto-scomparsa-17", piece: "MEN-01" }, corta)).toThrow(HardwareError);
    expect(() => expandBracket({ id: "STM-01", code: "supporto-scomparsa-17", piece: "MEN-01" }, corta)).toThrow(/height 105/);
  });
});

describe("giunti a N vie e cuspidi (2.4)", () => {
  const node = { x: 0, y: 0, z: 2490 };
  it("nodo con pilastro + 3 travi → giunto a 4 vie con le viti della voce", () => {
    const pieces = [post("PIL-01"), beam("TRV-01", node, 1, 0), beam("TRV-02", node, -1, 0), beam("TRV-03", node, 0, 1)];
    const r = expandJointNode({ id: "GNT-01", point: vec3(0, 0, 2490), pieces: pieces.map((p) => p.id) }, pieces);
    expect(r.item).toMatchObject({ id: "GNT-01", code: "giunto-joint-4-vie-90-90", kind: "giunto-vie", params: { ways: 4, layout: "4", angle: 90 } });
    expect(r.extras).toEqual([expect.objectContaining({ code: "vite-6x40", quantity: 24 })]);
  });

  it("3 vie: angolare all'angolo, lineare sul lato; 75°/105° con travi inclinate di 15°", () => {
    const corner = [post("PIL-01"), beam("TRV-01", node, 1, 0), beam("TRV-02", node, 0, 1)];
    expect(nodeWays(vec3(0, 0, 2490), corner).layout).toBe("3A");
    const side = [beam("TRV-01", node, 1, 0), beam("TRV-02", node, -1, 0), beam("TRV-03", node, 0, 1)];
    expect(nodeWays(vec3(0, 0, 2490), side).layout).toBe("3L");
    // trave che sale di 15° dal pilastro basso → 105°; che scende verso il pilastro alto → 75°
    const low = [post("PIL-01"), beam("TRV-01", node, 1, 0), beam("TRV-02", node, 0, 1, 90, 2400, 15)];
    const rLow = expandJointNode({ id: "GNT-01", point: vec3(0, 0, 2490), pieces: low.map((p) => p.id) }, low);
    expect(rLow.item.code).toBe("giunto-joint-3a-vie-90-105");
    const high = [post("PIL-01"), beam("TRV-01", node, 1, 0), beam("TRV-02", node, 0, 1, 90, 2400, -15)];
    expect(expandJointNode({ id: "GNT-02", point: vec3(0, 0, 2490), pieces: high.map((p) => p.id) }, high).item.code).toBe(
      "giunto-joint-3a-vie-90-75",
    );
  });

  it("codice indicato con vie incoerenti → errore; asta lontana dal nodo → errore", () => {
    const pieces = [post("PIL-01"), beam("TRV-01", node, 1, 0), beam("TRV-02", node, 0, 1)];
    expect(() =>
      expandJointNode({ id: "GNT-01", point: vec3(0, 0, 2490), pieces: pieces.map((p) => p.id), code: "giunto-joint-4-vie-90-90" }, pieces),
    ).toThrow(/4 vie ma nel nodo convergono 3 vie/);
    const far = [post("PIL-01"), post("PIL-02", 90, 2400, 3000, 0)];
    expect(() => expandJointNode({ id: "GNT-01", point: vec3(0, 0, 2490), pieces: ["PIL-01", "PIL-02"] }, far)).toThrow(/PIL-02 non converge/);
  });

  it("cuspide a 8 falde → voce CUS, 8 piastre di testa singole; numero di aste incoerente → errore", () => {
    const top = { x: 0, y: 0, z: 3500 };
    const rafters = Array.from({ length: 8 }, (_, i) => beam(`CAN-0${i + 1}`, top, Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4), 150, 2000, -15));
    const ids = createIdGenerator();
    const cusId = ids.nextHardware("cuspide");
    const r = expandJointNode({ id: cusId, point: vec3(0, 0, 3500), pieces: rafters.map((p) => p.id), code: "cuspide-8-15" }, rafters, ids);
    expect(r.item).toMatchObject({ id: "CUS-01", kind: "cuspide", params: { slopes: 8, angle: 15 } });
    expect(r.extras.map((e) => e.id)).toEqual(["PST-01", "PST-02", "PST-03", "PST-04", "PST-05", "PST-06", "PST-07", "PST-08"]);
    expect(r.extras.every((e) => e.code === "piastra-914" && e.pieceIds.length === 1)).toBe(true);
    expect(() =>
      expandJointNode({ id: "CUS-02", point: vec3(0, 0, 3500), pieces: rafters.slice(0, 4).map((p) => p.id), code: "cuspide-8-15" }, rafters, ids),
    ).toThrow(/richiede 8 aste, ricevute 4/);
  });
});
