import { describe, expect, it } from "vitest";
import { assemblyBounds } from "../assembly/bounds";
import { floorFunction } from "../envelope/floor";
import { parseEnvelope } from "../envelope/types";
import { listPresets, loadPreset } from "../presets/catalog";
import { generate, listTypologies } from "../typologies/registry";
import { DEFAULT_PRICE_LIST, DEFAULT_PRICE_LIST_VERSION } from "./data/default-listino";
import { priceAssembly } from "./engine";

/**
 * Copertura del listino seed (4.9): ogni preset del catalogo produce un preventivo
 * `completo` (nessun prezzo o tariffa mancante) con trattamento e copertura scelti.
 */
describe("preset × listino seed (4.9)", () => {
  for (const preset of listPresets()) {
    it(`${preset.id}: preventivo completo`, () => {
      const loaded = loadPreset(preset.id);
      const probe = generate(loaded.typologySlug, loaded.params);
      const b = assemblyBounds(probe)!;
      const up = (v: number) => Math.ceil(v / 100) * 100;
      const envelope = loaded.envelope ?? parseEnvelope({ box: { width: up(b.max.x), depth: up(b.max.y) + 100, height: up(b.max.z) + 100 } });
      const assembly = generate(loaded.typologySlug, loaded.params, { floorHeightAt: floorFunction(envelope) });
      const quote = priceAssembly({
        assembly,
        envelope,
        options: { species: "larice", quality: "lamellare", treatment: "impregnante-tinta", covering: "pannello-sandwich", cap: "35100" },
        priceList: DEFAULT_PRICE_LIST,
        version: DEFAULT_PRICE_LIST_VERSION,
      });
      expect(quote.warnings.filter((w) => w.blocking)).toEqual([]);
      expect(quote.status).toBe("completo");
      expect(quote.totals.totalCents).toBeGreaterThan(0);
    });
  }

  // In lamellare: con il seed il massello ha solo barre fino a 6000 mm, e un pezzo da 6000
  // (banchina e trave della monofalda di default) non entra per i rifili ⇒ `non-ricavabile`.
  for (const { slug } of listTypologies()) {
    it(`${slug} con i default: preventivo completo`, () => {
      const assembly = generate(slug);
      const b = assemblyBounds(assembly)!;
      const up = (v: number) => Math.ceil(v / 100) * 100;
      const envelope = parseEnvelope({ box: { width: up(b.max.x), depth: up(b.max.y) + 100, height: up(b.max.z) + 100 } });
      const quote = priceAssembly({ assembly, envelope, options: { species: "castagno", quality: "lamellare", treatment: "vernice-coprente", covering: "tegola-canadese", cap: "33100" }, priceList: DEFAULT_PRICE_LIST, version: DEFAULT_PRICE_LIST_VERSION });
      expect(quote.warnings.filter((w) => w.blocking)).toEqual([]);
    });
  }
});
