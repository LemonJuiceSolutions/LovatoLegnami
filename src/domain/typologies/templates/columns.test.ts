import { describe, expect, it } from "vitest";
import type { Assembly } from "../../components/types";
import { floorFunction } from "../../envelope/floor";
import { parseEnvelope } from "../../envelope/types";
import { originOf } from "../../math/mat4";
import { generate } from "../registry";

const SLUG = "autoportante-bifalda";
const flat = generate(SLUG);
const columns = (a: Assembly) => a.pieces.filter((p) => p.type === "pilastro");
const rowsY = [...new Set(columns(flat).map((p) => originOf(p.pose).y))].sort((a, b) => a - b);

/** Pavimento che scende linearmente di 100 mm dalla fila anteriore a quella posteriore. */
const sloped = (_x: number, y: number) => (-100 * (y - rowsY[0])) / (rowsY[1] - rowsY[0]);

describe("lunghezza individuale dei pilastri", () => {
  it("pavimento che scende di 100 mm: pilastri anteriori 2400, posteriori 2500", () => {
    const a = generate(SLUG, {}, { floorHeightAt: sloped });
    expect(rowsY).toHaveLength(2);
    for (const p of columns(a)) {
      const o = originOf(p.pose);
      expect(p.length).toBeCloseTo(o.y === rowsY[0] ? 2400 : 2500, 9);
      expect(o.z).toBeCloseTo(sloped(o.x, o.y), 9); // piede sul pavimento
      expect(o.z + p.length).toBeCloseTo(2400, 9); // testa alla quota d'imposta
    }
  });

  it("travi, colmo, travetti e puntoni invariati rispetto al pavimento piano", () => {
    const a = generate(SLUG, {}, { floorHeightAt: sloped });
    const others = (x: Assembly) => x.pieces.filter((p) => p.type !== "pilastro" && p.type !== "controvento");
    expect(others(a)).toEqual(others(flat));
  });

  it("affondamento sommato alla lunghezza con il piede sotto il pavimento", () => {
    const a = generate(SLUG, {}, { floorHeightAt: sloped, embedment: 300 });
    for (const p of columns(a)) {
      const o = originOf(p.pose);
      expect(p.length).toBeCloseTo(o.y === rowsY[0] ? 2700 : 2800, 9);
      expect(o.z).toBeCloseTo(sloped(o.x, o.y) - 300, 9);
    }
    expect(() => generate(SLUG, {}, { embedment: -1 })).toThrow(/affondamento/);
  });

  it("con il pavimento dell'ingombro (angoli posteriori −100) i pilastri seguono la quota locale", () => {
    const e = parseEnvelope({ box: { width: 6000, depth: 3500, height: 3500 }, floor: { corners: { backLeft: -100, backRight: -100 } } });
    const f = floorFunction(e);
    const a = generate("addossata-monofalda", {}, { floorHeightAt: f });
    for (const p of columns(a)) {
      const o = originOf(p.pose);
      expect(p.length).toBeCloseTo(2400 - f(o.x, o.y), 9);
    }
  });
});
