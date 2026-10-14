import { describe, expect, it } from "vitest";
import { exportFileName, fileSlug, fileTimestamp } from "./filename";

describe("nomi file di export", () => {
  it("monofalda il 14/10/2026 alle 09:30 → pergola-addossata-monofalda-20261014-0930.sat", () => {
    const date = new Date(2026, 9, 14, 9, 30, 45);
    expect(exportFileName("addossata-monofalda", "sat", date)).toBe("pergola-addossata-monofalda-20261014-0930.sat");
  });

  it("estensioni con punto, slug normalizzati e data con zeri", () => {
    const date = new Date(2027, 0, 2, 3, 4);
    expect(fileTimestamp(date)).toBe("20270102-0304");
    expect(exportFileName("autoportante-bifalda", ".zip", date)).toBe("pergola-autoportante-bifalda-20270102-0304.zip");
    expect(fileSlug(" Tettoia Più  Grande/2 ")).toBe("tettoia-piu-grande-2");
    expect(fileSlug("***")).toBe("senza-nome");
  });
});
