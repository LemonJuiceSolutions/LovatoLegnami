import { findHardware, hasHardware } from "../hardware/catalog";
import { diffDocuments, type DiffEntry } from "./diff";
import { fromEuro } from "./money";
import { safeParsePriceList, type PriceList } from "./types";

/**
 * Import/export CSV delle tabelle del listino (P10, back-office): stesso dialetto della
 * distinta — separatore `;`, BOM UTF-8, righe `\r\n`, virgola decimale, campi con `;`,
 * virgolette o a capo tra virgolette. Gli importi sono in **euro** (`650,00`), i tempi in
 * minuti, le lunghezze in mm. L'import **sostituisce** l'intera tabella con le righe del
 * file e valida il listino risultante con lo schema.
 */

export const PRICE_TABLES = ["legno", "lunghezze", "lavorazioni", "ferramenta", "trattamenti", "coperture", "manodopera", "zone"] as const;
export type PriceTable = (typeof PRICE_TABLES)[number];

export interface ImportResult {
  /** Listino con la tabella importata; `null` se ci sono errori. */
  readonly next: PriceList | null;
  /** Differenze rispetto al listino attuale (calcolate sulle righe valide anche con errori). */
  readonly diff: readonly DiffEntry[];
  /** Errori per riga (`riga 3: prezzo non numerico`) o per campo dello schema. */
  readonly errors: readonly string[];
}

const BOM = "﻿";

// ---------------------------------------------------------------------------
// Dialetto

/** Campo CSV: tra virgolette se contiene `;`, virgolette o a capo. */
export const csvCell = (v: string): string => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const toCsv = (rows: readonly (readonly string[])[]): string => `${BOM}${rows.map((r) => r.map(csvCell).join(";")).join("\r\n")}\r\n`;

/** Righe del CSV (con il numero di riga del file, 1 = intestazione); righe vuote saltate. */
export function parseCsv(text: string): { row: number; cells: string[] }[] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const out: { row: number; cells: string[] }[] = [];
  let row = 1;
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let startRow = 1;
  const flush = () => {
    cells.push(cell);
    if (!(cells.length === 1 && cells[0].trim() === "")) out.push({ row: startRow, cells });
    cells = [];
    cell = "";
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else {
        if (ch === "\n") row++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === ";") {
      cells.push(cell);
      cell = "";
    } else if (ch === "\r" && src[i + 1] === "\n") continue;
    else if (ch === "\n" || ch === "\r") {
      flush();
      row++;
      startRow = row;
    } else cell += ch;
  }
  if (cell !== "" || cells.length > 0) flush();
  return out;
}

/** Numero in formato italiano (`1.234,5`, `650`, `0,5`); `undefined` se non numerico. */
export function parseDecimal(text: string): number | undefined {
  let t = text.trim().replace(/\s/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "");
  t = t.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  return Number(t);
}

/** Numero con virgola decimale, senza zeri inutili. */
const dec = (n: number): string => String(Math.round(n * 1e6) / 1e6).replace(".", ",");
/** Centesimi → euro con due decimali (`650,00`). */
const euro = (c: number): string => (c / 100).toFixed(2).replace(".", ",");

// ---------------------------------------------------------------------------
// Tabelle

type Rows = { row: number; cells: string[] }[];

class RowReader {
  readonly errors: string[] = [];
  constructor(
    readonly row: number,
    private readonly cells: string[],
  ) {}
  text(i: number): string {
    return (this.cells[i] ?? "").trim();
  }
  number(i: number, what: string): number {
    const v = parseDecimal(this.text(i));
    if (v === undefined) this.errors.push(`riga ${this.row}: ${what} non numerico`);
    return v ?? 0;
  }
  price(i: number): number {
    const v = parseDecimal(this.text(i));
    if (v === undefined) {
      this.errors.push(`riga ${this.row}: prezzo non numerico`);
      return 0;
    }
    return fromEuro(v);
  }
  optionalPrice(i: number): number | undefined {
    return this.text(i) === "" ? undefined : this.price(i);
  }
  list(i: number): string[] {
    return this.text(i).split(/[\s,]+/).filter(Boolean);
  }
}

interface TableDef {
  readonly header: readonly string[];
  readonly rows: (pl: PriceList) => string[][];
  readonly apply: (pl: PriceList, rows: RowReader[]) => PriceList;
}

const TABLES: Readonly<Record<PriceTable, TableDef>> = {
  legno: {
    header: ["Specie", "Qualità", "Prezzo €/m³"],
    rows: (pl) => Object.entries(pl.timber.pricePerM3).flatMap(([sp, byQ]) => Object.entries(byQ).map(([q, c]) => [sp, q, euro(c)])),
    apply: (pl, rows) => {
      const pricePerM3: Record<string, Record<string, number>> = {};
      for (const r of rows) (pricePerM3[r.text(0)] ??= {})[r.text(1)] = r.price(2);
      return { ...pl, timber: { ...pl.timber, pricePerM3 } };
    },
  },
  lunghezze: {
    header: ["Sezione", "Lunghezza mm", "Prezzo barra €", "Qualità"],
    rows: (pl) =>
      Object.entries(pl.timber.stockLengths).flatMap(([sec, ls]) =>
        ls.map((l) => [sec, dec(l.length), l.priceCents === undefined ? "" : euro(l.priceCents), (l.qualities ?? []).join(" ")]),
      ),
    apply: (pl, rows) => {
      const stockLengths: Record<string, PriceList["timber"]["stockLengths"][string][number][]> = {};
      for (const r of rows) {
        const priceCents = r.optionalPrice(2);
        const qualities = r.list(3);
        (stockLengths[r.text(0)] ??= []).push({
          length: r.number(1, "lunghezza"),
          ...(priceCents !== undefined ? { priceCents } : {}),
          ...(qualities.length ? { qualities } : {}),
        });
      }
      return { ...pl, timber: { ...pl.timber, stockLengths } };
    },
  },
  lavorazioni: {
    header: ["Tipo", "Base min", "Per unità min", "Unità"],
    rows: (pl) => Object.entries(pl.machining.perType).map(([t, r]) => [t, dec(r.baseMin), dec(r.perUnitMin), r.unit]),
    apply: (pl, rows) => {
      const perType: Record<string, unknown> = {};
      for (const r of rows) perType[r.text(0)] = { baseMin: r.number(1, "tempo"), perUnitMin: r.number(2, "tempo"), unit: r.text(3) };
      return { ...pl, machining: { ...pl.machining, perType: perType as PriceList["machining"]["perType"] } };
    },
  },
  ferramenta: {
    header: ["Codice", "Descrizione", "Prezzo €"],
    rows: (pl) => Object.entries(pl.hardware.priceCents).map(([code, c]) => [code, hasHardware(code) ? findHardware(code).name : "", euro(c)]),
    apply: (pl, rows) => {
      const priceCents: Record<string, number> = {};
      for (const r of rows) priceCents[r.text(0)] = r.price(2);
      return { ...pl, hardware: { priceCents } };
    },
  },
  trattamenti: {
    header: ["Id", "Descrizione", "Prezzo €/m²"],
    rows: (pl) => pl.treatments.map((t) => [t.id, t.label, euro(t.pricePerM2Cents)]),
    apply: (pl, rows) => ({ ...pl, treatments: rows.map((r) => ({ id: r.text(0), label: r.text(1), pricePerM2Cents: r.price(2) })) }),
  },
  coperture: {
    header: ["Id", "Descrizione", "Prezzo €/m²"],
    rows: (pl) => pl.coverings.map((t) => [t.id, t.label, euro(t.pricePerM2Cents)]),
    apply: (pl, rows) => ({ ...pl, coverings: rows.map((r) => ({ id: r.text(0), label: r.text(1), pricePerM2Cents: r.price(2) })) }),
  },
  manodopera: {
    header: ["Voce", "Chiave", "Minuti"],
    rows: (pl) => [
      ...Object.entries(pl.labour.minPerPiece).map(([k, m]) => ["pezzo", k, dec(m)]),
      ...Object.entries(pl.labour.minPerJoint).map(([k, m]) => ["giunto", k, dec(m)]),
      ...Object.entries(pl.labour.minPerHardware).map(([k, m]) => ["ferramenta", k, dec(m)]),
    ],
    apply: (pl, rows) => {
      const maps: Record<string, Record<string, number>> = { pezzo: {}, giunto: {}, ferramenta: {} };
      for (const r of rows) {
        const map = maps[r.text(0)];
        if (!map) r.errors.push(`riga ${r.row}: voce "${r.text(0)}" non valida (pezzo, giunto, ferramenta)`);
        else map[r.text(1)] = r.number(2, "tempo");
      }
      return {
        ...pl,
        labour: {
          ...pl.labour,
          minPerPiece: maps.pezzo as PriceList["labour"]["minPerPiece"],
          minPerJoint: maps.giunto as PriceList["labour"]["minPerJoint"],
          minPerHardware: maps.ferramenta as PriceList["labour"]["minPerHardware"],
        },
      };
    },
  },
  zone: {
    header: ["Zona", "Prefissi CAP", "Km", "Prezzo €"],
    rows: (pl) => pl.transport.zones.map((z) => [z.name, z.capPrefixes.join(" "), dec(z.km), euro(z.priceCents)]),
    apply: (pl, rows) => ({
      ...pl,
      transport: { ...pl.transport, zones: rows.map((r) => ({ name: r.text(0), capPrefixes: r.list(1), km: r.number(2, "km"), priceCents: r.price(3) })) },
    }),
  },
};

/** Intestazione della tabella. */
export const tableHeader = (table: PriceTable): readonly string[] => TABLES[table].header;

/** CSV della tabella del listino (con BOM e intestazione). */
export function exportTable(priceList: PriceList, table: PriceTable): string {
  const def = TABLES[table];
  return toCsv([[...def.header], ...def.rows(priceList)]);
}

const norm = (s: string) => s.trim().toLowerCase();

/** Importa la tabella dal CSV: nuovo listino validato, differenze ed errori per riga/campo. */
export function importTable(priceList: PriceList, table: PriceTable, csv: string): ImportResult {
  const def = TABLES[table];
  const parsed: Rows = parseCsv(csv);
  const errors: string[] = [];
  const [head, ...body] = parsed;
  if (!head || head.cells.length !== def.header.length || head.cells.some((c, i) => norm(c) !== norm(def.header[i]))) {
    return { next: null, diff: [], errors: [`riga 1: intestazione non valida (attesa: ${def.header.join(";")})`] };
  }
  const readers: RowReader[] = [];
  for (const r of body) {
    if (r.cells.length !== def.header.length) {
      errors.push(`riga ${r.row}: attese ${def.header.length} colonne, trovate ${r.cells.length}`);
      continue;
    }
    readers.push(new RowReader(r.row, r.cells));
  }
  const candidate = def.apply(priceList, readers);
  errors.push(...readers.flatMap((r) => r.errors));
  const diff = diffDocuments(priceList, candidate);
  if (errors.length) return { next: null, diff, errors };
  const checked = safeParsePriceList(candidate);
  if (!checked.ok) return { next: null, diff, errors: checked.issues.map((i) => `campo ${i.path}: ${i.message}`) };
  return { next: checked.value, diff: diffDocuments(priceList, checked.value), errors: [] };
}
