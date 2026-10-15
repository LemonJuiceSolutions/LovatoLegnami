import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/domain/math/canonical";
import { DEFAULT_PLAN_TUNING, firstFitDecreasing, planCuts } from "./cutting-stock";
import type { CutDemand, CutOptions, CuttingPlan, StockOption } from "./types";

/** Generatore pseudo-casuale riproducibile (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Instance {
  demands: CutDemand[];
  stock: StockOption[];
  opts: CutOptions;
}

/** Istanza casuale realistica: pezzi 300–5900 mm, 1–4 lunghezze con prezzi al metro diversi. */
function randomInstance(seed: number, maxPieces = 40): Instance {
  const r = rng(seed);
  const n = 3 + Math.floor(r() * (maxPieces - 2));
  const kinds = 1 + Math.floor(r() * 6);
  const lengths = Array.from({ length: kinds }, () => 300 + Math.round(r() * 5600));
  const demands = Array.from({ length: n }, (_, i) => ({ id: `P-${String(i + 1).padStart(3, "0")}`, length: lengths[Math.floor(r() * kinds)] }));
  const pool = [3000, 4000, 5000, 6000, 8000, 13500];
  const stock = pool
    .filter((_, i) => i >= 3 || r() < 0.6)
    .filter((l) => l !== 13500 || r() < 0.5)
    .map((length) => ({ length, priceCents: Math.round(length * (0.9 + r() * 0.5)) }));
  const opts = { kerf: Math.round(r() * 5), endTrim: Math.round(r() * 15), minReusableOffcut: 1000 };
  return { demands, stock, opts };
}

const cutIds = (p: CuttingPlan) => p.bars.flatMap((b) => b.cuts.map((c) => c.id)).sort();

/** Verifica che il piano sia fisicamente valido e copra tutti i pezzi. */
function expectValid(plan: CuttingPlan, inst: Instance) {
  const { kerf, endTrim } = inst.opts;
  for (const b of plan.bars) {
    const used = b.cuts.reduce((s, c) => s + c.length, 0) + kerf * (b.cuts.length - 1);
    expect(used).toBeLessThanOrEqual(b.length - 2 * endTrim + 1e-6);
    expect(b.offcut).toBeCloseTo(b.length - 2 * endTrim - used, 6);
    expect(inst.stock.some((s) => s.length === b.length && s.priceCents === b.priceCents)).toBe(true);
  }
  expect([...cutIds(plan), ...plan.nonRicavabili.map((d) => d.id)].sort()).toEqual(inst.demands.map((d) => d.id).sort());
  expect(plan.costCents).toBe(plan.bars.reduce((s, b) => s + b.priceCents, 0));
}

/** Ottimo per enumerazione di tutte le partizioni (istanze minuscole). */
function bruteForceCost(inst: Instance): number {
  const { kerf, endTrim } = inst.opts;
  const blockCost = (block: number[]): number => {
    const load = block.reduce((s, l) => s + l + kerf, 0);
    let best = Number.POSITIVE_INFINITY;
    for (const s of inst.stock) if (load <= s.length - 2 * endTrim + kerf + 1e-6) best = Math.min(best, s.priceCents);
    return best;
  };
  const lens = inst.demands.map((d) => d.length);
  let best = Number.POSITIVE_INFINITY;
  const blocks: number[][] = [];
  const rec = (i: number, acc: number) => {
    if (acc >= best) return;
    if (i === lens.length) {
      best = acc;
      return;
    }
    for (const b of blocks) {
      const before = blockCost(b);
      b.push(lens[i]);
      const after = blockCost(b);
      if (Number.isFinite(after)) rec(i + 1, acc - before + after);
      b.pop();
    }
    blocks.push([lens[i]]);
    rec(i + 1, acc + blockCost([lens[i]]));
    blocks.pop();
  };
  rec(0, 0);
  return best;
}

describe("planCuts", () => {
  it("istanza con ottimo noto: 4×2000 + 2×3000 + 2×1000 su 4000/6000 → sfrido 0, 3 barre", () => {
    const demands = [
      ...[1, 2, 3, 4].map((i) => ({ id: `A${i}`, length: 2000 })),
      ...[1, 2].map((i) => ({ id: `B${i}`, length: 3000 })),
      ...[1, 2].map((i) => ({ id: `C${i}`, length: 1000 })),
    ];
    const stock = [
      { length: 4000, priceCents: 4000 },
      { length: 6000, priceCents: 6000 },
    ];
    const plan = planCuts(demands, stock, { kerf: 0, endTrim: 0, minReusableOffcut: 1000 });
    expect(plan.costCents).toBe(16000);
    expect(plan.barCount).toBe(3);
    expect(plan.nonReusableWaste).toBe(0);
    expect(plan.reusableOffcut).toBe(0);
    expect(plan.bars.map((b) => b.length)).toEqual([6000, 6000, 4000]);
  });

  it("recupera l'ottimo dove la scelta mista greedy è miope (3 × 1900 su 4000/6000 a +20%/m)", () => {
    const demands = [1, 2, 3].map((i) => ({ id: `P${i}`, length: 1900 }));
    const stock = [
      { length: 4000, priceCents: 4000 },
      { length: 6000, priceCents: 7200 },
    ];
    const opts = { kerf: 4, endTrim: 10, minReusableOffcut: 1000 };
    expect(firstFitDecreasing(demands, stock, opts).costCents).toBe(8000);
    const plan = planCuts(demands, stock, opts);
    expect(plan.bars.map((b) => b.length)).toEqual([6000]);
    expect(plan.costCents).toBe(7200);
    // con la 6000 al +40%/m (8400) servono due 4000
    const plan2 = planCuts(demands, [stock[0], { length: 6000, priceCents: 8400 }], opts);
    expect(plan2.bars.map((b) => b.length)).toEqual([4000, 4000]);
  });

  it("su istanze minuscole trova l'ottimo per enumerazione", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const inst = randomInstance(1000 + seed, 8);
      const plan = planCuts(inst.demands, inst.stock, inst.opts);
      expectValid(plan, inst);
      if (plan.nonRicavabili.length > 0) continue;
      expect(plan.costCents, `seed ${seed}`).toBe(bruteForceCost(inst));
    }
  });

  it("100 istanze casuali riproducibili: costo e barre mai peggiori di FFD", () => {
    let better = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const inst = randomInstance(seed);
      const ffd = firstFitDecreasing(inst.demands, inst.stock, inst.opts);
      const plan = planCuts(inst.demands, inst.stock, inst.opts);
      expectValid(plan, inst);
      expect(plan.costCents, `seed ${seed}`).toBeLessThanOrEqual(ffd.costCents);
      if (plan.costCents === ffd.costCents) expect(plan.barCount, `seed ${seed}`).toBeLessThanOrEqual(ffd.barCount);
      if (plan.costCents < ffd.costCents) better++;
    }
    // il miglioramento serve davvero su una parte delle istanze
    expect(better).toBeGreaterThan(10);
  });

  it("200 pezzi in meno di 200 ms", () => {
    const r = rng(42);
    const demands = Array.from({ length: 200 }, (_, i) => ({ id: `P-${String(i + 1).padStart(3, "0")}`, length: 400 + Math.round(r() * 4000) }));
    const stock = [
      { length: 4000, priceCents: 4000 },
      { length: 5000, priceCents: 5200 },
      { length: 6000, priceCents: 6500 },
      { length: 13500, priceCents: 16000 },
    ];
    const opts = { kerf: 4, endTrim: 10, minReusableOffcut: 1000 };
    planCuts(demands, stock, opts); // riscaldamento JIT
    const t0 = performance.now();
    const plan = planCuts(demands, stock, opts);
    const ms = performance.now() - t0;
    expectValid(plan, { demands, stock, opts });
    expect(plan.costCents).toBeLessThanOrEqual(firstFitDecreasing(demands, stock, opts).costCents);
    expect(ms).toBeLessThan(200);
  });

  it("deterministico: stesso input → stessa serializzazione, anche con pezzi in ordine diverso", () => {
    const inst = randomInstance(7);
    const a = canonicalJson(planCuts(inst.demands, inst.stock, inst.opts));
    const b = canonicalJson(planCuts([...inst.demands].reverse(), [...inst.stock].reverse(), inst.opts));
    expect(a).toBe(b);
    expect(canonicalJson(planCuts(inst.demands, inst.stock, inst.opts))).toBe(a);
  });

  it("default dei parametri di P2", () => {
    expect(DEFAULT_PLAN_TUNING).toMatchObject({ exactMaxPieces: 12, nodeLimit: 200_000 });
  });
});
