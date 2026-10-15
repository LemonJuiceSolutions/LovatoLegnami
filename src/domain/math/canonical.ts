/**
 * JSON canonico (spostato da `geometry/cache.ts`, che lo riesporta): chiavi ordinate,
 * numeri arrotondati a 1e-6 (rumore numerico) e senza `-0`, campi `undefined` omessi.
 * Base del determinismo byte per byte (chiavi di cache dei solidi, preventivi).
 */

/** Numeri arrotondati a 1e-6 e senza `-0`. */
export const canonNumber = (n: number): number => {
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
};

/** JSON canonico: chiavi ordinate, chiavi in `skip` escluse a ogni livello. */
export function canonicalJson(value: unknown, skip: ReadonlySet<string> = new Set()): string {
  if (typeof value === "number") return JSON.stringify(canonNumber(value));
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v, skip)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([k, v]) => v !== undefined && !skip.has(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v, skip)}`).join(",")}}`;
}
