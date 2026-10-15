import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/domain/math/canonical";
import { identity } from "@/domain/math/mat4";
import { generate } from "@/domain/typologies";
import { FAMILY_OF, type Piece, type PieceType } from "../components/types";
import { planAssemblyCuts } from "./assembly-cuts";
import { DEFAULT_PRICE_LIST } from "./data/default-listino";
import type { PriceList } from "./types";

let seq = 0;
const piece = (type: PieceType, b: number, h: number, length: number, extra: Partial<Piece> = {}): Piece => ({
  id: `${FAMILY_OF[type]}-${String(++seq).padStart(2, "0")}`,
  type,
  family: FAMILY_OF[type],
  section: { b, h },
  length,
  pose: identity(),
  label: type,
  machinings: [],
  ...extra,
});
const many = (n: number, f: () => Piece) => Array.from({ length: n }, f);

/** Listino seed con le modifiche richieste al legno. */
const withTimber = (patch: Partial<PriceList["timber"]>): PriceList => ({
  ...DEFAULT_PRICE_LIST,
  timber: { ...DEFAULT_PRICE_LIST.timber, ...patch },
});

const LAMELLARE = { species: "abete", quality: "lamellare" };
const MASSELLO = { species: "abete", quality: "massello" };

describe("planAssemblyCuts", () => {
  it("11 travetti 80×160 da 3200: massello su 4/5/6 m → 11 barre da 4000, sfrido 20%", () => {
    const pieces = many(11, () => piece("travetto", 80, 160, 3200));
    const plan = planAssemblyCuts({ pieces }, DEFAULT_PRICE_LIST, MASSELLO);
    expect(plan.groups).toHaveLength(1);
    const [g] = plan.groups;
    expect(g.key).toBe("abete|massello|80×160");
    expect(g.pricing).toBe("m3");
    expect(g.unitPriceCents).toBe(55_000);
    expect(g.plan.bars.map((b) => b.length)).toEqual(Array(11).fill(4000));
    expect(g.barsLengthMm).toBe(44_000);
    expect(g.piecesLengthMm).toBe(35_200);
    expect(g.wastePct).toBeCloseTo(20, 6);
    expect(g.piecesVolumeM3).toBeCloseTo(0.08 * 0.16 * 35.2, 9);
    expect(g.barsVolumeM3).toBeCloseTo(0.08 * 0.16 * 44, 9);
    // barra 4000 al m³: 0,08·0,16·4·550 € = 28,16 €
    expect(g.plan.bars[0].priceCents).toBe(2816);
    expect(g.costCents).toBe(11 * 2816);
    expect(plan.warnings).toEqual([]);
  });

  it("11 travetti 80×160 da 3200 in lamellare: le barre da 13 500 riducono lo sfrido", () => {
    const pieces = many(11, () => piece("travetto", 80, 160, 3200));
    const [g] = planAssemblyCuts({ pieces }, DEFAULT_PRICE_LIST, LAMELLARE).groups;
    // 4 pezzi per barra da 13 500 (4·3200 + 3·4 = 12 812 ≤ 13 480): 2 × 13 500 + 3 × 4000
    expect(g.plan.bars.map((b) => b.length)).toEqual([13500, 13500, 4000, 4000, 4000]);
    expect(g.barsLengthMm).toBe(39_000);
    expect(g.wastePct).toBeCloseTo((3800 / 39000) * 100, 6);
  });

  it("travetti e pilastri della stessa specie → due gruppi con le proprie barre", () => {
    const pieces = [...many(4, () => piece("travetto", 80, 160, 3200)), ...many(4, () => piece("pilastro", 120, 120, 2400))];
    const plan = planAssemblyCuts({ pieces }, DEFAULT_PRICE_LIST, LAMELLARE);
    expect(plan.groups.map((g) => g.sectionLabel)).toEqual(["120×120", "80×160"]);
    expect(plan.groups[0].pieceIds).toHaveLength(4);
    expect(plan.totals.costCents).toBe(plan.groups[0].costCents + plan.groups[1].costCents);
    expect(plan.totals.barsVolumeM3).toBeCloseTo(plan.groups[0].barsVolumeM3 + plan.groups[1].barsVolumeM3, 9);
  });

  it("sezione ruotata (160×80) nello stesso gruppo di 80×160", () => {
    const pieces = [piece("travetto", 80, 160, 1000), piece("travetto", 160, 80, 1000)];
    const plan = planAssemblyCuts({ pieces }, DEFAULT_PRICE_LIST, LAMELLARE);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].plan.bars).toHaveLength(1);
  });

  it("barra 6000 più cara al metro: due 4000 solo se costano meno", () => {
    const pieces = many(3, () => piece("travetto", 80, 160, 1900));
    const priced = (p6000: number) =>
      withTimber({
        stockLengths: { "80×160": [{ length: 4000, priceCents: 4000 }, { length: 6000, priceCents: p6000 }] },
      });
    // +20% al metro: 6 m × 1,2 = 7200 < 8000 → una 6000
    const g20 = planAssemblyCuts({ pieces }, priced(7200), LAMELLARE).groups[0];
    expect(g20.pricing).toBe("barra");
    expect(g20.plan.bars.map((b) => b.length)).toEqual([6000]);
    expect(g20.costCents).toBe(7200);
    // +40% al metro: 8400 > 8000 → due 4000
    const g40 = planAssemblyCuts({ pieces }, priced(8400), LAMELLARE).groups[0];
    expect(g40.plan.bars.map((b) => b.length)).toEqual([4000, 4000]);
    expect(g40.costCents).toBe(8000);
  });

  it("12 000 mm di barre per 10 800 mm di pezzi → sfrido 10%", () => {
    const pl = withTimber({ kerf: 0, endTrim: 0, stockLengths: { "120×120": [{ length: 4000 }] } });
    const pieces = many(3, () => piece("pilastro", 120, 120, 3600));
    const [g] = planAssemblyCuts({ pieces }, pl, LAMELLARE).groups;
    expect(g.barsLengthMm).toBe(12_000);
    expect(g.piecesLengthMm).toBe(10_800);
    expect(g.wastePct).toBe(10);
  });

  it("prezzo al metro lineare prioritario sul m³", () => {
    const pl = withTimber({ pricePerMl: { "120×240": 4_500 } });
    const [g] = planAssemblyCuts({ pieces: [piece("trave", 120, 240, 4800)] }, pl, LAMELLARE).groups;
    expect(g.pricing).toBe("ml");
    expect(g.unitPriceCents).toBe(4_500);
    expect(g.plan.bars[0]).toMatchObject({ length: 5000, priceCents: 22_500 });
  });

  it("spezzoni riutilizzabili con costo pro quota", () => {
    const [g] = planAssemblyCuts({ pieces: [piece("pilastro", 120, 120, 3200)] }, DEFAULT_PRICE_LIST, LAMELLARE).groups;
    // 3200 su 4000: residuo 780 (< 1000); su 5000 1770 riutilizzabile ma costa di più → 4000
    expect(g.plan.bars[0].length).toBe(4000);
    expect(g.reusableOffcuts).toEqual([]);
    const pl = withTimber({ minReusableOffcut: { ...DEFAULT_PRICE_LIST.timber.minReusableOffcut, "120×120": 500 } });
    const [g2] = planAssemblyCuts({ pieces: [piece("pilastro", 120, 120, 3200)] }, pl, LAMELLARE).groups;
    expect(g2.reusableOffcuts).toEqual([780]);
    expect(g2.reusableOffcutCostCents).toBe(Math.round((g2.plan.bars[0].priceCents * 780) / 4000));
  });

  it("curvi esclusi dal piano con lo sviluppo; pannelli a parte con l'area", () => {
    const arc = piece("arco", 120, 240, 3900, { curve: { radius: 2400, sweep: (3900 / 2400) * (180 / Math.PI) } });
    const grid = piece("grigliato", 20, 1800, 1500);
    const plan = planAssemblyCuts({ pieces: [arc, grid, piece("pilastro", 120, 120, 2400)] }, DEFAULT_PRICE_LIST, LAMELLARE);
    expect(plan.groups.map((g) => g.sectionLabel)).toEqual(["120×120"]);
    expect(plan.curved).toEqual([expect.objectContaining({ id: arc.id, developmentMm: 3900, sectionLabel: "120×240", radius: 2400 })]);
    expect(plan.panels).toEqual([{ id: grid.id, type: "grigliato", areaM2: 2.7 }]);
  });

  it("avvisi: pezzo non ricavabile, lunghezze mancanti, prezzo mancante", () => {
    const tooLong = piece("trave", 120, 240, 6200);
    const m = planAssemblyCuts({ pieces: [tooLong] }, DEFAULT_PRICE_LIST, MASSELLO);
    expect(m.warnings).toEqual([expect.objectContaining({ code: "non-ricavabile", ref: tooLong.id, blocking: true })]);
    expect(m.warnings[0].message).toContain("6200");
    // in lamellare c'è la 13 500
    expect(planAssemblyCuts({ pieces: [tooLong] }, DEFAULT_PRICE_LIST, LAMELLARE).warnings).toEqual([]);

    const odd = planAssemblyCuts({ pieces: [piece("trave", 130, 130, 2000)] }, DEFAULT_PRICE_LIST, LAMELLARE);
    expect(odd.warnings.map((w) => [w.code, w.ref])).toEqual([["lunghezze-mancanti", "130×130"]]);

    const noPrice = planAssemblyCuts({ pieces: [piece("trave", 120, 120, 2000)] }, DEFAULT_PRICE_LIST, { species: "rovere", quality: "lamellare" });
    expect(noPrice.warnings.map((w) => w.code)).toEqual(["prezzo-mancante"]);
    expect(noPrice.groups[0].pricing).toBe("mancante");
    expect(noPrice.groups[0].costCents).toBe(0);
    expect(noPrice.groups[0].plan.bars).toHaveLength(1);
  });

  it("assieme reale (monofalda di default): ogni pezzo dritto è in un gruppo, deterministico", () => {
    const assembly = generate("addossata-monofalda");
    const plan = planAssemblyCuts(assembly, DEFAULT_PRICE_LIST, LAMELLARE);
    const ids = plan.groups.flatMap((g) => g.plan.bars.flatMap((b) => b.cuts.map((c) => c.id)));
    expect(ids.sort()).toEqual(assembly.pieces.map((p) => p.id).sort());
    expect(plan.warnings).toEqual([]);
    expect(plan.totals.wastePct).toBeGreaterThanOrEqual(0);
    expect(plan.totals.wastePct).toBeLessThan(40);
    expect(canonicalJson(planAssemblyCuts(assembly, DEFAULT_PRICE_LIST, LAMELLARE))).toBe(canonicalJson(plan));
  });
});
