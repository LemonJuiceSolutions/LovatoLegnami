import { describe, expect, it } from "vitest";
import { defaultConfig, serializeConfig } from "@/stores";
import { blacklistedKeys, EstimateRequestSchema, EstimateResponseSchema } from "../public-dto";

const config = () => JSON.parse(serializeConfig(defaultConfig("addossata-monofalda")));

describe("contratti pubblici (8.4)", () => {
  it("richiesta di stima: default di cantiere e finiture, chiavi in più rifiutate", () => {
    const r = EstimateRequestSchema.parse({ config: config() });
    expect(r.declared).toEqual({ access: "facile" });
    expect(r.commercial).toEqual({ species: "abete", quality: "lamellare", treatment: null, covering: null });
    expect(EstimateRequestSchema.safeParse({ config: config(), assembly: {} }).success).toBe(false);
    expect(EstimateRequestSchema.safeParse({ config: config(), declared: { access: "facile", km: 3 } }).success).toBe(false);
    expect(EstimateRequestSchema.safeParse({ config: config(), declared: { cap: "3710" } }).success).toBe(false);
    expect(EstimateRequestSchema.safeParse({ config: config(), commercial: { species: "../x" } }).success).toBe(false);
  });

  it("risposta: strict, vista cliente senza chiavi interne", () => {
    expect(EstimateResponseSchema.safeParse({ quote: {}, notes: [] }).success).toBe(false);
    expect(blacklistedKeys({ quote: { groups: [{ amountCents: 1 }], range: {} }, notes: [] })).toEqual([]);
    expect(blacklistedKeys({ quote: { lines: [{ unitPriceCents: 1 }] }, marginPct: 30 })).toEqual(["quote.lines", "quote.lines[0].unitPriceCents", "marginPct"]);
  });
});
