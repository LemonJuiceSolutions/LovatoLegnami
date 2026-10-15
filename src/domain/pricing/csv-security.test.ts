import { afterEach, describe, expect, it } from "vitest";
import { importTable, type PriceTable } from "./csv";
import { DEFAULT_PRICE_LIST, DEFAULT_PRICE_LIST_DATA } from "./data/default-listino";
import { safeParsePriceList } from "./types";

/** Prototype pollution: chiavi speciali da CSV o JSON non devono mai toccare i prototipi. */
const polluted = () => (({}) as Record<string, unknown>).polluted;

afterEach(() => {
  delete (Object.prototype as Record<string, unknown>).polluted;
});

const CASES: [PriceTable, string][] = [
  ["legno", 'Specie;Qualità;Prezzo €/m³\n__proto__;polluted;650,00\nabete;__proto__;650,00\nconstructor;lamellare;1\n'],
  ["lunghezze", "Sezione;Lunghezza mm;Prezzo barra €;Qualità\n__proto__;4000;;\n"],
  ["lavorazioni", "Tipo;Base min;Per unità min;Unità\n__proto__;1;0;n\nprototype;1;0;n\n"],
  ["ferramenta", "Codice;Descrizione;Prezzo €\n__proto__;x;1,00\nconstructor;x;1,00\n"],
  ["manodopera", "Voce;Chiave;Minuti\n__proto__;PIL;3\npezzo;__proto__;3\nconstructor;PIL;3\n"],
];

describe("CSV del listino: chiavi riservate", () => {
  for (const [table, csv] of CASES) {
    it(`${table}: __proto__/constructor/prototype → errore e nessun inquinamento`, () => {
      const r = importTable(DEFAULT_PRICE_LIST, table, csv);
      expect(r.next).toBeNull();
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors.every((e) => /^riga \d+: /.test(e))).toBe(true);
      expect(polluted()).toBeUndefined();
      expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    });
  }

  it("legno: l'errore cita la riga e la chiave", () => {
    const r = importTable(DEFAULT_PRICE_LIST, "legno", "Specie;Qualità;Prezzo €/m³\nabete;lamellare;650,00\n__proto__;polluted;650,00\n");
    expect(r.errors).toEqual(['riga 3: chiave "__proto__" non ammessa']);
    expect(polluted()).toBeUndefined();
  });
});

describe("parsePriceList: chiavi riservate nel JSON dell'admin", () => {
  it("rifiuta __proto__, constructor e prototype citando il percorso", () => {
    const base = JSON.parse(JSON.stringify(DEFAULT_PRICE_LIST_DATA));
    const evil = JSON.parse(
      JSON.stringify(base)
        .replace('"priceCents":{', '"priceCents":{"constructor":5,"__proto__":{"polluted":1},')
        .replace('"pricePerM3":{', '"pricePerM3":{"prototype":{"lamellare":1},'),
    );
    const r = safeParsePriceList(evil);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const paths = r.issues.map((i) => i.path);
      expect(paths).toEqual(expect.arrayContaining(["hardware.priceCents.constructor", "hardware.priceCents.__proto__", "timber.pricePerM3.prototype"]));
    }
    expect(polluted()).toBeUndefined();
  });
});
