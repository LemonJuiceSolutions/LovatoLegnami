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
  /** Prezzo minimo per millimetro di capacità (bound inferiore del branch-and-bound). */
  readonly minRate: number;
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
  const maxCap = list.reduce((m, s) => Math.max(m, s.cap), 0);
  const minRate = list.reduce((m, s) => Math.min(m, s.priceCents / s.cap), Number.POSITIVE_INFINITY);
  return { opts, stock: list, maxCap, minRate: Number.isFinite(minRate) ? minRate : 0 };
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

// ---------------------------------------------------------------------------
// Miglioramento (3.2): contenitori "liberi" con costo = barra più economica che li contiene

/** Chiave di qualità additiva: costo, numero di barre, sfrido non riutilizzabile. */
interface Key {
  cost: number;
  count: number;
  waste: number;
}

const keyLess = (a: Key, b: Key): boolean =>
  a.cost !== b.cost ? a.cost < b.cost : a.count !== b.count ? a.count < b.count : a.waste < b.waste - EPS;

/** Prezzo della barra più economica che contiene il carico (∞ oltre la capacità). */
function costOfLoad(load: number, ctx: Ctx): number {
  if (load <= EPS) return 0;
  const s = chooseStock(load, ctx);
  return s ? s.priceCents : Number.POSITIVE_INFINITY;
}

function wasteOfLoad(load: number, ctx: Ctx): number {
  const s = chooseStock(load, ctx);
  return s ? nonReusableOf(s, load, ctx) : 0;
}

/** Chiave di un insieme di contenitori liberi (la barra è scelta da `chooseStock`). */
function keyOf(bins: readonly Bin[], ctx: Ctx): Key {
  const k: Key = { cost: 0, count: 0, waste: 0 };
  for (const b of bins) {
    if (b.items.length === 0) continue;
    k.cost += costOfLoad(b.load, ctx);
    k.count += 1;
    k.waste += wasteOfLoad(b.load, ctx);
  }
  return k;
}

/** Contenitori liberi (senza barra fissata) con gli stessi pezzi. */
const freeBins = (bins: readonly Bin[]): Bin[] => bins.filter((b) => b.items.length > 0).map((b) => ({ items: [...b.items], load: b.load }));

const loadOf = (members: readonly number[], items: readonly Item[]): number => members.reduce((s, i) => s + items[i].weight, 0);

/** Esito della ricerca esatta: contenitori migliori del bound (se trovati) e se l'albero è stato esaurito. */
interface ExactResult {
  bins?: Bin[];
  key?: Key;
  exhausted: boolean;
  nodes: number;
}

/**
 * Branch-and-bound esatto sui costi (P2): i pezzi `members` (indici di `items`, già in
 * ordine decrescente) sono assegnati in ordine fisso a un contenitore esistente (prima
 * quello che resta col residuo minore) o a uno nuovo. Bound inferiore = costo corrente +
 * `minRate` × la parte dei pezzi rimanenti che non entra nei residui dei contenitori
 * aperti; simmetrie eliminate imponendo indici non decrescenti ai pezzi di uguale
 * lunghezza e provando una sola volta contenitori con lo stesso carico. Restituisce una
 * soluzione solo se strettamente migliore di `bound`.
 */
function exactSearch(members: readonly number[], items: readonly Item[], ctx: Ctx, bound: Key, nodeLimit: number): ExactResult {
  const n = members.length;
  const w = members.map((i) => items[i].weight);
  const suffix = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + w[i];
  const sameAsPrev = members.map((m, i) => i > 0 && items[m].demand.length === items[members[i - 1]].demand.length);

  const loads: number[] = [];
  const groups: number[][] = [];
  const assign = new Array<number>(n).fill(-1);
  let best: Key = { ...bound };
  let bestGroups: number[][] | undefined;
  let nodes = 0;
  let aborted = false;
  let cost = 0;
  let totalLoad = 0;

  const leaf = () => {
    const k: Key = { cost, count: loads.length, waste: 0 };
    for (const l of loads) k.waste += wasteOfLoad(l, ctx);
    if (keyLess(k, best)) {
      best = k;
      bestGroups = groups.map((g) => [...g]);
    }
  };

  const dfs = (i: number): void => {
    if (aborted) return;
    if (++nodes > nodeLimit) {
      aborted = true;
      return;
    }
    if (i === n) {
      leaf();
      return;
    }
    const slack = loads.length * ctx.maxCap - totalLoad;
    const lb = Math.ceil(cost + ctx.minRate * Math.max(0, suffix[i] - slack) - 1e-9);
    if (lb > best.cost || (lb === best.cost && loads.length > best.count)) return;

    const wi = w[i];
    const start = sameAsPrev[i] ? assign[i - 1] : 0;
    const candidates: number[] = [];
    for (let j = Math.max(0, start); j < loads.length; j++) {
      if (!fits(loads[j], wi, ctx.maxCap)) continue;
      if (candidates.some((c) => Math.abs(loads[c] - loads[j]) < EPS)) continue;
      candidates.push(j);
    }
    candidates.sort((a, b) => loads[b] - loads[a] || a - b);
    for (const j of candidates) {
      const before = loads[j];
      const delta = costOfLoad(before + wi, ctx) - costOfLoad(before, ctx);
      loads[j] = before + wi;
      groups[j].push(members[i]);
      assign[i] = j;
      cost += delta;
      totalLoad += wi;
      dfs(i + 1);
      cost -= delta;
      totalLoad -= wi;
      groups[j].pop();
      loads[j] = before;
      if (aborted) return;
    }
    // contenitore nuovo
    const delta = costOfLoad(wi, ctx);
    loads.push(wi);
    groups.push([members[i]]);
    assign[i] = loads.length - 1;
    cost += delta;
    totalLoad += wi;
    dfs(i + 1);
    cost -= delta;
    totalLoad -= wi;
    groups.pop();
    loads.pop();
  };

  dfs(0);
  if (!bestGroups) return { exhausted: !aborted, nodes };
  return {
    bins: bestGroups.map((g) => ({ items: g, load: loadOf(g, items) })),
    key: best,
    exhausted: !aborted,
    nodes,
  };
}

/** Migliore soluzione greedy (FFD/BFD, scelta mista, contenitori liberi) per un sottoinsieme. */
function greedyFree(members: readonly number[], items: readonly Item[], ctx: Ctx): Bin[] {
  const sub = members.map((i) => items[i]);
  let best: Bin[] | undefined;
  let bestKey: Key | undefined;
  for (const rule of ["first", "best"] as const) {
    const bins = freeBins(greedy(sub, ctx, rule)).map((b) => ({ items: b.items.map((k) => members[k]), load: b.load }));
    const k = keyOf(bins, ctx);
    if (!bestKey || keyLess(k, bestKey)) {
      best = bins;
      bestKey = k;
    }
  }
  return best!;
}

/** Riempimento ottimo (se piccolo) o greedy di un sottoinsieme di pezzi. */
function solveSubset(members: readonly number[], items: readonly Item[], ctx: Ctx, tuning: Required<PlanTuning>): Bin[] {
  const greedyBins = greedyFree(members, items, ctx);
  if (members.length > tuning.exactMaxPieces) return greedyBins;
  const sorted = [...members].sort((a, b) => a - b);
  const r = exactSearch(sorted, items, ctx, keyOf(greedyBins, ctx), tuning.subNodeLimit);
  return r.bins ?? greedyBins;
}

/** Contenitori ordinati dal peggiore: costo meno il valore minimo del legno contenuto. */
function worstFirst(bins: readonly Bin[], ctx: Ctx): number[] {
  const score = bins.map((b) => costOfLoad(b.load, ctx) - ctx.minRate * b.load);
  return bins.map((_, i) => i).sort((a, b) => score[b] - score[a] || a - b);
}

/**
 * Mossa "svuota e redistribuisci": i pezzi della barra `victim` vanno nei residui delle
 * altre barre senza cambiarne il prezzo (best fit), i rimanenti sono riottimizzati.
 */
function emptyAndRedistribute(bins: readonly Bin[], victim: number, items: readonly Item[], ctx: Ctx, tuning: Required<PlanTuning>): Bin[] {
  const next = bins.filter((_, i) => i !== victim).map((b) => ({ items: [...b.items], load: b.load }));
  const leftover: number[] = [];
  for (const it of [...bins[victim].items].sort((a, b) => a - b)) {
    const wi = items[it].weight;
    let target = -1;
    let targetSlack = Number.POSITIVE_INFINITY;
    for (let j = 0; j < next.length; j++) {
      const now = costOfLoad(next[j].load, ctx);
      const after = next[j].load + wi;
      if (after > ctx.maxCap + EPS || costOfLoad(after, ctx) !== now) continue;
      const slack = chooseStock(after, ctx)!.cap - after;
      if (slack < targetSlack - EPS) {
        target = j;
        targetSlack = slack;
      }
    }
    if (target < 0) leftover.push(it);
    else {
      next[target].items.push(it);
      next[target].load += wi;
    }
  }
  if (leftover.length > 0) next.push(...solveSubset(leftover, items, ctx, tuning));
  return next;
}

/**
 * Ricerca locale (P2) a partire da una soluzione: primo miglioramento tra "svuota e
 * redistribuisci" su ogni barra (dalla peggiore) e riottimizzazione esatta delle coppie
 * di barre peggiori; si ferma senza miglioramenti o dopo `localSearchPasses` passate. Non
 * peggiora mai: accetta solo chiavi strettamente migliori.
 */
function localSearch(start: readonly Bin[], items: readonly Item[], ctx: Ctx, tuning: Required<PlanTuning>): Bin[] {
  let current = freeBins(start);
  let currentKey = keyOf(current, ctx);
  for (let pass = 0; pass < tuning.localSearchPasses; pass++) {
    let improved = false;
    const order = worstFirst(current, ctx);
    for (const victim of order) {
      const trial = emptyAndRedistribute(current, victim, items, ctx, tuning);
      const k = keyOf(trial, ctx);
      if (keyLess(k, currentKey)) {
        current = trial;
        currentKey = k;
        improved = true;
        break;
      }
    }
    if (improved) continue;
    const worst = order.slice(0, tuning.pairCandidates);
    outer: for (let a = 0; a < worst.length; a++) {
      for (let b = a + 1; b < worst.length; b++) {
        const pair = [current[worst[a]], current[worst[b]]];
        const members = [...pair[0].items, ...pair[1].items].sort((x, y) => x - y);
        if (members.length > tuning.exactMaxPieces) continue;
        const r = exactSearch(members, items, ctx, keyOf(pair, ctx), tuning.subNodeLimit);
        if (!r.bins) continue;
        current = [...current.filter((_, i) => i !== worst[a] && i !== worst[b]), ...r.bins];
        currentKey = keyOf(current, ctx);
        improved = true;
        break outer;
      }
    }
    if (!improved) break;
  }
  return current;
}

/** Parametri del miglioramento (default di P2). */
export interface PlanTuning {
  /** Gruppi fino a questo numero di pezzi: branch-and-bound esatto. */
  readonly exactMaxPieces?: number;
  /** Limite di nodi del branch-and-bound esatto sul gruppo intero. */
  readonly nodeLimit?: number;
  /** Limite di nodi dei sotto-problemi della ricerca locale. */
  readonly subNodeLimit?: number;
  /** Passate massime della ricerca locale. */
  readonly localSearchPasses?: number;
  /** Barre peggiori tra cui provare le coppie. */
  readonly pairCandidates?: number;
}

export const DEFAULT_PLAN_TUNING: Required<PlanTuning> = {
  exactMaxPieces: 12,
  nodeLimit: 200_000,
  subNodeLimit: 5_000,
  localSearchPasses: 200,
  pairCandidates: 20,
};

/**
 * Piano di taglio a costo minimo (P2) per un gruppo (specie, qualità, sezione):
 * 1. baseline FFD e BFD su ogni lunghezza singola e in scelta mista, ognuna anche con le
 *    barre "ridimensionate" alla più economica che le contiene;
 * 2. gruppi fino a `exactMaxPieces` pezzi: branch-and-bound esatto (bound = baseline,
 *    limite `nodeLimit` nodi); se il limite interrompe la ricerca, o per gruppi più
 *    grandi, ricerca locale dalla migliore soluzione nota.
 * Il risultato è il migliore per (costo, barre, sfrido non riutilizzabile) e non è mai
 * peggiore di `firstFitDecreasing` sullo stesso input.
 */
export function planCuts(
  demands: readonly CutDemand[],
  stock: readonly StockOption[],
  opts: CutOptions,
  tuning: PlanTuning = {},
): CuttingPlan {
  const t: Required<PlanTuning> = { ...DEFAULT_PLAN_TUNING, ...tuning };
  const ctx = makeCtx(stock, opts);
  const { items, nonRicavabili } = splitDemands(demands, ctx);
  if (items.length === 0) return buildPlan([], items, nonRicavabili, ctx);

  // 1. baseline
  const candidates: Bin[][] = [];
  const singles = ctx.stock.length > 1 ? ctx.stock.map((s) => ({ ...ctx, stock: [s], maxCap: s.cap })) : [];
  for (const c of [ctx, ...singles]) {
    if (items.some((it) => !fits(0, it.weight, c.maxCap))) continue;
    for (const rule of ["first", "best"] as const) {
      const bins = greedy(items, c, rule);
      candidates.push(bins, freeBins(bins));
    }
  }
  let bestPlan: CuttingPlan | undefined;
  let bestFree: Bin[] = [];
  for (const bins of candidates) {
    const plan = buildPlan(bins, items, nonRicavabili, ctx);
    if (!bestPlan || comparePlans(plan, bestPlan) < 0) {
      bestPlan = plan;
      bestFree = freeBins(bins);
    }
  }

  // 2. miglioramento
  const all = items.map((_, i) => i);
  let improved: Bin[] = bestFree;
  let proven = false;
  if (items.length <= t.exactMaxPieces) {
    const r = exactSearch(all, items, ctx, keyOf(bestFree, ctx), t.nodeLimit);
    if (r.bins) improved = r.bins;
    proven = r.exhausted;
  }
  if (!proven) improved = localSearch(improved, items, ctx, t);
  const plan = buildPlan(improved, items, nonRicavabili, ctx);
  return comparePlans(plan, bestPlan!) < 0 ? plan : bestPlan!;
}
