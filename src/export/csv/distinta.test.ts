import { describe, expect, it } from "vitest";
import { generate, loadPreset } from "@/domain";
import { createPiece } from "@/domain/components/schemas";
import { translation } from "@/domain/math/mat4";
import { vec3 } from "@/domain/math/vec3";
import { buildDistinta, csvField, formatDecimal, HARDWARE_COLUMNS } from "./distinta";

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
        "PIL-03;pilastro;120×120;2500;1;\r\n" +
        "\r\n" +
        "Codice;Descrizione;Quantità;Pezzi\r\n",
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

describe("buildDistinta – tabella ferramenta (E7)", () => {
  const presetAssembly = (id: string) => {
    const { typologySlug, params } = loadPreset(id);
    return generate(typologySlug, params);
  };

  it("Pergola libera 4×6 → bullone-m12x200 ×12 e vite-6x160 ×36, dopo una riga vuota", () => {
    const assembly = presetAssembly("libera-4x6");
    const { rows, hardwareRows, csv } = buildDistinta(assembly);
    const byCode = new Map(hardwareRows.map((r) => [r.code, r]));
    expect(byCode.get("bullone-m12x200")?.quantity).toBe(12);
    expect(byCode.get("vite-6x160")?.quantity).toBe(36);
    // una riga per codice, quantità totale = somma delle voci
    expect(new Set(hardwareRows.map((r) => r.code)).size).toBe(hardwareRows.length);
    const total = assembly.hardware.reduce((n, h) => n + h.quantity, 0);
    expect(hardwareRows.reduce((n, r) => n + r.quantity, 0)).toBe(total);
    // pezzi collegati ai bulloni: pilastri e tavole forati
    const bolts = byCode.get("bullone-m12x200")!;
    expect(bolts.itemIds).toHaveLength(12);
    expect(bolts.pieceIds.length).toBeGreaterThan(0);
    for (const id of bolts.pieceIds) expect(assembly.pieces.some((p) => p.id === id)).toBe(true);
    expect(bolts.pieceIds.some((id) => id.startsWith("PNT") || id.startsWith("PIL"))).toBe(true);

    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[rows.length + 1]).toBe("");
    expect(lines[rows.length + 2]).toBe(HARDWARE_COLUMNS.join(";"));
    expect(lines).toHaveLength(rows.length + 3 + hardwareRows.length);
    const bolt = lines.find((l) => l.startsWith("bullone-m12x200;"))!;
    const fields = bolt.split(";");
    expect(fields[2]).toBe("12");
    expect(fields[3]).toBe(bolts.pieceIds.join(", "));
    expect(lines.find((l) => l.startsWith("vite-6x160;"))!.split(";")[2]).toBe("36");
  });

  it("tipologia in carpenteria senza ferramenta → solo l'intestazione della seconda tabella", () => {
    const assembly = generate("autoportante-bifalda");
    expect(assembly.hardware).toEqual([]);
    const { rows, hardwareRows, csv } = buildDistinta(assembly);
    expect(hardwareRows).toEqual([]);
    expect(csv.endsWith("\r\n\r\nCodice;Descrizione;Quantità;Pezzi\r\n")).toBe(true);
    expect(csv.slice(1).trimEnd().split("\r\n")).toHaveLength(rows.length + 3);
  });

  it("descrizione con ; tra virgolette e decimali con virgola nelle quantità", () => {
    const { csv } = buildDistinta({
      pieces: [],
      hardware: [
        { id: "VIT-01", code: "vite-x", kind: "vite", description: "Vite; zincata", quantity: 2.5, pieceIds: ["A"], machiningIds: [], params: {} },
        { id: "VIT-02", code: "vite-x", kind: "vite", description: "Vite; zincata", quantity: 1, pieceIds: ["B", "A"], machiningIds: [], params: {} },
      ],
    });
    expect(csv).toContain('\r\nvite-x;"Vite; zincata";3,5;A, B\r\n');
  });
});
