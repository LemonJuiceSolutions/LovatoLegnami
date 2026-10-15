import { describe, expect, it } from "vitest";
import { assemblyBounds } from "../assembly/bounds";
import { parseEnvelope } from "../envelope/types";
import { generate } from "../typologies/registry";
import { DEFAULT_PRICE_LIST, DEFAULT_PRICE_LIST_VERSION } from "./data/default-listino";
import { priceAssembly } from "./engine";
import { MoneyError } from "./money";
import { CustomerQuoteSchema, customerView } from "./views";

const assembly = generate("addossata-monofalda");
const b = assemblyBounds(assembly)!;
const envelope = parseEnvelope({ box: { width: Math.ceil(b.max.x / 100) * 100, depth: Math.ceil(b.max.y / 100) * 100 + 100, height: Math.ceil(b.max.z / 100) * 100 + 200 } });
const base = { assembly, envelope, priceList: DEFAULT_PRICE_LIST, version: DEFAULT_PRICE_LIST_VERSION, options: { species: "abete", quality: "lamellare", cap: "37100" } };

describe("voci manuali del preventivo definitivo (10.4)", () => {
  it("senza voci il preventivo non cambia", () => {
    expect(priceAssembly({ ...base, manualLines: [] })).toEqual(priceAssembly(base));
  });

  it("una voce manuale entra nell'imponibile senza margine, con IVA, e nella vista cliente come 'Altre voci'", () => {
    const plain = priceAssembly(base);
    const q = priceAssembly({ ...base, manualLines: [{ description: "  Smontaggio  vecchia tettoia ", amountCents: 50_000 }] });
    const manual = q.lines.find((l) => l.code === "manuale-1")!;
    expect(manual).toMatchObject({ category: "manuali", label: "Smontaggio vecchia tettoia", amountCents: 50_000, visibility: "cliente" });
    expect(q.totals.costCents).toBe(plain.totals.costCents + 50_000);
    expect(q.totals.marginCents).toBe(plain.totals.marginCents);
    expect(q.totals.taxableCents).toBe(plain.totals.taxableCents + 50_000);
    expect(q.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(q.totals.totalCents);
    expect(q.groups.find((g) => g.category === "manuali")?.label).toBe("Voci aggiuntive");
    const cv = CustomerQuoteSchema.parse(customerView(q));
    expect(cv.groups.at(-1)).toEqual({ id: "altre-voci", label: "Altre voci", amountCents: 50_000 });
    expect(cv.groups.reduce((s, g) => s + g.amountCents, 0) + cv.discountCents + cv.minimumAdjustmentCents).toBe(cv.taxableCents);
  });

  it("sconto percentuale e IVA 10% sul totale con la voce manuale; importo non intero rifiutato", () => {
    const q = priceAssembly({ ...base, options: { ...base.options, vat: "ristrutturazione", discounts: [{ id: "ufficio", label: "Sconto", kind: "percento", value: 10 }] }, manualLines: [{ description: "Extra", amountCents: -20_000 }] });
    expect(q.totals.vatPct).toBe(10);
    expect(q.totals.discountCents).toBeLessThan(0);
    expect(() => priceAssembly({ ...base, manualLines: [{ description: "x", amountCents: 1.5 }] })).toThrow(MoneyError);
  });
});
