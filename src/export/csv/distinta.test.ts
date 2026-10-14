import { describe, expect, it } from "vitest";
import { generate } from "@/domain";
import { createPiece } from "@/domain/components/schemas";
import { translation } from "@/domain/math/mat4";
import { vec3 } from "@/domain/math/vec3";
import { buildDistinta, csvField, formatDecimal } from "./distinta";

const pillar = (id: string, length: number, x: number) =>
  createPiece({ id, type: "pilastro", section: { b: 120, h: 120 }, length, pose: translation(vec3(x, 0, 0)) });

describe("buildDistinta", () => {
  it("11 travetti identici → 1 riga con quantità 11 e gli 11 id", () => {
    const assembly = generate("addossata-monofalda");
    const joists = assembly.pieces.filter((p) => p.type === "travetto");
    expect(joists).toHaveLength(11);
    const { rows, csv } = buildDistinta(assembly);
    const row = rows.filter((r) => r.type === "travetto");
    expect(row).toHaveLength(1);
    expect(row[0].quantity).toBe(11);
    expect(row[0].ids).toEqual(joists.map((p) => p.id));
    const line = csv.split("\r\n").find((l) => l.includes(";travetto;"))!;
    expect(line.startsWith(`${joists.map((p) => p.id).join(", ")};travetto;`)).toBe(true);
    expect(line.split(";")[4]).toBe("11");
    expect(rows.reduce((n, r) => n + r.quantity, 0)).toBe(assembly.pieces.length);
  });

  it("pilastri 2400/2400/2500 → due righe (2 e 1)", () => {
    const { rows, csv } = buildDistinta({
      pieces: [pillar("PIL-01", 2400, 0), pillar("PIL-02", 2400, 2000), pillar("PIL-03", 2500, 4000)],
    });
    expect(rows.map((r) => [r.ids, r.length, r.quantity])).toEqual([
      [["PIL-01", "PIL-02"], 2400, 2],
      [["PIL-03"], 2500, 1],
    ]);
    expect(csv).toBe(
      "﻿ID;Tipo;Sezione;Lunghezza;Quantità;Lavorazioni\r\n" +
        "PIL-01, PIL-02;pilastro;120×120;2400;2;\r\n" +
        "PIL-03;pilastro;120×120;2500;1;\r\n",
    );
  });

  it("decimali con virgola, lavorazioni riepilogate e campi con ; tra virgolette", () => {
    const p = createPiece({
      id: "PIL-01",
      type: "pilastro",
      section: { b: 120, h: 120 },
      length: 2412.36,
      pose: translation(vec3(0, 0, 0)),
      machinings: [
        { id: "PIL-01-L01", pieceId: "PIL-01", type: "foro", face: "sinistra", at: 300, diameter: 12, offset: 0 },
        { id: "PIL-01-L02", pieceId: "PIL-01", type: "foro", face: "sinistra", at: 900, diameter: 12, offset: 0 },
      ],
    });
    const { rows, csv } = buildDistinta({ pieces: [p] });
    expect(rows[0].machinings).toBe("foro ×2");
    expect(csv).toContain(";2412,4;1;foro ×2\r\n");
    expect(formatDecimal(-0.01)).toBe("0");
    expect(csvField('a;"b"')).toBe('"a;""b"""');
  });
});
