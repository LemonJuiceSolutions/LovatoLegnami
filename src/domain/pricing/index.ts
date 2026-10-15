/**
 * Motore di preventivazione (puro TS): listino, denaro, ottimizzazione di taglio,
 * fattori di cantiere, fasi di prezzo, motore, viste, CSV (sito-preventivi, gruppi 2–4).
 * Ingresso principale: `priceAssembly(input) → Quote`, poi `officeView`/`customerView`.
 */

// Denaro in centesimi interi: namespace (evita la collisione di `add` con `math/vec3`)
export * as money from "./money";
export { formatEuro, MoneyError, roundToStep } from "./money";
export type { Cents } from "./money";
// Listino (schema zod), versioni, opzioni commerciali, tipi del preventivo e del piano di taglio
export * from "./types";
// Listino seed v1 (DA VALIDARE)
export * from "./data/default-listino";
// Ottimizzazione di taglio 1D (P2)
export * from "./cutting-stock";
// Piano di taglio dell'assieme per (specie, qualità, sezione)
export * from "./assembly-cuts";
// Fattori di cantiere (P3) con l'aggancio per la pianta fuori squadra (gruppo 5)
export * from "./site-factors";
// Fasi: tipi e funzioni di calcolo riusabili (simulatore, form admin, test)
export type { Phase, PhaseState, PricingAssembly, PricingContext } from "./phases/shared";
export { pieceMachiningTime, machiningMagnitude, type PieceMachiningTime } from "./phases/machining";
export { pieceSurfaceM2 } from "./phases/treatments";
export { coveringGeometry, roofArea, type CoveringGeometry } from "./phases/covering";
export { conditionHolds, describeCondition, ruleFires } from "./phases/complications";
export { tripsFor, zoneForCap, type ZoneMatch } from "./phases/transport";
export { computeTotals, COST_CATEGORIES, LABOUR_CATEGORIES, MATERIAL_CATEGORIES, type TotalsResult } from "./phases/totals";
// Motore: fasi in ordine fisso, totali, serializzazione canonica
export * from "./engine";
// Viste ufficio e cliente (proiezioni del preventivo)
export * from "./views";
// CSV delle tabelle del listino e differenze tra documenti
export * from "./csv";
export * from "./diff";
