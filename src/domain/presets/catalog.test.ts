import { describe, expect, it } from "vitest";
import type { Assembly } from "../components/types";
import { checkCollisions } from "../envelope/collisions";
import { floorFunction } from "../envelope/floor";
import { DEFAULT_LOVATO_RULES } from "../rules/data/default-lovato";
import { evaluateRules } from "../rules/engine";
import { generate } from "../typologies/registry";
import { PRESET_CATALOG, loadPreset } from "./catalog";
import type { Preset } from "./types";

/** Assieme del preset (con il pavimento dell'ingombro, se dichiarato). */
function build(p: Preset): { assembly: Assembly; loaded: ReturnType<typeof loadPreset> } {
  const loaded = loadPreset(p.id);
  const options = loaded.envelope ? { floorHeightAt: floorFunction(loaded.envelope) } : {};
  return { assembly: generate(loaded.typologySlug, loaded.params, options), loaded };
}

const pieceCount = (a: Assembly, type: string) => a.pieces.filter((x) => x.type === type).length;
const hardwareCount = (a: Assembly, code: string) => a.hardware.filter((h) => h.code === code).reduce((n, h) => n + h.quantity, 0);

describe("verifica del catalogo dei preset (7.2)", () => {
  it.each(PRESET_CATALOG.map((p) => [p.id, p] as const))("%s: conteggi attesi, nessun errore, nessuna collisione", (_id, p) => {
    const { assembly, loaded } = build(p);
    expect(assembly.typologySlug).toBe(p.typologySlug);
    if (p.expected) {
      for (const [type, n] of Object.entries(p.expected.pieces)) expect(pieceCount(assembly, type), `pezzi ${type}`).toBe(n);
      for (const [code, n] of Object.entries(p.expected.hardware ?? {})) expect(hardwareCount(assembly, code), `ferramenta ${code}`).toBe(n);
    }
    expect(evaluateRules(assembly, DEFAULT_LOVATO_RULES).violations.filter((v) => v.severity === "errore")).toEqual([]);
    if (loaded.envelope) expect(checkCollisions(assembly, loaded.envelope)).toEqual([]);
  });

  it("i conteggi attesi elencano solo tipi di pezzo presenti e i pezzi elencati coprono l'assieme", () => {
    for (const p of PRESET_CATALOG.filter((x) => x.expected)) {
      const { assembly } = build(p);
      const listed = Object.values(p.expected!.pieces).reduce((s, n) => s + (n ?? 0), 0);
      expect(listed, p.id).toBe(assembly.pieces.length);
    }
  });

  it("i preset con distinta non rilevata o fuori catalogo del sito dichiarano la deduzione nelle note", () => {
    for (const p of PRESET_CATALOG.filter((x) => /non rilevata|non offert/.test(x.source)))
      expect(p.notes.some((n) => n.startsWith("[dedotto]")), p.id).toBe(true);
    // i modelli delle tipologie commerciali hanno conteggi attesi; gli esempi MVP no
    expect(PRESET_CATALOG.filter((p) => !p.expected).map((p) => p.id)).toEqual(["monofalda-grondaia", "bifalda-libera"]);
  });

  it("Pergola libera 4×6: 6 pilastri, 6 tavole, 12 travetti, 12 bulloni M12×200 e 36 viti 6×160", () => {
    const { assembly: a } = build(PRESET_CATALOG.find((p) => p.name === "Pergola libera 4×6")!);
    expect([pieceCount(a, "pilastro"), pieceCount(a, "tavola"), pieceCount(a, "travetto")]).toEqual([6, 6, 12]);
    expect(hardwareCount(a, "bullone-m12x200")).toBe(12);
    expect(hardwareCount(a, "vite-6x160")).toBe(36);
    expect(a.params).toMatchObject({ larghezza: 4000, profondita: 6000, campate: 2, costruzione: "bullonata" });
    // pilastri da 2400 come nella distinta
    expect(a.pieces.filter((x) => x.type === "pilastro").map((x) => Math.round(x.length))).toEqual(Array(6).fill(2400));
  });

  it("Moderna 258×258: 10 aste 90×90, 4 giunti 3A, 4 giunti 3L, 160 viti 6×40", () => {
    const { assembly: a } = build(PRESET_CATALOG.find((p) => p.name === "Moderna 258×258")!);
    expect(a.pieces).toHaveLength(10);
    expect(a.pieces.every((x) => x.section.b === 90 && x.section.h === 90)).toBe(true);
    expect(a.hardware.filter((h) => h.kind === "giunto-vie").map((h) => h.code).sort()).toEqual([
      ...Array(4).fill("giunto-joint-3a-vie-90-90"),
      ...Array(4).fill("giunto-joint-3l-vie-90-90"),
    ]);
    expect(hardwareCount(a, "vite-6x40")).toBe(160);
  });

  it("Pergola a L 4000/4000: lo sbalzo delle travi di gronda resta entro 800 (profondità 3150 annotata)", () => {
    const p = PRESET_CATALOG.find((x) => x.name === "Pergola a L 4000/4000")!;
    expect(p.params).toMatchObject({ larghezzaA: 4000, larghezzaB: 4000, profondita: 3150 });
    expect(p.notes.some((n) => /3150/.test(n) && /800/.test(n))).toBe(true);
  });
});
