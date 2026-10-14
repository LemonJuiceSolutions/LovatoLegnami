import { describe, expect, it } from "vitest";
import { HARDWARE_CATALOG, findHardware, hardwareFor } from "./catalog";
import { HardwareError } from "./errors";

describe("catalogo ferramenta (2.2)", () => {
  it("staffa-terra-lama-interna-90 → asola 8×68×180 + 2 fori Ø13, sezione 90×90", () => {
    const s = findHardware("staffa-terra-lama-interna-90");
    expect(s.kind).toBe("staffa-terra");
    expect(s.forSections).toEqual([{ b: 90, h: 90 }]);
    expect(s.holes?.anchor).toBe("piede");
    const feats = s.holes!.features;
    expect(feats.filter((f) => f.kind === "asola")).toEqual([{ kind: "asola", width: 8, height: 68, depth: 180 }]);
    const holes = feats.filter((f) => f.kind === "foro");
    expect(holes).toHaveLength(2);
    expect(holes.every((f) => f.kind === "foro" && f.diameter === 13)).toBe(true);
  });

  it("codice sconosciuto → errore che cita il codice", () => {
    expect(() => findHardware("staffa-inesistente")).toThrow(HardwareError);
    expect(() => findHardware("staffa-inesistente")).toThrow(/"staffa-inesistente"/);
  });

  it("filtro staffa-terra per 120×120 → solo voci che dichiarano 120×120", () => {
    const list = hardwareFor("staffa-terra", { b: 120, h: 120 });
    expect(list.map((s) => s.code).sort()).toEqual(
      ["staffa-terra-bicchiere-120", "staffa-terra-lama-interna-120", "staffa-terra-p-greco-120", "staffa-terra-zanca-h"].sort(),
    );
    for (const s of list) expect(s.forSections!.some((f) => f.b === 120 && f.h === 120)).toBe(true);
    expect(hardwareFor("staffa-terra").length).toBeGreaterThan(list.length);
  });

  it("ogni voce ha fonte e marcatura DA VALIDARE; codici univoci; voci di E3 presenti", () => {
    for (const s of HARDWARE_CATALOG) {
      expect(s.source).toMatch(/ricerca-chepergola\.md §/);
      expect(s.validation).toBe("DA VALIDARE CON UFFICIO TECNICO");
    }
    expect(new Set(HARDWARE_CATALOG.map((s) => s.code)).size).toBe(HARDWARE_CATALOG.length);
    const required = [
      "bullone-m12x200",
      "bullone-m12x240",
      "bullone-m8x120",
      "bullone-m8x140",
      "vite-6x40",
      "vite-6x160",
      "vite-6x200",
      "vite-8x200",
      "vite-8x240",
      "vite-8x40",
      "tassello-10x85",
      "staffa-muro-listoni-paralleli-90",
      "staffa-muro-listoni-paralleli-120",
      "staffa-inclinata-15",
      "staffa-inclinata-25",
      "supporto-scomparsa-17",
      "staffa-listone-90",
      "staffa-listone-120",
      "staffa-terra-bicchiere-70",
      "staffa-terra-bicchiere-90",
      "staffa-terra-bicchiere-120",
      "staffa-terra-p-greco",
      "staffa-terra-lama-interna-90",
      "staffa-terra-lama-interna-120",
      "staffa-terra-lama-interna-160",
      "staffa-terra-lama-interna-200",
      "staffa-terra-zanca-h",
      "giunto-joint-2-vie-70-90",
      "giunto-joint-3l-vie-90-90",
      "giunto-joint-3a-vie-90-75",
      "giunto-joint-3a-vie-90-105",
      "giunto-joint-4-vie-90-105",
      "giunto-3a-vie-90",
      "giunto-5-vie-120",
      "cuspide-4-25",
      "cuspide-6-25",
      "cuspide-8-15",
      "piastra-914",
      "piastra-915",
      "giunto-gazebo-916",
      "supporto-arcarecci-170",
      "supporto-arcarecci-250",
    ];
    for (const code of required) expect(findHardware(code).code).toBe(code);
  });

  it("supporto a scomparsa 17°: asola 8×105×250, 2 fori Ø15, angolo imposto; cuspide 8 falde 15° con 8 piastre", () => {
    const s = findHardware("supporto-scomparsa-17");
    expect(s.angle).toBe(17);
    expect(s.holes!.features[0]).toEqual({ kind: "asola", width: 8, height: 105, depth: 250 });
    expect(s.holes!.features.filter((f) => f.kind === "foro" && f.diameter === 15)).toHaveLength(2);
    const c = findHardware("cuspide-8-15");
    expect(c).toMatchObject({ angle: 15, slopes: 8, accessories: [{ code: "piastra-914", count: 8 }] });
    expect(findHardware("giunto-joint-3a-vie-90-90").screws).toEqual([{ code: "vite-6x40", count: 20 }]);
    expect(findHardware("giunto-joint-4-vie-90-90").screws).toEqual([{ code: "vite-6x40", count: 24 }]);
  });
});
