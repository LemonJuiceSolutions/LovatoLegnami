import { describe, expect, it } from "vitest";
import { assemblyBounds } from "../assembly/bounds";
import type { Assembly } from "../components/types";
import { parseEnvelope } from "../envelope/types";
import { canonicalJson } from "../math/canonical";
import { generate } from "../typologies/registry";
import { DEFAULT_PRICE_LIST, DEFAULT_PRICE_LIST_VERSION } from "./data/default-listino";
import { priceAssembly } from "./engine";
import type { PricingOptionsInput } from "./types";
import { allocate, CustomerQuoteSchema, customerView, officeView } from "./views";

const envelopeFor = (a: Pick<Assembly, "pieces">) => {
  const b = assemblyBounds(a)!;
  const up = (v: number) => Math.ceil(v / 100) * 100;
  return parseEnvelope({ box: { width: up(b.max.x), depth: up(b.max.y), height: up(b.max.z) + 200 } });
};
const quoteOf = (slug: string, options: Partial<PricingOptionsInput> = {}) => {
  const a = generate(slug);
  return priceAssembly({
    assembly: a,
    envelope: envelopeFor(a),
    options: { species: "abete", quality: "lamellare", treatment: "impregnante-incolore", covering: "policarbonato-alveolare", cap: "37100", ...options },
    priceList: DEFAULT_PRICE_LIST,
    version: DEFAULT_PRICE_LIST_VERSION,
  });
};

/** Chiavi vietate nella vista cliente (dati interni): confronto case-insensitive per sottostringa. */
const BLACKLIST = ["margin", "hourly", "rate", "bars", "waste", "unitprice", "cost", "cut", "offcut", "kerf", "trim", "factor", "rule", "explain", "lines"];

const keysOf = (v: unknown): string[] =>
  v && typeof v === "object" ? Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => [k, ...keysOf(x)]) : [];

describe("vista cliente (4.5)", () => {
  for (const slug of ["addossata-monofalda", "autoportante-bifalda", "portale-sandwich", "carport-arco"]) {
    it(`${slug}: nessuna chiave della lista nera, forma strict e totale uguale alla vista ufficio`, () => {
      const q = quoteOf(slug, { discounts: ["cliente-abituale"] });
      const c = customerView(q);
      const json = canonicalJson(c);
      const keys = keysOf(JSON.parse(json)).map((k) => k.toLowerCase());
      for (const bad of BLACKLIST) expect(keys.filter((k) => k.includes(bad)), bad).toEqual([]);
      expect(json.toLowerCase()).not.toContain("margine");
      expect(json).not.toContain("€/h");
      expect(CustomerQuoteSchema.parse(c)).toEqual(c);
      expect(c.totalCents).toBe(officeView(q).totals.totalCents);
      // le voci (con i margini ridistribuiti) + sconti + minimo = imponibile; + IVA + arrotondamento = totale
      const groups = c.groups.reduce((s, g) => s + g.amountCents, 0);
      expect(groups + c.discountCents + c.minimumAdjustmentCents).toBe(c.taxableCents);
      expect(c.taxableCents + c.vatCents + c.roundingCents).toBe(c.totalCents);
      expect(groups).toBe(q.totals.costCents + q.totals.marginCents);
    });
  }

  it("voci: struttura, ferramenta e finiture, copertura, montaggio e trasporto", () => {
    const c = customerView(quoteOf("portale-sandwich"));
    expect(c.groups.map((g) => g.label)).toEqual(["Struttura in legno", "Ferramenta e finiture", "Copertura", "Montaggio e trasporto"]);
    expect(customerView(quoteOf("portale-sandwich", { covering: null, treatment: null })).groups.map((g) => g.id)).toEqual([
      "struttura",
      "ferramenta-finiture",
      "montaggio-trasporto",
    ]);
  });

  it("fascia ±10% arrotondata al passo", () => {
    const q = quoteOf("autoportante-bifalda");
    const c = customerView(q);
    const t = c.totalCents;
    expect(c.range.pct).toBe(10);
    expect(c.range.minCents).toBe(Math.round((t * 0.9) / 1000) * 1000);
    expect(c.range.maxCents).toBe(Math.round((t * 1.1) / 1000) * 1000);
    expect(c.range.minCents % 1000).toBe(0);
    expect(c.notes[0]).toBe("Prezzo indicativo (±10%), soggetto a sopralluogo.");
  });

  it("note semplici: complicazioni comprese, zona da verificare, prezzo su richiesta", () => {
    const c = customerView(quoteOf("addossata-monofalda", { cap: "00100" }));
    expect(c.notes).toContain("Il costo del trasporto va verificato per la zona di consegna.");
    expect(c.notes.some((n) => n.startsWith("Il prezzo comprende le lavorazioni di cantiere per: lavoro in quota oltre 3,5 m"))).toBe(true);
    // Note per il cliente senza misure grezze (es. "3598,4 mm").
    for (const n of c.notes) expect(n).not.toMatch(/\d+,\d+\s*mm|\d{3,}\s*mm/);
    expect(c.status).toBe("completo");
    const { "vite-8x40": _omit, ...priceCents } = DEFAULT_PRICE_LIST.hardware.priceCents;
    const a = generate("portale-sandwich");
    const inc = customerView(
      priceAssembly({ assembly: a, envelope: envelopeFor(a), options: { species: "abete", quality: "lamellare" }, priceList: { ...DEFAULT_PRICE_LIST, hardware: { priceCents } }, version: DEFAULT_PRICE_LIST_VERSION }),
    );
    expect(inc.status).toBe("incompleto");
    expect(inc.notes).toContain("Alcune voci vanno verificate dal nostro ufficio: il prezzo definitivo è su richiesta.");
  });

  it("lo schema rifiuta chiavi in più (risposta pubblica esatta)", () => {
    const c = customerView(quoteOf("autoportante-bifalda"));
    expect(CustomerQuoteSchema.safeParse({ ...c, marginCents: 1 }).success).toBe(false);
    expect(CustomerQuoteSchema.safeParse({ ...c, groups: [{ ...c.groups[0], unitPriceCents: 1 }] }).success).toBe(false);
  });

  it("allocate: ripartizione esatta al centesimo con i resti più grandi", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(allocate(7, [0, 0])).toEqual([7, 0]);
    expect(allocate(1000, [3, -2, 1])).toEqual([750, 0, 250]);
  });
});

describe("vista ufficio (4.5)", () => {
  it("tutte le righe per categoria, piano di taglio, fattori e regole scattate", () => {
    const q = quoteOf("addossata-monofalda");
    const o = officeView(q);
    expect(o.versionLabel).toBe("listino v1 del 2026-01-01");
    expect(o.groups.flatMap((g) => g.lines)).toHaveLength(q.lines.length);
    expect(o.groups.map((g) => g.category)).toContain("margine");
    expect(o.cutPlan.groups.length).toBeGreaterThan(0);
    expect(o.cutPlan.groups[0].bars[0].cuts.length).toBeGreaterThan(0);
    expect(o.siteFactors.maxHeightMm).toBeGreaterThan(3500);
    expect(o.firedRules.map((r) => r.id)).toEqual(["altezza"]);
    expect(o.firedRules[0].label).toMatch(/^Complicazione: lavoro in quota/);
  });
});
