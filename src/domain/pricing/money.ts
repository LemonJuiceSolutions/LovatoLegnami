/**
 * Denaro in **centesimi interi** (P1): nessun float nei totali. Le quantità (m³, m², ore)
 * restano `number`; ogni prodotto quantità × prezzo è arrotondato al centesimo con
 * `roundHalfUp` (metà lontano da zero: −0,5 → −1, così sconti e recuperi sono speculari
 * agli addebiti).
 *
 * Nota per i riesporti: `add` collide con `add` di `math/vec3` nel barile `@/domain`;
 * `pricing/index.ts` espone questo modulo anche come namespace `money`.
 */

/** Importo in centesimi di euro (intero, con segno). */
export type Cents = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export const isCents = (v: unknown): v is Cents => typeof v === "number" && Number.isSafeInteger(v);

/** Verifica che `v` sia un importo intero in centesimi. */
export function cents(v: number): Cents {
  if (!isCents(v)) throw new MoneyError(`importo non intero in centesimi: ${v}`);
  return v === 0 ? 0 : v;
}

/**
 * Arrotondamento all'intero, metà lontano da zero. Il valore è prima ripulito a 1e-6
 * così il rumore binario (`1.005 * 100 = 100.4999…`) non sposta la metà.
 */
export function roundHalfUp(x: number): number {
  if (!Number.isFinite(x)) throw new MoneyError(`valore non finito: ${x}`);
  const clean = Math.round(Math.abs(x) * 1e6) / 1e6;
  const r = Math.sign(x) * Math.floor(clean + 0.5);
  return r === 0 ? 0 : r;
}

/** Somma di importi. */
export function add(...values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += cents(v);
  return cents(total);
}

/** Somma di un elenco di importi. */
export const sum = (values: readonly Cents[]): Cents => add(...values);

/** Differenza `a − b`. */
export const sub = (a: Cents, b: Cents): Cents => cents(cents(a) - cents(b));

/** Prodotto per un fattore (quantità, coefficiente), arrotondato al centesimo. */
export function mul(value: Cents, factor: number, round: (x: number) => number = roundHalfUp): Cents {
  return cents(round(cents(value) * factor));
}

/** Percentuale `pct` (es. 15 = 15%) di un importo, arrotondata al centesimo. */
export const percent = (value: Cents, pct: number): Cents => mul(value, pct / 100);

/** Euro (anche decimali) → centesimi, arrotondati. */
export const fromEuro = (euro: number): Cents => cents(roundHalfUp(euro * 100));

/** Arrotondamento al passo più vicino (es. 1000 = 10 €), metà lontano da zero. */
export function roundToStep(value: Cents, stepCents: Cents): Cents {
  if (!isCents(stepCents) || stepCents <= 0) throw new MoneyError(`passo di arrotondamento non valido: ${stepCents}`);
  return cents(roundHalfUp(cents(value) / stepCents) * stepCents);
}

/** Spazio non separabile tra importo e simbolo (non va a capo nell'interfaccia e nel PDF). */
export const EURO_SEPARATOR = " ";

/**
 * Formato italiano `4.730,00 €`: punto per le migliaia (anche sotto 10 000), virgola
 * decimale, sempre due decimali, segno meno davanti. Implementato a mano e non con
 * `Intl` perché l'output deve essere identico in Node, browser e PDF.
 */
export function formatEuro(value: Cents): string {
  const v = cents(value);
  const abs = Math.abs(v);
  const intPart = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = (abs % 100).toString().padStart(2, "0");
  return `${v < 0 ? "-" : ""}${intPart},${dec}${EURO_SEPARATOR}€`;
}
