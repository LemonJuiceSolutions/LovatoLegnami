import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { zipFiles } from ".";

describe("zipFiles", () => {
  const date = new Date(2026, 9, 14, 9, 30, 0);

  it("crea un archivio con le voci indicate (testo e byte), deterministico a parità di data", () => {
    const entries = [
      { name: "a.sat", content: "ciao" },
      { name: "b.bin", content: new Uint8Array([1, 2, 3]) },
    ];
    const zip = zipFiles(entries, { date });
    const out = unzipSync(zip);
    expect(strFromU8(out["a.sat"])).toBe("ciao");
    expect([...out["b.bin"]]).toEqual([1, 2, 3]);
    expect(zipFiles(entries, { date })).toEqual(zip);
  });

  it("rifiuta nomi duplicati", () => {
    expect(() => zipFiles([{ name: "x", content: "1" }, { name: "x", content: "2" }])).toThrow(/duplicata/);
  });
});
