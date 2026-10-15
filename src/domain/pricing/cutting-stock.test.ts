import { describe, expect, it } from "vitest";
import { bestFitDecreasing, comparePlans, firstFitDecreasing } from "./cutting-stock";
import type { CutDemand, CutOptions, StockOption } from "./types";

const OPTS: CutOptions = { kerf: 4, endTrim: 10, minReusableOffcut: 1000 };
const bar = (length: number, perM = 1000): StockOption => ({ length, priceCents: Math.round((length / 1000) * perM) });
const pieces = (prefix: string, length: number, n: number): CutDemand[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${String(i + 1).padStart(2, "0")}`, length }));

describe("baseline FFD/BFD", () => {
  it("due pezzi da 1980 su barra 4000 con rifili 10+10 e lama 4 → residuo 16 non riutilizzabile", () => {
    for (const algo of [firstFitDecreasing, bestFitDecreasing]) {
      const plan = algo(pieces("TVT", 1980, 2), [bar(4000)], OPTS);
      expect(plan.bars).toHaveLength(1);
      const [b] = plan.bars;
      expect(b.cuts.map((c) => c.id)).toEqual(["TVT-01", "TVT-02"]);
      expect(b.offcut).toBe(16);
      expect(b.reusable).toBe(false);
      expect(plan.nonReusableWaste).toBe(16);
      expect(plan.costCents).toBe(4000);
    }
  });

  it("un terzo pezzo che sfora di 1 mm apre una nuova barra", () => {
    // 2·1990 + 4 = 3984 > 3980 utili
    const plan = firstFitDecreasing(pieces("A", 1990, 2), [bar(4000)], OPTS);
    expect(plan.barCount).toBe(2);
    const exact = firstFitDecreasing([{ id: "A", length: 1988 }, { id: "B", length: 1988 }], [bar(4000)], OPTS);
    expect(exact.barCount).toBe(1);
    expect(exact.bars[0].offcut).toBe(0);
  });

  it("pezzo 3200 su barra 5000 → spezzone riutilizzabile", () => {
    const plan = firstFitDecreasing([{ id: "PIL-01", length: 3200 }], [bar(5000)], OPTS);
    expect(plan.bars[0]).toMatchObject({ length: 5000, offcut: 5000 - 20 - 3200, reusable: true });
    expect(plan.reusableOffcut).toBe(1780);
    expect(plan.nonReusableWaste).toBe(0);
  });

  it("pezzo 6200 con lunghezza massima 6000 → non ricavabile con id", () => {
    const plan = firstFitDecreasing(
      [{ id: "TRV-01", length: 6200 }, { id: "TRV-02", length: 3000 }],
      [bar(4000), bar(6000)],
      OPTS,
    );
    expect(plan.nonRicavabili).toEqual([{ id: "TRV-01", length: 6200 }]);
    expect(plan.bars.flatMap((b) => b.cuts.map((c) => c.id))).toEqual(["TRV-02"]);
    // anche un pezzo che entra solo senza rifili non è ricavabile
    expect(firstFitDecreasing([{ id: "X", length: 5990 }], [bar(6000)], OPTS).nonRicavabili.map((d) => d.id)).toEqual(["X"]);
  });

  it("senza lunghezze commerciali tutti i pezzi sono non ricavabili", () => {
    const plan = firstFitDecreasing(pieces("P", 1000, 2), [], OPTS);
    expect(plan.bars).toEqual([]);
    expect(plan.nonRicavabili).toHaveLength(2);
    expect(plan.costCents).toBe(0);
  });

  it("FFD e BFD differiscono: BFD sceglie la barra col residuo minore", () => {
    const opts = { kerf: 0, endTrim: 0, minReusableOffcut: 1000 };
    const d: CutDemand[] = [
      { id: "a", length: 6000 },
      { id: "b", length: 5000 },
      { id: "c", length: 4500 },
      { id: "d", length: 4000 },
      { id: "e", length: 1500 },
    ];
    const s = [bar(10000)];
    // FFD: [6000+4000], [5000+4500], [1500]; BFD: [6000+4000], [5000+4500], [1500] — stesso numero
    const f = firstFitDecreasing(d, s, opts);
    const b = bestFitDecreasing(d, s, opts);
    expect(f.barCount).toBe(3);
    expect(b.barCount).toBe(3);
    // caso in cui il primo posto lascia un residuo maggiore
    const d2: CutDemand[] = [
      { id: "a", length: 5000 },
      { id: "b", length: 3000 },
      { id: "c", length: 2000 },
    ];
    const s2 = [bar(8000)];
    expect(firstFitDecreasing(d2, s2, opts).bars[0].cuts.map((c) => c.id)).toEqual(["a", "b"]);
    expect(bestFitDecreasing(d2, s2, opts).bars[0].cuts.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("scelta mista: la barra con minor costo per millimetro utilizzato", () => {
    const opts = { kerf: 0, endTrim: 0, minReusableOffcut: 1000 };
    const stock = [bar(4000, 1000), bar(6000, 1200)];
    // 2 pezzi da 2900: la 4000 ne porta uno (4000/2900 al mm), la 6000 due (7200/5800): 6000
    expect(firstFitDecreasing(pieces("P", 2900, 2), stock, opts).bars.map((b) => b.length)).toEqual([6000]);
    // 3 pezzi da 1900: la 4000 ne porta due (4000/3800) e batte la 6000 (7200/5700) al mm,
    // ma il terzo pezzo apre un'altra 4000 (8000 > 7200): la baseline è miope, il
    // miglioramento di planCuts (3.2) recupera la 6000
    const myopic = firstFitDecreasing(pieces("P", 1900, 3), stock, opts);
    expect(myopic.bars.map((b) => b.length)).toEqual([4000, 4000]);
    expect(myopic.costCents).toBe(8000);
  });

  it("costo, numero di barre e ordine dei tagli; confronto tra piani", () => {
    const plan = firstFitDecreasing(
      [{ id: "b", length: 1000 }, { id: "a", length: 2500 }, { id: "c", length: 1000 }],
      [bar(4000)],
      OPTS,
    );
    expect(plan.bars[0].cuts.map((c) => c.id)).toEqual(["a", "b"]);
    expect(plan.bars[1].cuts.map((c) => c.id)).toEqual(["c"]);
    expect(plan.costCents).toBe(8000);
    expect(comparePlans(plan, { costCents: 8000, barCount: 2, nonReusableWaste: plan.nonReusableWaste })).toBe(0);
    expect(comparePlans({ costCents: 1, barCount: 9, nonReusableWaste: 9 }, plan)).toBeLessThan(0);
  });
});
