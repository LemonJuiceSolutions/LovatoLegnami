/**
 * Formattazione dei numeri reali nel SAT (D7): 15 cifre significative, senza
 * zeri finali, senza `-0`; esponente (stile C, `1e-7`) solo quando la forma
 * decimale non è quella più corta di JavaScript (|v| < 1e-6 o ≥ 1e21).
 * I valori con |v| < `SAT_ZERO_SNAP` sono scritti `0`: è rumore numerico delle
 * rotazioni (es. cos 90° = 6e-17) e in mm è ben sotto la tolleranza ACIS (1e-6).
 */
export const SAT_ZERO_SNAP = 1e-12;

export function formatSatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`SAT: numero non finito (${value})`);
  if (Math.abs(value) < SAT_ZERO_SNAP) return "0";
  const rounded = Number(value.toPrecision(15));
  return Object.is(rounded, -0) || rounded === 0 ? "0" : String(rounded);
}
