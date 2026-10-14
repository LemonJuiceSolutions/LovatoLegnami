import { describe, expect, it } from "vitest";
import { maxHeight, pieceAabb } from "../assembly/bounds";
import { DEFAULT_LOVATO_RULES } from "../rules/data/default-lovato";
import { evaluateRules } from "../rules/engine";
import { checkCollisions } from "./collisions";
import { fitToEnvelope } from "./fit";
import { parseEnvelope } from "./types";

const SLUG = "addossata-monofalda";
const grondaia = { id: "grondaia", type: "grondaia", side: "posteriore", elevation: 2700, height: 120, projection: 150 };

describe("fitToEnvelope", () => {
  it("ingombro libero 6000×3500×3000, monofalda 15°: larghezza 6000, profondità ≤ 3500, entro 3000, nessuna collisione", () => {
    const env = parseEnvelope({ box: { width: 6000, depth: 3500, height: 3000 } });
    const r = fitToEnvelope(SLUG, env, { pendenza: 15 }, DEFAULT_LOVATO_RULES);
    if (!r.ok) throw new Error(r.message);
    expect(r.params.larghezza).toBe(6000);
    expect(r.params.pendenza).toBe(15);
    expect(r.params.profondita as number).toBeLessThanOrEqual(3500);
    expect(maxHeight(r.assembly)).toBeLessThanOrEqual(3000);
    expect(checkCollisions(r.assembly, env)).toEqual([]);
    expect(evaluateRules(r.assembly, DEFAULT_LOVATO_RULES).valid).toBe(true);
    expect(r.limits.map((l) => l.param)).toEqual(["altezza", "profondita", "larghezza"]);
    expect(r.limits[2].cause).toEqual({ kind: "ingombro", sides: ["destro"] });
    expect(r.limits[0].message).toMatch(/^altezza \d+ mm: limitata dall'ingombro \(lato soffitto\)/);
  });

  it("grondaia a 2700 sporgente 150: banchina sotto 2700 o arretrata, la grondaia è indicata come limite", () => {
    const env = parseEnvelope({ box: { width: 6000, depth: 3500, height: 3000 }, obstacles: [grondaia] });
    const r = fitToEnvelope(SLUG, env, { pendenza: 10 }, DEFAULT_LOVATO_RULES);
    if (!r.ok) throw new Error(r.message);
    expect(checkCollisions(r.assembly, env)).toEqual([]);
    const b = pieceAabb(r.assembly.pieces.find((p) => p.type === "banchina")!);
    expect(b.max.z <= 2700 || b.max.y <= 3500 - 150).toBe(true);
    const byGrondaia = r.limits.filter((l) => l.cause.kind === "ostacolo" && l.cause.obstacleIds.includes("grondaia"));
    expect(byGrondaia.length).toBeGreaterThan(0);
    expect(byGrondaia[0].message).toMatch(/limitata dall'ostacolo grondaia/);
  });

  it("ingombro troppo basso per l'altezza libera minima → nessuna soluzione con la regola bloccante", () => {
    const env = parseEnvelope({ box: { width: 6000, depth: 3500, height: 2700 } });
    const r = fitToEnvelope(SLUG, env, { pendenza: 15 }, DEFAULT_LOVATO_RULES);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("nessuna soluzione");
    expect(r.violations.map((v) => v.ruleId)).toContain("altezza-libera-min");
    expect(r.message).toMatch(/^nessuna soluzione: .*regola bloccante altezza-libera-min/);
  });

  it("dimensioni bloccate dall'utente non cambiano; il passo è rispettato", () => {
    const env = parseEnvelope({ box: { width: 6000, depth: 3500, height: 3200 } });
    const r = fitToEnvelope(SLUG, env, { pendenza: 10, larghezza: 4000 }, DEFAULT_LOVATO_RULES, 100);
    if (!r.ok) throw new Error(r.message);
    expect(r.params.larghezza).toBe(4000);
    expect(r.limits.find((l) => l.param === "larghezza")!.cause).toEqual({ kind: "bloccato" });
    expect(((r.params.altezza as number) - 1800) % 100).toBe(0);
    expect(((r.params.profondita as number) - 1500) % 100).toBe(0);
  });

  it("bifalda in ingombro ampio: profondità limitata dal lato posteriore, nessuna collisione", () => {
    const env = parseEnvelope({ box: { width: 6000, depth: 5000, height: 3500 } });
    const r = fitToEnvelope("autoportante-bifalda", env, {}, DEFAULT_LOVATO_RULES);
    if (!r.ok) throw new Error(r.message);
    expect(checkCollisions(r.assembly, env)).toEqual([]);
    expect(r.limits.find((l) => l.param === "profondita")!.cause).toEqual({ kind: "ingombro", sides: ["posteriore"] });
  });
});
