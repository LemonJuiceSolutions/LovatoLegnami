/**
 * Motore di preventivazione (puro TS): listino, denaro, ottimizzazione di taglio,
 * fasi di prezzo e viste (sito-preventivi, gruppi 2–4).
 */

// Denaro in centesimi interi: namespace (evita la collisione di `add` con `math/vec3`)
export * as money from "./money";
export { formatEuro, MoneyError, roundToStep } from "./money";
export type { Cents } from "./money";
// Listino (schema zod), versioni, opzioni commerciali, tipi del preventivo e del piano di taglio
export * from "./types";
