import type { CutBar, CutDemand, CutOptions, CuttingPlan, StockOption } from "./types";

/**
 * Ottimizzazione di taglio 1D (P2, spec `ottimizzazione-taglio`).
 *
 * Modello: barra di lunghezza `L`, lunghezza utile `U = L − 2·endTrim`; i pezzi sono
 * tagliati in sequenza e ogni taglio **tra due pezzi** consuma `kerf`, quindi una barra
 * con pezzi `l₁…lₙ` è valida se `Σlᵢ + (n−1)·kerf ≤ U` e lo spezzone residuo è
 * `U − Σlᵢ − (n−1)·kerf` (riutilizzabile se `> 0` e `≥ minReusableOffcut`).
 * Internamente ogni pezzo "pesa" `l + kerf` e la capacità è `U + kerf`: è un bin
 * packing classico a capacità variabile.
 *
 * Tutto è deterministico: ordinamenti con spareggio sull'id, nessun numero casuale,
 * limiti espressi in nodi/iterazioni e mai in tempo.
 */

/** Tolleranza sulle lunghezze (mm) contro il rumore dei float. */
const EPS = 1e-6;

/** Pezzo interno: indice nell'elenco ordinato, peso `length + kerf`. */
interface Item {
  readonly demand: CutDemand;
  readonly weight: number;
}

/** Lunghezza commerciale interna con capacità `U + kerf`. */
interface Stock {
  readonly length: number;
  readonly priceCents: number;
  readonly cap: number;
}

interface Ctx {
  readonly opts: CutOptions;
  /** Ordinate per capacità crescente (a parità: prezzo crescente). */
  readonly stock: readonly Stock[];
  readonly maxCap: number;
}

/** Contenitore: pezzi (indici di `items`) e carico; `stock` fissato o scelto alla fine. */
interface Bin {
  items: number[];
  load: number;
  stock?: Stock;
}

// ---------------------------------------------------------------------------
// Preparazione

/** Decrescente per lunghezza, spareggio sull'id (crescente). */
const byLengthDesc = (a: CutDemand, b: CutDemand): number =>
  b.length - a.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function makeCtx(stock: readonly StockOption[], opts: CutOptions): Ctx {
  const list = stock
    .map((s) => ({ length: s.length, priceCents: s.priceCents, cap: s.length - 2 * opts.endTrim + opts.kerf }))
    .filter((s) => s.cap - opts.kerf > EPS)
    .sort((a, b) => a.cap - b.cap || a.priceCents - b.priceCents);
  return { opts, stock: list, maxCap: list.length ? list[list.length - 1].cap : 0 };
}

/** Pezzi ricavabili (ordinati) e non ricavabili (più lunghi della lunghezza utile massima). */
function splitDemands(demands: readonly CutDemand[], ctx: Ctx): { items: Item[]; nonRicavabili: CutDemand[] } {
  const items: Item[] = [];
  const nonRicavabili: CutDemand[] = [];
  for (const d of [...demands].sort(byLengthDesc)) {
    const weight = d.length + ctx.opts.kerf;
    if (ctx.stock.length === 0 || weight > ctx.maxCap + EPS) nonRicavabili.push({ id: d.id, length: d.length });
    else items.push({ demand: { id: d.id, length: d.length }, weight });
  }
  return { items, nonRicavabili };
}

const fits = (load: number, weight: number, cap: number): boolean => load + weight <= cap + EPS;

// ---------------------------------------------------------------------------
// Scelta della barra per un contenitore

/** Sfrido non riutilizzabile di una barra con il carico dato. */
function nonReusableOf(stock: Stock, load: number, ctx: Ctx): number {
  const off = stock.cap - load;
  return isReusable(off, ctx) ? 0 : Math.max(0, off);
}

const isReusable = (offcut: number, ctx: Ctx): boolean => offcut > EPS && offcut + EPS >= ctx.opts.minReusableOffcut;

/**
 * Barra scelta per un carico: prezzo minimo, poi meno sfrido non riutilizzabile, poi
 * la più corta. `undefined` se il carico supera la capacità massima.
 */
function chooseStock(load: number, ctx: Ctx): Stock | undefined {
  let best: Stock | undefined;
  let bestWaste = 0;
  for (const s of ctx.stock) {
    if (!fits(0, load, s.cap)) continue;
    const waste = nonReusableOf(s, load, ctx);
    if (!best || s.priceCents < best.priceCents || (s.priceCents === best.priceCents && waste < bestWaste - EPS)) {
      best = s;
      bestWaste = waste;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Conversione in piano

function toBar(bin: Bin, items: readonly Item[], ctx: Ctx): CutBar {
  const stock = bin.stock ?? chooseStock(bin.load, ctx);
  if (!stock) throw new Error("cutting-stock: contenitore oltre la capacità massima");
  const cuts = bin.items.map((i) => items[i].demand).sort(byLengthDesc);
  const offcut = stock.cap - bin.load;
  // il residuo è `U − Σl − (n−1)·kerf` = cap − Σ(l + kerf)
  const clean = Math.abs(offcut) < EPS ? 0 : offcut;
  return { length: stock.length, priceCents: stock.priceCents, cuts, offcut: clean, reusable: isReusable(clean, ctx) };
}

/** Ordine stabile delle barre nel piano: lunghezza decrescente, poi primo taglio. */
function compareBars(a: CutBar, b: CutBar): number {
  if (a.length !== b.length) return b.length - a.length;
  const n = Math.min(a.cuts.length, b.cuts.length);
  for (let i = 0; i < n; i++) {
    const c = byLengthDesc(a.cuts[i], b.cuts[i]);
    if (c !== 0) return c;
  }
  return b.cuts.length - a.cuts.length;
}

function buildPlan(bins: readonly Bin[], items: readonly Item[], nonRicavabili: readonly CutDemand[], ctx: Ctx): CuttingPlan {
  const bars = bins.filter((b) => b.items.length > 0).map((b) => toBar(b, items, ctx)).sort(compareBars);
  let costCents = 0;
  let nonReusableWaste = 0;
  let reusableOffcut = 0;
  for (const b of bars) {
    costCents += b.priceCents;
    if (b.reusable) reusableOffcut += b.offcut;
    else nonReusableWaste += b.offcut;
  }
  return {
    bars,
    nonRicavabili: [...nonRicavabili],
    costCents,
    barCount: bars.length,
    nonReusableWaste: round6(nonReusableWaste),
    reusableOffcut: round6(reusableOffcut),
  };
}

const round6 = (x: number): number => {
  const r = Math.round(x * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

/**
 * Ordine dei piani: costo, poi numero di barre, poi sfrido non riutilizzabile.
 * Negativo se `a` è migliore.
 */
export function comparePlans(a: Pick<CuttingPlan, "costCents" | "barCount" | "nonReusableWaste">, b: Pick<CuttingPlan, "costCents" | "barCount" | "nonReusableWaste">): number {
  if (a.costCents !== b.costCents) return a.costCents - b.costCents;
  if (a.barCount !== b.barCount) return a.barCount - b.barCount;
  const d = a.nonReusableWaste - b.nonReusableWaste;
  return Math.abs(d) < EPS ? 0 : d;
}

// ---------------------------------------------------------------------------
// Baseline: First-Fit / Best-Fit Decreasing

type FitRule = "first" | "best";

/**
 * Lunghezza della barra da aprire per il pezzo `first` quando non entra in nessuna
 * barra aperta. Con una sola lunghezza è quella; con più lunghezze ("scelta mista") si
 * simula il riempimento first-fit della barra con i pezzi ancora da piazzare e si sceglie
 * il **minor costo per millimetro utilizzato** (cioè il minor costo del residuo per pezzo
 * ricavato), a parità il residuo minore, poi la barra più corta.
 */
function chooseNewStock(first: number, pending: readonly number[], items: readonly Item[], ctx: Ctx): Stock {
  const candidates = ctx.stock.filter((s) => fits(0, items[first].weight, s.cap));
  if (candidates.length === 1) return candidates[0];
  let best: Stock | undefined;
  let bestRate = 0;
  let bestResidual = 0;
  for (const s of candidates) {
    let load = items[first].weight;
    for (const j of pending) if (fits(load, items[j].weight, s.cap)) load += items[j].weight;
    const rate = s.priceCents / load;
    const residual = s.cap - load;
    if (!best || rate < bestRate - 1e-12 || (Math.abs(rate - bestRate) <= 1e-12 && residual < bestResidual - EPS)) {
      best = s;
      bestRate = rate;
      bestResidual = residual;
    }
  }
  return best!;
}

function greedy(items: readonly Item[], ctx: Ctx, rule: FitRule): Bin[] {
  const bins: Bin[] = [];
  const placed = new Array<boolean>(items.length).fill(false);
  for (let i = 0; i < items.length; i++) {
    const w = items[i].weight;
    let target = -1;
    let targetSlack = Number.POSITIVE_INFINITY;
    for (let b = 0; b < bins.length; b++) {
      const bin = bins[b];
      if (!fits(bin.load, w, bin.stock!.cap)) continue;
      if (rule === "first") {
        target = b;
        break;
      }
      const slack = bin.stock!.cap - bin.load - w;
      if (slack < targetSlack - EPS) {
        target = b;
        targetSlack = slack;
      }
    }
    if (target < 0) {
      const pending: number[] = [];
      for (let j = i + 1; j < items.length; j++) if (!placed[j]) pending.push(j);
      bins.push({ items: [], load: 0, stock: chooseNewStock(i, pending, items, ctx) });
      target = bins.length - 1;
    }
    bins[target].items.push(i);
    bins[target].load += w;
    placed[i] = true;
  }
  return bins;
}

function runGreedy(demands: readonly CutDemand[], stock: readonly StockOption[], opts: CutOptions, rule: FitRule): CuttingPlan {
  const ctx = makeCtx(stock, opts);
  const { items, nonRicavabili } = splitDemands(demands, ctx);
  return buildPlan(greedy(items, ctx, rule), items, nonRicavabili, ctx);
}

/**
 * First-Fit Decreasing: pezzi per lunghezza decrescente, ognuno nella prima barra aperta
 * in cui entra; altrimenti si apre una barra (con più lunghezze: scelta mista, vedi
 * `chooseNewStock`). È il riferimento di qualità della spec.
 */
export const firstFitDecreasing = (demands: readonly CutDemand[], stock: readonly StockOption[], opts: CutOptions): CuttingPlan =>
  runGreedy(demands, stock, opts, "first");

/** Best-Fit Decreasing: come FFD ma nella barra aperta che resta con il residuo minore. */
export const bestFitDecreasing = (demands: readonly CutDemand[], stock: readonly StockOption[], opts: CutOptions): CuttingPlan =>
  runGreedy(demands, stock, opts, "best");
