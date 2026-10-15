import { describe, expect, it } from "vitest";
import { SECTION_CATALOG, sectionLabel } from "../../components/sections";
import { FAMILY_OF, HARDWARE_KINDS, JOINT_TYPES, MACHINING_TYPES, PIECE_FAMILIES } from "../../components/types";
import { HARDWARE_CATALOG } from "../../hardware/catalog";
import { parsePriceList } from "../types";
import { DEFAULT_PRICE_LIST, DEFAULT_PRICE_LIST_DATA, DEFAULT_PRICE_LIST_VERSION } from "./default-listino";

describe("listino seed v1", () => {
  it("passa parsePriceList ed è la v1 attiva dal 2026-01-01", () => {
    expect(() => parsePriceList(DEFAULT_PRICE_LIST_DATA)).not.toThrow();
    expect(DEFAULT_PRICE_LIST_VERSION).toMatchObject({ version: 1, effectiveFrom: "2026-01-01", status: "attiva" });
  });

  it("ogni codice ferramenta del catalogo ha un prezzo e nessun prezzo è orfano", () => {
    const codes = HARDWARE_CATALOG.map((h) => h.code);
    const priced = Object.keys(DEFAULT_PRICE_LIST.hardware.priceCents);
    expect(codes.filter((c) => !priced.includes(c))).toEqual([]);
    expect(priced.filter((c) => !codes.includes(c))).toEqual([]);
    for (const c of codes) expect(DEFAULT_PRICE_LIST.hardware.priceCents[c]).toBeGreaterThan(0);
  });

  it("ogni tipo di lavorazione ha un tempo", () => {
    for (const t of MACHINING_TYPES) expect(DEFAULT_PRICE_LIST.machining.perType[t], t).toBeDefined();
  });

  it("ogni sezione del catalogo ha lunghezze commerciali, sfrido minimo e prezzo dei curvi", () => {
    const t = DEFAULT_PRICE_LIST.timber;
    for (const s of SECTION_CATALOG) {
      const k = sectionLabel(s);
      expect(t.stockLengths[k]?.map((l) => l.length), k).toEqual([4000, 5000, 6000, 13500]);
      expect(t.stockLengths[k][3].qualities).toEqual(["lamellare"]);
      expect(t.minReusableOffcut[k]).toBe(1000);
      expect(t.curvedPerMl[k]).toBeGreaterThan(0);
    }
    expect([t.kerf, t.endTrim, t.offcutRecoveryPct]).toEqual([4, 10, 30]);
  });

  it("legno: 3 specie × 2 qualità con prezzo al m³", () => {
    const t = DEFAULT_PRICE_LIST.timber;
    expect(t.species.map((s) => s.id)).toEqual(["abete", "larice", "castagno"]);
    expect(t.qualities.map((q) => q.id)).toEqual(["lamellare", "massello"]);
    for (const s of t.species) for (const q of t.qualities) expect(t.pricePerM3[s.id]?.[q.id]).toBeGreaterThan(0);
  });

  it("manodopera completa per famiglia, giunto e ferramenta", () => {
    const l = DEFAULT_PRICE_LIST.labour;
    for (const f of PIECE_FAMILIES) expect(l.minPerPiece[f], f).toBeGreaterThan(0);
    for (const j of JOINT_TYPES) expect(l.minPerJoint[j], j).toBeGreaterThan(0);
    for (const k of HARDWARE_KINDS) expect(l.minPerHardware[k], k).toBeGreaterThan(0);
    expect(Object.keys(FAMILY_OF).length).toBeGreaterThan(0);
  });

  it("cataloghi commerciali e parametri di totale", () => {
    const pl = DEFAULT_PRICE_LIST;
    expect(pl.treatments).toHaveLength(3);
    expect(pl.coverings).toHaveLength(5);
    expect(pl.complications.map((c) => c.id)).toEqual([
      "fuorisquadra",
      "pavimento-non-in-piano",
      "ostacoli",
      "altezza",
      "accesso",
      "affondamento",
    ]);
    expect(pl.transport.zones.filter((z) => z.capPrefixes.length > 0)).toHaveLength(4);
    expect(pl.transport.zones.find((z) => z.name === pl.transport.fallbackZone)?.capPrefixes).toEqual([]);
    expect(pl.transport.zones.map((z) => z.name)).toContain(pl.transport.fallbackZone);
    expect(pl.vatRates.map((v) => v.pct)).toEqual([22, 10]);
    expect(pl.defaultVat).toBe("ordinaria");
    expect([pl.minimumOrderCents, pl.roundingStepCents, pl.indicativityPct]).toEqual([150_000, 1_000, 10]);
  });
});
