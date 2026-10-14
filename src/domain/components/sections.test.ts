import { describe, expect, it } from "vitest";
import { SECTION_CATALOG, findSection, parseSectionLabel, sectionLabel, sectionsByBendingHeight } from "./sections";

describe("catalogo sezioni", () => {
  it("lookup per etichetta", () => {
    expect(findSection("120×240")).toEqual({ b: 120, h: 240 });
    expect(findSection("120x240")).toEqual({ b: 120, h: 240 });
    expect(findSection(" 160 × 200 ")).toEqual({ b: 160, h: 200 });
    expect(findSection("130×250")).toBeUndefined();
    expect(findSection("abc")).toBeUndefined();
  });

  it("etichetta e parsing", () => {
    expect(sectionLabel({ b: 80, h: 160 })).toBe("80×160");
    expect(parseSectionLabel("60X80")).toEqual({ b: 60, h: 80 });
    expect(parseSectionLabel("0×80")).toBeUndefined();
  });

  it("contiene le sezioni commerciali della spec, senza duplicati", () => {
    const labels = SECTION_CATALOG.map(sectionLabel);
    for (const l of ["100×100", "120×120", "140×140", "160×160", "80×160", "100×200", "120×240", "160×200", "60×120", "60×80"])
      expect(labels).toContain(l);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("ordinate per altezza crescente, poi base crescente", () => {
    const all = sectionsByBendingHeight();
    expect(all).toHaveLength(SECTION_CATALOG.length);
    for (let i = 1; i < all.length; i++) {
      const [a, b] = [all[i - 1], all[i]];
      expect(a.h < b.h || (a.h === b.h && a.b <= b.b)).toBe(true);
    }
    expect(all.slice(0, 3).map(sectionLabel)).toEqual(["60×80", "100×100", "60×120"]);
  });

  it("filtro per altezza minima", () => {
    const s = sectionsByBendingHeight(200);
    expect(s.map(sectionLabel)).toEqual(["100×200", "120×200", "160×200", "120×240"]);
    expect(sectionsByBendingHeight(1000)).toEqual([]);
  });
});
