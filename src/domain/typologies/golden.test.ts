import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fromJSON, toJSON } from "../components/serialize";
import { generate } from "./registry";

/**
 * Regressione della generazione: l'assieme con i parametri di default deve
 * coincidere con la fixture "golden". Per rigenerare dopo una modifica voluta:
 * `UPDATE_GOLDEN=1 npx vitest run src/domain/typologies/golden.test.ts`.
 */
const FIXTURES = [
  { slug: "addossata-monofalda", file: "monofalda-default.json" },
  { slug: "autoportante-bifalda", file: "bifalda-default.json" },
  { slug: "portale-sandwich", file: "portale-sandwich-default.json" },
  { slug: "monofalda-scalare", file: "monofalda-scalare-default.json" },
  { slug: "telaio-giunti", file: "telaio-giunti-default.json" },
] as const;

const fixturePath = (file: string) => fileURLToPath(new URL(`../__fixtures__/${file}`, import.meta.url));

describe("fixture golden", () => {
  for (const { slug, file } of FIXTURES) {
    it(`${slug} con i default coincide con ${file}`, () => {
      const current = `${toJSON(generate(slug))}\n`;
      if (process.env.UPDATE_GOLDEN) writeFileSync(fixturePath(file), current);
      const golden = readFileSync(fixturePath(file), "utf8");
      expect(fromJSON(golden)).toEqual(generate(slug));
      expect(current).toBe(golden);
    });
  }
});
