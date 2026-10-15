import type { Assembly, HardwareItem, HardwareKind, Machining, Piece, PieceType, Section } from "@/domain/components/types";
import { pieceCacheKey } from "@/geometry/cache";

/**
 * Distinta pezzi CSV (D8, spec `export-cnc`): una riga per gruppo di pezzi
 * identici per tipo, sezione, lunghezza e lavorazioni (stessa chiave della
 * cache dei solidi: id, pezzo e giunto delle lavorazioni non contano, numeri
 * arrotondati a 1e-6 mm). Formato per Excel italiano: separatore `;`, UTF-8
 * con BOM, decimali con virgola, righe CRLF.
 *
 * Dopo la tabella dei pezzi, una riga vuota e la tabella della ferramenta
 * (E7, `tipologie-estese`): una riga per codice con le quantità sommate e gli
 * id dei pezzi collegati; senza ferramenta resta la sola intestazione.
 */

export const DISTINTA_COLUMNS = ["ID", "Tipo", "Sezione", "Lunghezza", "Quantità", "Lavorazioni"] as const;
export const CSV_EXTENSION = "csv";
export const CSV_MIME_TYPE = "text/csv;charset=utf-8";
export const HARDWARE_COLUMNS = ["Codice", "Descrizione", "Quantità", "Pezzi"] as const;
const BOM = "﻿";

export interface DistintaRow {
  /** Id dei pezzi del gruppo, nell'ordine dell'assieme. */
  readonly ids: readonly string[];
  readonly type: PieceType;
  readonly section: Section;
  /** Lunghezza in mm. */
  readonly length: number;
  readonly quantity: number;
  /** Riepilogo delle lavorazioni (es. `becco-uccello ×2, taglio-testa ×2`). */
  readonly machinings: string;
  /** Chiave di raggruppamento (hash di tipo, sezione, lunghezza, lavorazioni). */
  readonly key: string;
}

/** Riga della tabella ferramenta: tutte le voci di un codice. */
export interface HardwareRow {
  readonly code: string;
  readonly kind: HardwareKind;
  readonly description: string;
  /** Quantità sommata delle voci del codice. */
  readonly quantity: number;
  /** Id dei pezzi collegati (unione, ordine di prima comparsa). */
  readonly pieceIds: readonly string[];
  /** Id delle voci di ferramenta del codice (`BUL-01`, …), nell'ordine dell'assieme. */
  readonly itemIds: readonly string[];
}

export interface Distinta {
  /** Righe nell'ordine di prima comparsa del gruppo nell'assieme. */
  readonly rows: readonly DistintaRow[];
  /** Ferramenta raggruppata per codice, nell'ordine di prima comparsa. */
  readonly hardwareRows: readonly HardwareRow[];
  /** Contenuto del file `.csv` (con BOM). */
  readonly csv: string;
}

/** Numero con al più `digits` decimali e virgola decimale (senza separatore delle migliaia). */
export function formatDecimal(n: number, digits = 1): string {
  const r = Number(n.toFixed(digits));
  return String(Object.is(r, -0) ? 0 : r).replace(".", ",");
}

const formatSection = (s: Section) => `${formatDecimal(s.b)}×${formatDecimal(s.h)}`;

/** Riepilogo delle lavorazioni per tipo, nell'ordine di prima comparsa. */
export function summarizeMachinings(machinings: readonly Machining[]): string {
  const counts = new Map<string, number>();
  for (const m of machinings) counts.set(m.type, (counts.get(m.type) ?? 0) + 1);
  return [...counts].map(([type, n]) => (n > 1 ? `${type} ×${n}` : type)).join(", ");
}

/** Campo CSV: tra virgolette se contiene separatore, virgolette o a capo. */
export function csvField(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function distintaRows(pieces: readonly Piece[]): DistintaRow[] {
  const groups = new Map<string, { first: Piece; ids: string[] }>();
  for (const p of pieces) {
    const key = pieceCacheKey(p);
    const g = groups.get(key);
    if (g) g.ids.push(p.id);
    else groups.set(key, { first: p, ids: [p.id] });
  }
  return [...groups].map(([key, { first, ids }]) => ({
    ids,
    type: first.type,
    section: first.section,
    length: first.length,
    quantity: ids.length,
    machinings: summarizeMachinings(first.machinings),
    key,
  }));
}

/** Ferramenta raggruppata per codice (quantità sommate, pezzi uniti). */
export function hardwareRows(items: readonly HardwareItem[]): HardwareRow[] {
  const groups = new Map<string, { first: HardwareItem; quantity: number; pieceIds: string[]; itemIds: string[] }>();
  for (const it of items) {
    let g = groups.get(it.code);
    if (!g) {
      g = { first: it, quantity: 0, pieceIds: [], itemIds: [] };
      groups.set(it.code, g);
    }
    g.quantity += it.quantity;
    g.itemIds.push(it.id);
    for (const id of it.pieceIds) if (!g.pieceIds.includes(id)) g.pieceIds.push(id);
  }
  return [...groups.values()].map(({ first, quantity, pieceIds, itemIds }) => ({
    code: first.code,
    kind: first.kind,
    description: first.description,
    quantity,
    pieceIds,
    itemIds,
  }));
}

export function distintaToCsv(rows: readonly DistintaRow[], hardware: readonly HardwareRow[] = []): string {
  const lines = [
    DISTINTA_COLUMNS.join(";"),
    ...rows.map((r) =>
      [r.ids.join(", "), r.type, formatSection(r.section), formatDecimal(r.length), String(r.quantity), r.machinings]
        .map(csvField)
        .join(";"),
    ),
    "",
    HARDWARE_COLUMNS.join(";"),
    ...hardware.map((h) =>
      [h.code, h.description, formatDecimal(h.quantity, 3), h.pieceIds.join(", ")].map(csvField).join(";"),
    ),
  ];
  return `${BOM}${lines.join("\r\n")}\r\n`;
}

/** Distinta dell'assieme: righe dei pezzi, righe della ferramenta e testo CSV (`hardware` assente = nessuna voce). */
export function buildDistinta(assembly: Pick<Assembly, "pieces"> & { readonly hardware?: Assembly["hardware"] }): Distinta {
  const rows = distintaRows(assembly.pieces);
  const hw = hardwareRows(assembly.hardware ?? []);
  return { rows, hardwareRows: hw, csv: distintaToCsv(rows, hw) };
}
