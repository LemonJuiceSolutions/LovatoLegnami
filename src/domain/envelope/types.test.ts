import { describe, expect, it } from "vitest";
import { ValidationError } from "../components/errors";
import { type Side, absoluteObstacles, parseEnvelope, toAbsoluteBox } from "./types";

const base = { box: { width: 6000, depth: 3500, height: 3000 } };

describe("ingombro base", () => {
  it("6000×3500×3000 accettato, muro posteriore di default, pavimento piano", () => {
    const e = parseEnvelope(base);
    expect(e.box).toEqual({ width: 6000, depth: 3500, height: 3000 });
    expect(e.wallSide).toBe("posteriore");
    expect(e.obstacles).toEqual([]);
    expect(e.floor).toEqual({ corners: { frontLeft: 0, frontRight: 0, backLeft: 0, backRight: 0 }, points: [] });
  });

  it("altezza 0 → errore sul campo altezza", () => {
    expect(() => parseEnvelope({ box: { width: 6000, depth: 3500, height: 0 } })).toThrow(ValidationError);
    try {
      parseEnvelope({ box: { width: 6000, depth: 3500, height: 0 } });
    } catch (e) {
      expect((e as ValidationError).issues).toEqual([{ path: "box.height", message: "altezza: deve essere maggiore di 0" }]);
    }
    expect(() => parseEnvelope({ box: { width: -1, depth: 3500, height: 3000 } })).toThrow(/box\.width: larghezza/);
  });

  it("rifiuta lato muro e tipo di ostacolo non validi e id duplicati", () => {
    expect(() => parseEnvelope({ ...base, wallSide: "soffitto" })).toThrow(/lato muro non valido/);
    const o = { id: "o1", type: "camino", side: "posteriore", height: 100 };
    expect(() => parseEnvelope({ ...base, obstacles: [o] })).toThrow(/tipo di ostacolo non valido: "camino"/);
    const g = { id: "o1", type: "generico", side: "posteriore", height: 100 };
    expect(() => parseEnvelope({ ...base, obstacles: [g, g] })).toThrow(/obstacles\[1\]\.id: id ostacolo duplicato/);
  });
});

describe("ostacoli come box assoluti", () => {
  it("grondaia posteriore a 2700, sporgente 150, alta 120, per tutta la larghezza", () => {
    const e = parseEnvelope({ ...base, obstacles: [{ id: "grondaia", type: "grondaia", side: "posteriore", elevation: 2700, height: 120, projection: 150 }] });
    const r = toAbsoluteBox(e, e.obstacles[0]);
    expect(r.aabb).toEqual({ min: { x: 0, y: 3350, z: 2700 }, max: { x: 6000, y: 3500, z: 2820 } });
    expect(r.ignored).toBe(false);
    expect(r.warning).toBeUndefined();
  });

  it("finestra sul lato sinistro: offset 1000 dal fronte, 1200×1400 a quota 900, aderente al lato", () => {
    const e = parseEnvelope({ ...base, obstacles: [{ id: "fin", type: "finestra", side: "sinistro", offset: 1000, width: 1200, elevation: 900, height: 1400 }] });
    const r = toAbsoluteBox(e, e.obstacles[0]);
    expect(r.aabb).toEqual({ min: { x: 0, y: 1000, z: 900 }, max: { x: 100, y: 2200, z: 2300 } });
  });

  it("converte tutti e 6 i lati", () => {
    const o = { offset: 100, width: 200, elevation: 300, height: 400, projection: 50 };
    const sides: Side[] = ["anteriore", "posteriore", "sinistro", "destro", "pavimento", "soffitto"];
    const e = parseEnvelope({ ...base, obstacles: sides.map((side) => ({ id: side, type: "generico", side, ...o })) });
    const boxes = Object.fromEntries(absoluteObstacles(e).map((r) => [r.obstacleId, [r.aabb.min, r.aabb.max].map((p) => [p.x, p.y, p.z])]));
    expect(boxes).toEqual({
      anteriore: [[100, 0, 300], [300, 50, 700]],
      posteriore: [[100, 3450, 300], [300, 3500, 700]],
      sinistro: [[0, 100, 300], [50, 300, 700]],
      destro: [[5950, 100, 300], [6000, 300, 700]],
      pavimento: [[100, 300, 0], [300, 700, 50]],
      soffitto: [[100, 300, 2950], [300, 700, 3000]],
    });
  });

  it("ostacolo interamente fuori dal box → avviso \"ostacolo fuori ingombro\" e ignorato", () => {
    const e = parseEnvelope({ ...base, obstacles: [{ id: "alto", type: "sporgenza", side: "posteriore", elevation: 3200, height: 200 }] });
    const r = toAbsoluteBox(e, e.obstacles[0]);
    expect(r.ignored).toBe(true);
    expect(r.warning).toMatch(/^ostacolo fuori ingombro: alto/);
  });
});
