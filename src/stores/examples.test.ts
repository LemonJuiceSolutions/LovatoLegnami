import { describe, expect, it } from "vitest";
import { ConfigFileSchema } from "./config-file";
import { computeDerived } from "./config";
import { EXAMPLES, exampleConfig } from "./examples";

describe("esempi precaricati", () => {
  it("ci sono la monofalda con grondaia e pavimento in pendenza e la bifalda libera", () => {
    expect(EXAMPLES.map((e) => e.name)).toEqual(["Monofalda con grondaia", "Bifalda libera"]);
    const mono = exampleConfig("monofalda-grondaia");
    expect(mono.envelope.obstacles.map((o) => o.type)).toEqual(["grondaia"]);
    const corners = Object.values(mono.envelope.floor.corners);
    expect(new Set(corners).size).toBeGreaterThan(1);
    expect(exampleConfig("bifalda-libera").envelope.obstacles).toEqual([]);
    expect(() => exampleConfig("nessuno")).toThrow(/non trovato/);
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))("%s passa ConfigFileSchema e genera un assieme senza errori né collisioni", (_id, example) => {
    expect(ConfigFileSchema.safeParse(example.file).success).toBe(true);
    const derived = computeDerived(exampleConfig(example.id));
    expect(derived.error).toBeNull();
    expect(derived.paramErrors).toEqual({});
    expect(derived.assembly?.typologySlug).toBe(example.file.typology);
    expect(derived.violations.filter((v) => v.severity === "errore")).toEqual([]);
    expect(derived.collisions).toEqual([]);
  });
});
