import { describe, expect, it } from "vitest";
import { pieceObb } from "../../assembly/bounds";
import { measureAssembly } from "../../assembly/measures";
import type { Assembly, Piece } from "../../components/types";
import { DEFAULT_LOVATO_RULES } from "../../rules/data/default-lovato";
import { evaluateRules } from "../../rules/engine";
import { applyToPoint, axisOf } from "../../math/mat4";
import { obbVertices } from "../../math/obb";
import { vec3 } from "../../math/vec3";
import { generate, getTypology, listTypologies } from "../registry";
import { isParamVisible, resolveParams } from "../template";

const SLUG = "portale-sandwich";
const ofType = (a: Assembly, t: Piece["type"]) => a.pieces.filter((p) => p.type === t);
const origin = (p: Piece) => applyToPoint(p.pose, vec3(0, 0, 0));
const minZ = (p: Piece) => Math.min(...obbVertices(pieceObb(p)).map((v) => v.z));
const deg = (r: number) => (r * 180) / Math.PI;
const tan = (d: number) => Math.tan((d * Math.PI) / 180);
const base = { larghezza: 4000, profondita: 6000, campate: 2, interasse: 700 };

describe("portale-sandwich", () => {
  it("registrata con categoria autoportante e riferimento T-A/T-C/T-G", () => {
    expect(listTypologies().find((t) => t.slug === SLUG)).toMatchObject({ category: "autoportante", reference: "T-A/T-C/T-G" });
  });

  it("Pergola libera 4×6 bullonata: 6 pilastri, 6 tavole da 4000, 12 travetti da 3000, 12 bulloni", () => {
    const a = generate(SLUG, { ...base, costruzione: "bullonata" });
    expect(ofType(a, "pilastro")).toHaveLength(6);
    expect(ofType(a, "tavola").map((p) => p.length)).toEqual(Array(6).fill(4000));
    expect(ofType(a, "travetto").map((p) => Math.round(p.length))).toEqual(Array(12).fill(3000));
    expect(a.hardware.filter((h) => h.kind === "bullone").map((h) => h.code)).toEqual(Array(12).fill("bullone-m12x200"));
    expect(a.hardware.find((h) => h.code === "vite-6x160")?.quantity).toBe(36);
    expect(a.pieces).toHaveLength(24);
    expect(evaluateRules(a, DEFAULT_LOVATO_RULES).violations.filter((v) => v.severity === "errore")).toEqual([]);
    // tavola da 4000 su pilastri a 3400 in asse: sbalzi 300
    const m = measureAssembly(a).spans.find((s) => s.type === "tavola")!;
    expect(m.span).toBeCloseTo(3400, 6);
    expect(m.overhang).toBeCloseTo(300, 6);
  });

  it("carpenteria: stessa pianta e stessa quota d'intradosso, trave con tenone e nessun bullone", () => {
    const [b, c] = [generate(SLUG, base), generate(SLUG, { ...base, costruzione: "carpenteria" })];
    const plan = (a: Assembly) => ofType(a, "pilastro").map((p) => [origin(p).x, origin(p).y]);
    expect(plan(c)).toEqual(plan(b));
    expect(ofType(c, "trave").map(minZ)).toEqual(ofType(b, "tavola").filter((_, i) => i % 2 === 0).map(minZ));
    expect(c.hardware.some((h) => h.kind === "bullone")).toBe(false);
    expect(ofType(c, "pilastro").every((p) => p.machinings.some((m) => m.type === "tenone"))).toBe(true);
    expect(evaluateRules(c, DEFAULT_LOVATO_RULES).violations.filter((v) => v.severity === "errore")).toEqual([]);
  });

  it("monofalda lungo il fronte con testa inclinata 8°: pilastri coerenti con la pendenza e taglio di 8°", () => {
    const a = generate(SLUG, { ...base, forma: "monofalda", direzionePendenza: "larghezza", testaPilastro: "inclinata", pendenza: 8 });
    const posts = ofType(a, "pilastro");
    const front = posts.filter((p) => origin(p).y === origin(posts[0]).y);
    const dx = origin(front[1]).x - origin(front[0]).x;
    expect(front[1].length - front[0].length).toBeCloseTo(dx * tan(8), 6);
    for (const p of posts) {
      const cut = p.machinings.find((m) => m.type === "taglio-testa");
      expect(cut?.type === "taglio-testa" && Math.abs(cut.angle)).toBeCloseTo(8, 6);
    }
    for (const t of ofType(a, "tavola")) expect(deg(Math.asin(axisOf(t.pose, 0).z))).toBeCloseTo(8, 6);
    // travetti appoggiati sulla falda: ruotati sull'asse, faccia inferiore sul piano delle tavole
    for (const j of ofType(a, "travetto")) expect(deg(Math.acos(axisOf(j.pose, 2).z))).toBeCloseTo(8, 6);
  });

  it("monofalda in profondità 5°: tre quote d'intradosso decrescenti a passo campata·tan 5°, travetti a 5°", () => {
    const a = generate(SLUG, { ...base, forma: "monofalda", direzionePendenza: "profondita", pendenza: 5 });
    const q = [1, 2, 3].map((k) => a.meta[`intradossoPortale${k}`] as number);
    const campata = a.meta.campata as number;
    expect(q[0] - q[1]).toBeCloseTo(campata * tan(5), 6);
    expect(q[1] - q[2]).toBeCloseTo(campata * tan(5), 6);
    expect(q[2]).toBe(2400);
    const tavole = ofType(a, "tavola");
    expect(tavole.map(minZ).filter((_, i) => i % 2 === 0)).toEqual(q.map((z) => expect.closeTo(z, 6)));
    for (const j of ofType(a, "travetto")) expect(deg(Math.asin(Math.abs(axisOf(j.pose, 0).z)))).toBeCloseTo(5, 6);
    const v = evaluateRules(a, DEFAULT_LOVATO_RULES).violations;
    expect(v.filter((x) => x.severity === "errore")).toEqual([]);
  });

  it("testaPilastro visibile solo in monofalda lungo il fronte, default comunque risolto", () => {
    const t = getTypology(SLUG);
    const spec = t.params.find((p) => p.name === "testaPilastro")!;
    expect(isParamVisible(spec, resolveParams(t, {}))).toBe(false);
    expect(isParamVisible(spec, resolveParams(t, { forma: "monofalda", direzionePendenza: "larghezza" }))).toBe(true);
    expect(resolveParams(t, {}).testaPilastro).toBe("squadra");
  });

  it("MAXI 5×5: pilastri 120, tavole 45×145 → bulloni M12×240", () => {
    const a = generate(SLUG, {
      larghezza: 5000,
      profondita: 5000,
      campate: 1,
      sezionePilastro: "120×120",
      sezioneTavola: "45×145",
      sezioneTravetto: "45×145",
    });
    expect(a.hardware.filter((h) => h.kind === "bullone").map((h) => h.code)).toEqual(Array(8).fill("bullone-m12x240"));
    expect(a.hardware.find((h) => h.code === "vite-8x240")?.quantity).toBe(ofType(a, "travetto").length * 4);
  });

  it("saette opzionali: tra le tavole con bullone, solo dove c'è spazio", () => {
    const a = generate(SLUG, { ...base, controventi: true });
    expect(ofType(a, "controvento").length).toBeGreaterThan(0);
    expect(a.hardware.filter((h) => h.kind === "bullone")).toHaveLength(12 + ofType(a, "controvento").length);
  });
});
