import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assemblyBounds } from "../assembly/bounds";
import type { Assembly } from "../components/types";
import { checkCollisions } from "../envelope/collisions";
import { parseEnvelope, type Envelope } from "../envelope/types";
import { generate } from "../typologies/registry";
import { DEFAULT_PRICE_LIST, DEFAULT_PRICE_LIST_VERSION } from "./data/default-listino";
import { priceAssembly, quoteToJSON } from "./engine";
import { customerView } from "./views";

/**
 * Regressione del preventivo (4.8): tipologia con i parametri di default, ingombro di
 * default del configuratore, listino seed v1. Per rigenerare dopo una modifica voluta:
 * `UPDATE_GOLDEN=1 npx vitest run src/domain/pricing/golden.test.ts`.
 */

/** Ingombro di default come nello store (`defaultEnvelopeFor`): 6000×3600×3700 allargato se serve. */
function defaultEnvelope(assembly: Assembly): Envelope {
  const base = parseEnvelope({ box: { width: 6000, depth: 3600, height: 3700 } });
  if (checkCollisions(assembly, base).length === 0) return base;
  const { max } = assemblyBounds(assembly)!;
  const ceil100 = (mm: number) => Math.ceil(mm / 100) * 100;
  return parseEnvelope({
    box: {
      width: Math.max(base.box.width, ceil100(max.x)),
      depth: Math.max(base.box.depth, ceil100(max.y) + 100),
      height: Math.max(base.box.height, ceil100(max.z) + 100),
    },
  });
}

/** Opzioni commerciali di riferimento: abete lamellare, impregnante, policarbonato, provincia. */
const GOLDEN_OPTIONS = {
  species: "abete",
  quality: "lamellare",
  treatment: "impregnante-incolore",
  covering: "policarbonato-alveolare",
  cap: "37100",
} as const;

const FIXTURES = [
  { slug: "addossata-monofalda", file: "preventivo-monofalda-default.json" },
  { slug: "autoportante-bifalda", file: "preventivo-bifalda-default.json" },
] as const;

const fixturePath = (file: string) => fileURLToPath(new URL(`./__fixtures__/${file}`, import.meta.url));

const quoteFor = (slug: string) => {
  const assembly = generate(slug);
  return priceAssembly({ assembly, envelope: defaultEnvelope(assembly), options: GOLDEN_OPTIONS, priceList: DEFAULT_PRICE_LIST, version: DEFAULT_PRICE_LIST_VERSION });
};

describe("preventivi golden (4.8)", () => {
  for (const { slug, file } of FIXTURES) {
    it(`${slug} con i default coincide con ${file}`, () => {
      const quote = quoteFor(slug);
      // JSON canonico (chiavi ordinate) indentato per diff leggibili
      const current = `${JSON.stringify(JSON.parse(quoteToJSON(quote)), null, 2)}\n`;
      if (process.env.UPDATE_GOLDEN) writeFileSync(fixturePath(file), current);
      expect(current).toBe(readFileSync(fixturePath(file), "utf8"));
    });

    it(`${slug}: totale plausibile e preventivo completo`, () => {
      const quote = quoteFor(slug);
      expect(quote.status).toBe("completo");
      // Ordine di grandezza atteso con il listino seed (DA VALIDARE): 3 000–15 000 € IVA inclusa.
      // Al momento della stesura: monofalda 6×3 m ≈ 4 700 €, bifalda 5×4 m ≈ 6 470 €.
      expect(quote.totals.totalCents).toBeGreaterThanOrEqual(300_000);
      expect(quote.totals.totalCents).toBeLessThanOrEqual(1_500_000);
      expect(customerView(quote).totalCents).toBe(quote.totals.totalCents);
    });
  }
});
