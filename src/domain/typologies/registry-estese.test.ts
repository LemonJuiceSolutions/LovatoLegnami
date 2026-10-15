import { describe, expect, it } from "vitest";
import { assemblyBounds } from "../assembly/bounds";
import type { Assembly } from "../components/types";
import { checkCollisions } from "../envelope/collisions";
import { parseEnvelope } from "../envelope/types";
import { multiply, translation } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { DEFAULT_LOVATO_RULES } from "../rules/data/default-lovato";
import { evaluateRules } from "../rules/engine";
import { createRegistry, generate } from "./registry";
import { TYPOLOGY_CATEGORIES } from "./template";
import { BUILTIN_TEMPLATES } from "./templates";

/** Margine dell'ingombro "generoso" attorno all'assieme (mm). */
const MARGIN = 500;

/**
 * Ingombro generoso: box che contiene l'assieme con `MARGIN` su ogni lato,
 * pavimento compreso (l'assieme è traslato nel box: i box dei pezzi ignorano le
 * lavorazioni, quindi le teste tagliate a filo muro sporgono un poco oltre il
 * muro, e i box dei segmenti d'arco scendono di qualche mm sotto il piede).
 */
function insideGenerousEnvelope(a: Assembly) {
  const b = assemblyBounds(a)!;
  const shift = translation(vec3(MARGIN - b.min.x, MARGIN - b.min.y, MARGIN - Math.min(0, b.min.z)));
  const moved: Assembly = { ...a, pieces: a.pieces.map((p) => ({ ...p, pose: multiply(shift, p.pose) })) };
  const envelope = parseEnvelope({
    box: { width: b.max.x - b.min.x + 2 * MARGIN, depth: b.max.y - b.min.y + 2 * MARGIN, height: b.max.z - Math.min(0, b.min.z) + 2 * MARGIN },
  });
  return checkCollisions(moved, envelope);
}

describe("registro completo delle tipologie (6.4)", () => {
  it("10 tipologie, ognuna con categoria ammessa, tag e riferimento alla ricerca", () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(10);
    expect(BUILTIN_TEMPLATES.map((t) => t.slug)).toEqual([
      "addossata-monofalda",
      "autoportante-bifalda",
      "portale-sandwich",
      "addossata-sandwich",
      "monofalda-scalare",
      "telaio-giunti",
      "carport-arco",
      "gazebo-padiglione",
      "pensilina-sbalzo",
      "a-elle",
    ]);
    for (const t of BUILTIN_TEMPLATES) {
      expect(TYPOLOGY_CATEGORIES, t.slug).toContain(t.category);
      expect(t.tags.length, t.slug).toBeGreaterThan(0);
      expect(t.reference, t.slug).toMatch(/\S/);
    }
    const categories = new Set(BUILTIN_TEMPLATES.map((t) => t.category));
    expect([...categories].sort()).toEqual([...TYPOLOGY_CATEGORIES].sort());
  });

  it("la validazione del registro completo dura meno di 200 ms", () => {
    createRegistry(BUILTIN_TEMPLATES); // riscaldamento (JIT)
    const t0 = performance.now();
    createRegistry(BUILTIN_TEMPLATES);
    expect(performance.now() - t0).toBeLessThan(200);
  });

  for (const t of BUILTIN_TEMPLATES)
    it(`${t.slug} con i default: nessuna violazione "errore" e nessuna collisione in un ingombro generoso`, () => {
      const a = generate(t.slug);
      expect(evaluateRules(a, DEFAULT_LOVATO_RULES).violations.filter((v) => v.severity === "errore")).toEqual([]);
      expect(insideGenerousEnvelope(a)).toEqual([]);
    });

  it("le nuove tipologie stanno nel quadrante positivo (origine all'angolo anteriore sinistro)", () => {
    for (const [slug, params] of [
      ["telaio-giunti", {}],
      ["carport-arco", {}],
      ["gazebo-padiglione", {}],
      ["gazebo-padiglione", { costruzione: "carpenteria" }],
      ["gazebo-padiglione", { lati: "6", larghezza: 4000 }],
      ["gazebo-padiglione", { lati: "8", larghezza: 4000, costruzione: "carpenteria" }],
      ["pensilina-sbalzo", {}],
    ] as const) {
      // pezzi dritti (i box di corda dei segmenti d'arco sporgono ~h·sin(Δ/2) oltre le teste radiali)
      const a = generate(slug, params);
      const b = assemblyBounds({ pieces: a.pieces.filter((p) => !p.curve) })!;
      expect(b.min.x, `${slug} ${JSON.stringify(params)}`).toBeGreaterThanOrEqual(-1e-6);
      expect(b.min.y, `${slug} ${JSON.stringify(params)}`).toBeGreaterThanOrEqual(-1e-6);
    }
  });
});
