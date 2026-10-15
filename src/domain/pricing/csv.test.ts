import { describe, expect, it } from "vitest";
import { exportTable, importTable, parseCsv, parseDecimal, PRICE_TABLES } from "./csv";
import { DEFAULT_PRICE_LIST } from "./data/default-listino";
import { diffDocuments } from "./diff";
import type { PriceList } from "./types";

describe("CSV del listino (4.6)", () => {
  for (const table of PRICE_TABLES) {
    it(`${table}: export → import senza modifiche → diff vuoto`, () => {
      const csv = exportTable(DEFAULT_PRICE_LIST, table);
      expect(csv.startsWith("﻿")).toBe(true);
      const r = importTable(DEFAULT_PRICE_LIST, table, csv);
      expect(r.errors).toEqual([]);
      expect(r.diff).toEqual([]);
      expect(r.next).toEqual(DEFAULT_PRICE_LIST);
    });
  }

  it('riga "abete;lamellare;12a" → errore "riga 3: prezzo non numerico"', () => {
    const csv = "﻿Specie;Qualità;Prezzo €/m³\r\nabete;massello;550,00\r\nabete;lamellare;12a\r\n";
    const r = importTable(DEFAULT_PRICE_LIST, "legno", csv);
    expect(r.errors).toEqual(["riga 3: prezzo non numerico"]);
    expect(r.next).toBeNull();
  });

  it("modifica di un prezzo: virgola decimale, diff di una voce, tabella sostituita", () => {
    const csv = exportTable(DEFAULT_PRICE_LIST, "legno").replace("abete;lamellare;650,00", "abete;lamellare;680,50");
    const r = importTable(DEFAULT_PRICE_LIST, "legno", csv);
    expect(r.errors).toEqual([]);
    expect(r.diff).toEqual([{ path: "timber.pricePerM3.abete.lamellare", before: 65_000, after: 68_050 }]);
    expect(r.next!.timber.pricePerM3.abete.lamellare).toBe(68_050);
    // righe tolte dal file = voci rimosse
    const without = importTable(DEFAULT_PRICE_LIST, "legno", csv.split("\r\n").filter((l) => !l.startsWith("castagno")).join("\r\n"));
    expect(without.diff.map((d) => d.path)).toEqual(["timber.pricePerM3.abete.lamellare", "timber.pricePerM3.castagno"]);
  });

  it("errori di schema citati per campo; intestazione e colonne verificate", () => {
    const csv = exportTable(DEFAULT_PRICE_LIST, "legno").replace("abete;lamellare;650,00", "pino;lamellare;650,00");
    expect(importTable(DEFAULT_PRICE_LIST, "legno", csv).errors).toEqual(['campo timber.pricePerM3.pino: specie "pino" non dichiarata']);
    expect(importTable(DEFAULT_PRICE_LIST, "legno", "Specie;Prezzo\r\n").errors[0]).toMatch(/^riga 1: intestazione non valida/);
    expect(importTable(DEFAULT_PRICE_LIST, "legno", "Specie;Qualità;Prezzo €/m³\nabete;650\n").errors).toEqual(["riga 2: attese 3 colonne, trovate 2"]);
    expect(importTable(DEFAULT_PRICE_LIST, "manodopera", "Voce;Chiave;Minuti\nscala;PIL;3\n").errors).toEqual(['riga 2: voce "scala" non valida (pezzo, giunto, ferramenta)']);
  });

  it("zone: prefissi separati da spazi, campi tra virgolette", () => {
    const csv = exportTable(DEFAULT_PRICE_LIST, "zone");
    expect(csv).toContain("Province limitrofe;31 35 37;80;150,00\r\n");
    const r = importTable(DEFAULT_PRICE_LIST, "zone", csv.replace("Province limitrofe;31 35 37", '"Province; limitrofe";31 35 37 38'));
    expect(r.errors).toEqual(['campo transport.zones[3].capPrefixes[2]: prefisso CAP "38" già assegnato alla zona "Province; limitrofe"']);
  });

  it("dialetto: virgolette doppie, a capo nei campi, numeri italiani", () => {
    expect(parseCsv('a;"b;""c""\nd"\r\n\r\ne;f').map((r) => [r.row, r.cells])).toEqual([
      [1, ["a", 'b;"c"\nd']],
      [4, ["e", "f"]],
    ]);
    expect(parseDecimal("1.234,50")).toBe(1234.5);
    expect(parseDecimal("0,5")).toBe(0.5);
    expect(parseDecimal("12a")).toBeUndefined();
    expect(parseDecimal("")).toBeUndefined();
  });
});

describe("diffDocuments (4.6)", () => {
  it("due listini con tre prezzi cambiati → tre voci", () => {
    const b: PriceList = {
      ...DEFAULT_PRICE_LIST,
      timber: { ...DEFAULT_PRICE_LIST.timber, pricePerM3: { ...DEFAULT_PRICE_LIST.timber.pricePerM3, larice: { lamellare: 99_000, massello: 82_000 } } },
      hardware: { priceCents: { ...DEFAULT_PRICE_LIST.hardware.priceCents, "vite-6x160": 50 } },
      transport: { ...DEFAULT_PRICE_LIST.transport, zones: DEFAULT_PRICE_LIST.transport.zones.map((z, i) => (i === 1 ? { ...z, priceCents: 16_000 } : z)) },
    };
    expect(diffDocuments(DEFAULT_PRICE_LIST, b)).toEqual([
      { path: "hardware.priceCents.vite-6x160", before: 45, after: 50 },
      { path: "timber.pricePerM3.larice.lamellare", before: 95_000, after: 99_000 },
      { path: "transport.zones[1].priceCents", before: 15_000, after: 16_000 },
    ]);
    expect(diffDocuments(DEFAULT_PRICE_LIST, structuredClone(DEFAULT_PRICE_LIST))).toEqual([]);
  });

  it("aggiunte, rimozioni e cambi di tipo come voci singole", () => {
    expect(diffDocuments({ a: 1, b: { c: 2 }, l: [1, 2] }, { a: 1, d: { e: 3 }, l: [1], b: 5 })).toEqual([
      { path: "b", before: { c: 2 }, after: 5 },
      { path: "d", after: { e: 3 } },
      { path: "l[1]", before: 2 },
    ]);
  });
});
