import type { Section } from "./types";

/**
 * Catalogo delle sezioni commerciali disponibili (base × altezza, mm).
 * Sono DATI: aggiungere/rimuovere una sezione non richiede modifiche alla logica.
 * DA VALIDARE CON UFFICIO TECNICO (disponibilità di magazzino Lovato).
 */
export const SECTION_CATALOG: readonly Section[] = [
  { b: 60, h: 80 },
  { b: 60, h: 120 },
  { b: 80, h: 160 },
  { b: 100, h: 100 },
  { b: 100, h: 200 },
  { b: 120, h: 120 },
  { b: 120, h: 200 },
  { b: 120, h: 240 },
  { b: 140, h: 140 },
  { b: 160, h: 160 },
  { b: 160, h: 200 },
  // sezioni del riferimento commerciale (ricerca-chepergola.md §4 "Riepilogo sezioni standard"):
  // tavole sandwich e travetti 45×…, aste 70×70 e 90×90, fasce 38×300
  { b: 45, h: 90 },
  { b: 45, h: 120 },
  { b: 45, h: 145 },
  { b: 70, h: 70 },
  { b: 90, h: 90 },
  { b: 38, h: 300 },
];

/** Etichetta canonica `"<b>×<h>"`. */
export const sectionLabel = (s: Section): string => `${s.b}×${s.h}`;

/** Interpreta `"120×240"` (accetta anche `x`/`X` e spazi); `undefined` se non valida. */
export function parseSectionLabel(label: string): Section | undefined {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*$/.exec(label);
  if (!m) return undefined;
  const b = Number(m[1]);
  const h = Number(m[2]);
  return b > 0 && h > 0 ? { b, h } : undefined;
}

export const sameSection = (a: Section, b: Section): boolean => a.b === b.b && a.h === b.h;

/** Sezione del catalogo con l'etichetta data, `undefined` se non a catalogo. */
export function findSection(label: string, catalog: readonly Section[] = SECTION_CATALOG): Section | undefined {
  const wanted = parseSectionLabel(label);
  if (!wanted) return undefined;
  const found = catalog.find((s) => sameSection(s, wanted));
  return found ? { b: found.b, h: found.h } : undefined;
}

/** Ordine di resistenza a flessione: altezza crescente, poi base crescente. */
export const compareByBendingHeight = (a: Section, b: Section): number => a.h - b.h || a.b - b.b;

/** Sezioni con altezza ≥ `minHeight` (tutte se omesso), ordinate per altezza poi base. */
export function sectionsByBendingHeight(
  minHeight: number = 0,
  catalog: readonly Section[] = SECTION_CATALOG,
): Section[] {
  return catalog
    .filter((s) => s.h >= minHeight)
    .map((s) => ({ b: s.b, h: s.h }))
    .sort(compareByBendingHeight);
}
