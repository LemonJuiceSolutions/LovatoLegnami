import { describe, expect, it } from "vitest";
import { PRESET_CATALOG, assemblyBounds } from "@/domain";
import { computeDerived, defaultConfig, presetConfig, typologySlugs, type ConfiguratoreConfig } from "./config";
import { EXAMPLES, exampleConfig } from "./examples";

/**
 * Regressione: ogni tipologia con i parametri di default e ogni preset (o
 * esempio del menu) si apre nel configuratore senza collisioni con il proprio
 * ingombro di default (o dichiarato) e senza violazioni di gravità `errore`.
 * L'ingombro ha l'origine nell'angolo anteriore sinistro dell'assieme: il legno
 * deve stare in x, y ≥ 0 e sopra il pavimento.
 */

const summary = (config: ConfiguratoreConfig) => {
  const d = computeDerived(config);
  return {
    error: d.error,
    paramErrors: d.paramErrors,
    collisions: d.collisions.map((c) => c.message),
    errori: d.violations.filter((v) => v.severity === "errore").map((v) => v.message),
  };
};

const clean = { error: null, paramErrors: {}, collisions: [], errori: [] };

describe("store – default e preset senza collisioni né errori", () => {
  it("le tipologie registrate sono 10", () => {
    expect(typologySlugs()).toHaveLength(10);
  });

  for (const slug of typologySlugs())
    it(`tipologia ${slug} con i default`, () => {
      const config = defaultConfig(slug);
      expect(summary(config)).toEqual(clean);
      const b = assemblyBounds(computeDerived(config).assembly!)!;
      expect(b.min.x).toBeGreaterThanOrEqual(-1e-6);
      expect(b.min.y).toBeGreaterThanOrEqual(-1e-6);
    });

  it("i preset del catalogo sono 27", () => {
    expect(PRESET_CATALOG).toHaveLength(27);
    expect(EXAMPLES).toHaveLength(27);
  });

  for (const preset of PRESET_CATALOG)
    it(`preset ${preset.id} (${preset.typologySlug})`, () => {
      expect(summary(presetConfig(preset.id))).toEqual(clean);
      // l'esempio del menu passa dal file di configurazione: stesso risultato
      expect(summary(exampleConfig(preset.id))).toEqual(clean);
    });
});
