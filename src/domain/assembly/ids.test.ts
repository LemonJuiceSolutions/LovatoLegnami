import { describe, expect, it } from "vitest";
import { createIdGenerator, formatJointId, formatPieceId, parsePieceId } from "./ids";

describe("id stabili", () => {
  it("formato <FAM>-<nn> con due cifre minime", () => {
    expect(formatPieceId("PIL", 1)).toBe("PIL-01");
    expect(formatPieceId("TVT", 11)).toBe("TVT-11");
    expect(formatPieceId("TVT", 123)).toBe("TVT-123");
    expect(formatJointId(3)).toBe("G-03");
    expect(() => formatPieceId("PIL", 0)).toThrow();
  });

  it("contatore indipendente per famiglia, derivabile dal tipo", () => {
    const g = createIdGenerator();
    expect(g.nextPiece("pilastro")).toBe("PIL-01");
    expect(g.nextPiece("trave")).toBe("TRV-01");
    expect(g.nextPiece("PIL")).toBe("PIL-02");
    expect(g.nextPiece("travetto")).toBe("TVT-01");
    expect(g.nextJoint()).toBe("G-01");
    expect(g.nextJoint()).toBe("G-02");
  });

  it("deterministico: stessa sequenza → stessi id", () => {
    const seq = ["pilastro", "pilastro", "trave", "travetto", "pilastro", "banchina"] as const;
    const run = () => {
      const g = createIdGenerator();
      return seq.map((t) => g.nextPiece(t));
    };
    expect(run()).toEqual(run());
    expect(run()).toEqual(["PIL-01", "PIL-02", "TRV-01", "TVT-01", "PIL-03", "BNC-01"]);
  });

  it("famiglia sconosciuta → errore", () => {
    const g = createIdGenerator();
    expect(() => g.nextPiece("XYZ" as never)).toThrow(/sconosciuto/);
  });

  it("parsePieceId", () => {
    expect(parsePieceId("CTV-06")).toEqual({ family: "CTV", n: 6 });
    expect(parsePieceId("ABC-01")).toBeUndefined();
    expect(parsePieceId("PIL1")).toBeUndefined();
  });
});
