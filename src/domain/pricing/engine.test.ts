import { describe, expect, it } from "vitest";
import { assemblyBounds } from "../assembly/bounds";
import { parseEnvelope } from "../envelope/types";
import { generate } from "../typologies/registry";
import { makeContext, piece } from "./__tests__/context";
import { DEFAULT_PRICE_LIST, DEFAULT_PRICE_LIST_VERSION } from "./data/default-listino";
import { COST_PHASES, priceAssembly, quoteToJSON } from "./engine";
import { computeTotals } from "./phases/totals";
import type { Assembly } from "../components/types";
import type { PriceList, QuoteLine } from "./types";

const envelopeFor = (a: Pick<Assembly, "pieces">) => {
  const b = assemblyBounds(a)!;
  const up = (v: number) => Math.ceil(v / 100) * 100;
  return parseEnvelope({ box: { width: up(b.max.x), depth: up(b.max.y), height: up(b.max.z) + 200 } });
};
const OPTIONS = { species: "abete", quality: "lamellare", treatment: "impregnante-incolore", covering: "policarbonato-alveolare", cap: "37100" };
const cost = (amountCents: number, category: QuoteLine["category"] = "legno"): QuoteLine => ({
  code: `x-${amountCents}`, category, label: "x", quantity: 1, unit: "pz", unitPriceCents: amountCents, amountCents, explain: [], visibility: "cliente",
});

describe("totali (4.4)", () => {
  it("4 731,80 € con passo 10 € → 4 730 € e riga arrotondamento", () => {
    const pl: PriceList = { ...DEFAULT_PRICE_LIST, margins: { materialsPct: 0, labourPct: 0 }, minimumOrderCents: 0 };
    // imponibile 4 301,64 € + IVA 10% 430,16 € = 4 731,80 €
    const r = computeTotals([cost(430_164)], pl, { vat: "ristrutturazione" }, "listino v1 del 2026-01-01");
    expect(r.totals.taxableCents + r.totals.vatCents).toBe(473_180);
    expect(r.totals.totalCents).toBe(473_000);
    expect(r.totals.roundingCents).toBe(-180);
    const rounding = r.lines.find((l) => l.code === "arrotondamento")!;
    expect(rounding).toMatchObject({ category: "adeguamenti", amountCents: -180 });
  });

  it("ordine margini → sconti → minimo → IVA → arrotondamento; imponibile sotto il minimo → adeguamento", () => {
    const r = computeTotals([cost(50_000), cost(20_000, "montaggio"), cost(9_000, "trasporto")], DEFAULT_PRICE_LIST, { discounts: ["cliente-abituale", { id: "manuale", label: "Manuale", kind: "fisso", value: 1_000 }] }, "v");
    expect(r.lines.map((l) => l.code)).toEqual(["margine-materiali", "margine-manodopera", "sconto-cliente-abituale", "sconto-manuale", "minimo-ordine", "iva-ordinaria"]);
    // margini 30% di 500 € e 25% di 200 € (il trasporto non ha margine)
    expect(r.totals.marginCents).toBe(15_000 + 5_000);
    const subtotal = 79_000 + 20_000;
    expect(r.totals.discountCents).toBe(-(Math.round(subtotal * 0.05) + 1_000));
    expect(r.totals.minimumAdjustmentCents).toBe(150_000 - (subtotal + r.totals.discountCents));
    expect(r.totals.taxableCents).toBe(150_000);
    expect(r.totals.vatCents).toBe(33_000);
    expect(r.totals.totalCents).toBe(183_000);
    expect(r.lines.filter((l) => l.category === "margine").every((l) => l.visibility === "ufficio")).toBe(true);
  });

  it("sconto sconosciuto ignorato con avviso; aliquota sconosciuta → default e avviso bloccante", () => {
    const r = computeTotals([cost(500_000)], DEFAULT_PRICE_LIST, { discounts: ["nessuno"], vat: "zero" }, "v");
    expect(r.warnings.map((w) => [w.code, w.ref, w.blocking])).toEqual([
      ["opzione-sconosciuta", "nessuno", false],
      ["opzione-sconosciuta", "zero", true],
    ]);
    expect(r.totals.vatPct).toBe(22);
  });
});

describe("priceAssembly (4.4)", () => {
  const bifalda = generate("autoportante-bifalda");
  const input = { assembly: bifalda, envelope: envelopeFor(bifalda), options: OPTIONS, priceList: DEFAULT_PRICE_LIST, version: DEFAULT_PRICE_LIST_VERSION };

  it("fasi in ordine fisso, totali coerenti con le righe, stato completo", () => {
    const q = priceAssembly(input);
    expect(COST_PHASES.map(([n]) => n)).toEqual(["legno", "lavorazioni", "ferramenta", "trattamenti", "copertura", "montaggio", "complicazioni", "trasporto"]);
    expect(q.status).toBe("completo");
    expect(q.warnings).toEqual([]);
    // rango di ogni riga nell'ordine delle fasi: mai decrescente
    const rank = (l: QuoteLine): number =>
      l.code === "minimo-ordine" ? 11 : l.code === "arrotondamento" ? 13 : ({ legno: 0, sfrido: 0, lavorazioni: 1, ferramenta: 2, trattamenti: 3, copertura: 4, montaggio: 5, complicazioni: 6, trasporto: 7, manuali: 8, margine: 9, sconti: 10, adeguamenti: 11, iva: 12 } as const)[l.category];
    const ranks = q.lines.map(rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks)).toEqual(new Set([0, 1, 4, 3, 5, 6, 7, 9, 12, ...(q.totals.roundingCents ? [13] : [])]));
    expect(q.lines.at(-1)!.category === "iva" || q.lines.at(-1)!.code === "arrotondamento").toBe(true);
    const all = q.lines.reduce((s, l) => s + l.amountCents, 0);
    expect(all).toBe(q.totals.totalCents);
    expect(q.groups.reduce((s, g) => s + g.amountCents, 0)).toBe(q.totals.totalCents);
    expect(q.totals.totalCents % DEFAULT_PRICE_LIST.roundingStepCents).toBe(0);
    expect(q.priceListVersion.id).toBe("listino-v1");
    expect(q.typologySlug).toBe("autoportante-bifalda");
  });

  it("due esecuzioni identiche byte per byte", () => {
    const a = quoteToJSON(priceAssembly(input));
    const b = quoteToJSON(priceAssembly({ ...input, assembly: generate("autoportante-bifalda"), envelope: envelopeFor(bifalda) }));
    expect(a).toBe(b);
  });

  it("imponibile sotto il minimo d'ordine → riga adeguamento", () => {
    const a = { pieces: [piece("pilastro", 120, 120, 2400)] };
    const q = priceAssembly({ assembly: a, envelope: envelopeFor(a), options: { species: "abete", quality: "lamellare", cap: "37100" }, priceList: DEFAULT_PRICE_LIST, version: DEFAULT_PRICE_LIST_VERSION });
    const min = q.lines.find((l) => l.code === "minimo-ordine")!;
    expect(min.amountCents).toBeGreaterThan(0);
    expect(q.totals.taxableCents).toBe(DEFAULT_PRICE_LIST.minimumOrderCents);
  });

  it("listino incompleto → stato incompleto; fattori sostituiti dal simulatore", () => {
    const { "vite-8x40": _omit, ...priceCents } = DEFAULT_PRICE_LIST.hardware.priceCents;
    const portale = generate("portale-sandwich");
    const q = priceAssembly({ ...input, assembly: portale, envelope: envelopeFor(portale), priceList: { ...DEFAULT_PRICE_LIST, hardware: { priceCents } } });
    expect(q.status).toBe("incompleto");
    expect(q.warnings).toContainEqual(expect.objectContaining({ code: "prezzo-mancante", ref: "vite-8x40" }));
    const dev = priceAssembly({ ...input, siteFactors: { planDeviationDeg: 6 } });
    expect(dev.firedRules).toContain("fuorisquadra");
    expect(dev.siteFactors.planDeviationDeg).toBe(6);
    expect(makeContext(bifalda).siteFactors.planDeviationDeg).toBe(0);
  });
});
