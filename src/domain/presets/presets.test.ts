import { describe, expect, it } from "vitest";
import { parseEnvelope } from "../envelope/types";
import { getTypology, listTypologies } from "../typologies/registry";
import { resolveParams } from "../typologies/template";
import { PRESET_CATALOG, PresetNotFoundError, listPresets, loadPreset } from "./catalog";

describe("catalogo dei preset commerciali (7.1)", () => {
  it("portale-sandwich: libere 4×6 e 4×2, MAXI 5×5 e pergola camper 3×6", () => {
    const names = listPresets("portale-sandwich").map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["Pergola libera 4×6", "Pergola libera 4×2", "MAXI 5×5", "Pergola camper 3×6"]));
    expect(listPresets("portale-sandwich").every((p) => p.typologySlug === "portale-sandwich")).toBe(true);
  });

  it("ogni slug registrato ha almeno un preset e nessun preset riferisce tipologie non registrate", () => {
    const slugs = listTypologies().map((t) => t.slug);
    for (const slug of slugs) expect(listPresets(slug).length, slug).toBeGreaterThan(0);
    for (const p of listPresets()) expect(slugs, p.id).toContain(p.typologySlug);
  });

  it("elenco completo = catalogo, id univoci in kebab-case, nomi univoci, fonte e note presenti", () => {
    expect(listPresets()).toEqual([...PRESET_CATALOG]);
    const ids = PRESET_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(PRESET_CATALOG.map((p) => p.name)).size).toBe(ids.length);
    for (const p of PRESET_CATALOG) {
      expect(p.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(p.source, p.id).toMatch(/ricerca-chepergola\.md/);
      expect(p.notes.length, p.id).toBeGreaterThan(0);
    }
  });

  it("i modelli commerciali di E10 sono tutti a catalogo", () => {
    expect(PRESET_CATALOG.map((p) => p.name)).toEqual(
      expect.arrayContaining([
        "Pergola libera 3×3",
        "Pergola libera 4×2",
        "Pergola libera 4×3",
        "Pergola libera 4×4",
        "Pergola libera 4×6",
        "Pergola addossata 2×3",
        "Pergola addossata 3×4",
        "Pergola addossata 4×6",
        "MAXI 4×4",
        "MAXI 5×5",
        "MAXI 5×6",
        "MAXI addossata 4×4",
        "Moderna 258×258",
        "Moderna 427×318",
        "Carport 5×3",
        "Carport 5×4",
        "Carport doppio 5×6",
        "Carport doppio MAXI 5×6",
        "Pergola camper 3×6",
        "Copertura camper 404×799",
        "Gazebo 3,1×3,1 a 4 falde 25°",
        "Gazebo 3,1×3,1 a 8 falde 15°",
        "Gazebo ottagonale Ø4000",
        "Pensilina 4000 sbalzo 1200",
        "Pergola a L 4000/4000",
        "Monofalda con grondaia",
        "Bifalda libera",
      ]),
    );
  });

  it("loadPreset: parametri completi che passano resolveParams, ingombro che passa parseEnvelope", () => {
    for (const p of PRESET_CATALOG) {
      const loaded = loadPreset(p.id);
      expect(loaded.preset).toBe(p);
      expect(loaded.typologySlug).toBe(p.typologySlug);
      const template = getTypology(p.typologySlug);
      expect(resolveParams(template, loaded.params), p.id).toEqual(loaded.params);
      expect(Object.keys(loaded.params).sort(), p.id).toEqual(template.params.map((s) => s.name).sort());
      for (const [k, v] of Object.entries(p.params)) expect(loaded.params[k], `${p.id}.${k}`).toEqual(v);
      if (p.envelope) expect(loaded.envelope, p.id).toEqual(parseEnvelope(p.envelope));
      else expect(loaded.envelope, p.id).toBeUndefined();
    }
  });

  it("Pergola libera 4×6: larghezza 4000, profondità 6000, 2 campate, bullonata", () => {
    const id = PRESET_CATALOG.find((p) => p.name === "Pergola libera 4×6")!.id;
    expect(loadPreset(id).params).toMatchObject({ larghezza: 4000, profondita: 6000, campate: 2, costruzione: "bullonata" });
  });

  it("id sconosciuto → PresetNotFoundError", () => {
    expect(() => loadPreset("nessuno")).toThrow(PresetNotFoundError);
    expect(() => loadPreset("nessuno")).toThrow(/preset non trovato/);
    expect(listPresets("slug-inesistente")).toEqual([]);
  });
});
