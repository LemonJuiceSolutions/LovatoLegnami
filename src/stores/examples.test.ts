import { describe, expect, it } from "vitest";
import { ConfigFileSchema } from "./config-file";
import { computeDerived } from "./config";
import { getPreset } from "@/domain";
import { EXAMPLES, exampleConfig } from "./examples";

describe("esempi precaricati", () => {
  it("ci sono la monofalda con grondaia e pavimento in pendenza e la bifalda libera", () => {
    expect(EXAMPLES.slice(0, 2).map((e) => e.name)).toEqual(["Monofalda con grondaia", "Bifalda libera"]);
    const mono = exampleConfig("monofalda-grondaia");
    expect(mono.envelope.obstacles.map((o) => o.type)).toEqual(["grondaia"]);
    const corners = Object.values(mono.envelope.floor.corners);
    expect(new Set(corners).size).toBeGreaterThan(1);
    expect(exampleConfig("bifalda-libera").envelope.obstacles).toEqual([]);
    expect(() => exampleConfig("nessuno")).toThrow(/non trovato/);
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))("%s passa ConfigFileSchema e genera un assieme senza errori (né collisioni, se l'ingombro è dichiarato)", (id, example) => {
    expect(ConfigFileSchema.safeParse(example.file).success).toBe(true);
    const derived = computeDerived(exampleConfig(example.id));
    expect(derived.error).toBeNull();
    expect(derived.paramErrors).toEqual({});
    expect(derived.assembly?.typologySlug).toBe(example.file.typology);
    expect(derived.violations.filter((v) => v.severity === "errore")).toEqual([]);
    // Ingombro allargato dei preset senza ingombro: i box dei pezzi possono sporgere di
    // pochi mm dal quadrante positivo (teste inclinate, segmenti d'arco), vedi note 10.1.
    if (getPreset(id).envelope) expect(derived.collisions).toEqual([]);
  });
});
