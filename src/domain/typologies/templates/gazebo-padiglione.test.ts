import { describe, expect, it } from "vitest";
import { measureAssembly } from "../../assembly/measures";
import { planeOfHeadCut } from "../../components/head-cut";
import type { Assembly, Piece, TaglioTesta } from "../../components/types";
import { applyToPoint, axisOf } from "../../math/mat4";
import { signedDistance } from "../../math/plane";
import { vec3 } from "../../math/vec3";
import { DEFAULT_LOVATO_RULES } from "../../rules/data/default-lovato";
import { evaluateRules } from "../../rules/engine";
import { generate, getTypology, listTypologies } from "../registry";
import { ParamError, isParamVisible, resolveParams } from "../template";

const SLUG = "gazebo-padiglione";
const ofType = (a: Assembly, t: Piece["type"]) => a.pieces.filter((p) => p.type === t);
const errors = (a: Assembly) => evaluateRules(a, DEFAULT_LOVATO_RULES).violations.filter((v) => v.severity === "errore");
const kinds = (a: Assembly, kind: string) => a.hardware.filter((h) => h.kind === kind);
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
const slopeOf = (p: Piece) => deg(Math.asin(axisOf(p.pose, 0).z));
const headCut = (p: Piece) => p.machinings.find((m): m is TaglioTesta => m.type === "taglio-testa" && m.face === "testa-fine");

describe("gazebo-padiglione", () => {
  it("registrata con categoria gazebo e riferimento T-H/T-I", () => {
    expect(listTypologies().find((t) => t.slug === SLUG)).toMatchObject({ category: "gazebo", reference: "T-H/T-I" });
  });

  it("4 lati 3100, 4 falde, cuspide 25°, bullonata: 4 pilastri, 4 travi, 4 cantonali, 1 cuspide, 4 giunti 916, 8 piastre", () => {
    const a = generate(SLUG, { lati: "4", larghezza: 3100, profondita: 3100, falde: "lati", punta: "cuspide", costruzione: "bullonata" });
    expect(ofType(a, "pilastro")).toHaveLength(4);
    expect(ofType(a, "trave")).toHaveLength(4);
    const cantonali = ofType(a, "cantonale");
    expect(cantonali).toHaveLength(4);
    expect(kinds(a, "cuspide").map((h) => h.code)).toEqual(["cuspide-4-25"]);
    expect(a.hardware.filter((h) => h.code === "giunto-gazebo-916")).toHaveLength(4);
    expect(kinds(a, "piastra")).toHaveLength(8);
    for (const c of cantonali) expect(slopeOf(c)).toBeCloseTo(deg(Math.atan(Math.tan(rad(25)) * Math.cos(Math.PI / 4))), 9);
    expect(a.meta).toMatchObject({ pendenza: 25, originePendenza: "ferramenta" });
    // teste a squadra (nessuna lavorazione: le piastre sono avvitate), aste a filo del giunto 916
    expect(cantonali.every((c) => c.machinings.length === 0)).toBe(true);
    expect(ofType(a, "trave").every((t) => Math.abs(t.length - (3100 - 90)) < 1e-9)).toBe(true);
    expect(a.hardware.some((h) => h.kind === "bullone")).toBe(false);
    expect(errors(a)).toEqual([]);
    // i cantonali sono appoggiati alla piastra al piede e alla cuspide in testa
    const m = measureAssembly(a);
    for (const c of cantonali) expect(m.spans.find((s) => s.pieceId === c.id)!.supports).toHaveLength(2);
  });

  it("8 lati Ø4000 in carpenteria: pianta ottagonale regolare, 8 cantonali con taglio composto in testa, 1 monaco", () => {
    const a = generate(SLUG, { lati: "8", larghezza: 4000, costruzione: "carpenteria" });
    const posts = ofType(a, "pilastro");
    expect(posts).toHaveLength(8);
    expect(ofType(a, "trave")).toHaveLength(8);
    expect(ofType(a, "monaco")).toHaveLength(1);
    const cantonali = ofType(a, "cantonale");
    expect(cantonali).toHaveLength(8);
    const monaco = ofType(a, "monaco")[0];
    const c = applyToPoint(monaco.pose, vec3(0, 0, 0));
    const dist = posts.map((p) => {
      const o = applyToPoint(p.pose, vec3(0, 0, 0));
      return Math.hypot(o.x - c.x, o.y - c.y);
    });
    for (const d of dist) expect(d).toBeCloseTo(2000, 6);
    // lati uguali
    const xy = posts.map((p) => applyToPoint(p.pose, vec3(0, 0, 0)));
    const sides = xy.map((p, i) => Math.hypot(xy[(i + 1) % 8].x - p.x, xy[(i + 1) % 8].y - p.y));
    for (const s of sides) expect(s).toBeCloseTo(sides[0], 6);
    for (const k of cantonali) {
      const cut = headCut(k)!;
      expect(Math.abs(cut.angle)).toBeGreaterThan(1);
      // faccia a 22,5° in pianta dall'asse: nel locale del cantonale inclinato angle2 = atan(tan 22,5° / cos pendenza)
      expect(Math.abs(cut.angle2 ?? 0)).toBeCloseTo(deg(Math.atan(Math.tan(rad(22.5)) / Math.cos(rad(slopeOf(k))))), 6);
      // piano di taglio = faccia verticale del monaco a metà lato del monaco
      const pl = planeOfHeadCut(k, cut);
      expect(Math.abs(pl.normal.z)).toBeLessThan(1e-9);
      expect(Math.abs(signedDistance(pl, c))).toBeCloseTo(monaco.section.b / 2, 6);
      // sede al piede (becco d'uccello) e taglio a piombo
      expect(k.machinings.some((m) => m.type === "becco-uccello")).toBe(true);
    }
    expect(a.hardware.some((h) => h.kind === "bullone" || h.kind === "giunto-vie" || h.kind === "cuspide")).toBe(false);
    expect(ofType(a, "pilastro").every((p) => p.machinings.some((m) => m.type === "tenone"))).toBe(true);
    expect(errors(a)).toEqual([]);
  });

  it("4 lati quadrato in carpenteria: monaco a 45°, teste a piombo sulle facce, mezzo legno e tenoni agli angoli", () => {
    const a = generate(SLUG, { costruzione: "carpenteria" });
    for (const k of ofType(a, "cantonale")) {
      const cut = headCut(k)!;
      expect(cut.angle2 ?? 0).toBeCloseTo(0, 9);
      expect(cut.angle).toBeCloseTo(slopeOf(k), 9);
    }
    const travi = ofType(a, "trave");
    expect(travi.every((t) => t.machinings.filter((m) => m.type === "mezzo-legno").length === 2)).toBe(true);
    expect(ofType(a, "pilastro").every((p) => p.machinings.some((m) => m.type === "tenone"))).toBe(true);
    // punta del monaco a piramide sulle falde
    expect(ofType(a, "monaco")[0].machinings.filter((m) => m.type === "taglio-testa")).toHaveLength(4);
    expect(errors(a)).toEqual([]);
  });

  it("4 lati 4000×3000 in carpenteria: 2 monaci e colmo da 1000", () => {
    const a = generate(SLUG, { lati: "4", larghezza: 4000, profondita: 3000, costruzione: "carpenteria" });
    expect(ofType(a, "monaco")).toHaveLength(2);
    const colmo = ofType(a, "colmo");
    expect(colmo).toHaveLength(1);
    expect(colmo[0].length).toBeCloseTo(1000, 9);
    for (const k of ofType(a, "cantonale")) {
      // i cantonali arrivano sulla faccia laterale del monaco con un taglio composto (45° in pianta)
      const cut = headCut(k)!;
      expect(Math.abs(cut.angle2 ?? 0)).toBeCloseTo(deg(Math.atan(1 / Math.cos(rad(slopeOf(k))))), 6);
      expect(slopeOf(k)).toBeCloseTo(deg(Math.atan(Math.tan(rad(25)) * Math.SQRT1_2)), 9);
    }
  });

  it("cuspide su base rettangolare → ParamError", () => {
    expect(() => generate(SLUG, { lati: "4", larghezza: 4000, profondita: 3000, punta: "cuspide" })).toThrow(ParamError);
    expect(() => generate(SLUG, { lati: "4", larghezza: 4000, profondita: 3000, punta: "cuspide" })).toThrow(/cuspide.*quadrata/);
  });

  it("6 e 8 lati con cuspide (bullonata): cuspide a 6/8 falde, profondità nascosta", () => {
    const six = generate(SLUG, { lati: "6", larghezza: 4000 });
    expect(kinds(six, "cuspide").map((h) => h.code)).toEqual(["cuspide-6-25"]);
    expect(ofType(six, "cantonale")).toHaveLength(6);
    const eight = generate(SLUG, { lati: "8", larghezza: 4000 });
    expect(kinds(eight, "cuspide").map((h) => h.code)).toEqual(["cuspide-8-15"]);
    expect(eight.meta.pendenza).toBe(15);
    const t = getTypology(SLUG);
    const spec = t.params.find((p) => p.name === "profondita")!;
    expect(isParamVisible(spec, resolveParams(t, { lati: "8" }))).toBe(false);
    expect(errors(six)).toEqual([]);
    expect(errors(eight)).toEqual([]);
  });

  it("8 falde su base quadrata: cantonali e puntoni intermedi a pendenza piena", () => {
    const a = generate(SLUG, { falde: "doppie" });
    expect(ofType(a, "cantonale")).toHaveLength(4);
    const puntoni = ofType(a, "puntone");
    expect(puntoni).toHaveLength(4);
    for (const p of puntoni) expect(slopeOf(p)).toBeCloseTo(15, 9);
    expect(kinds(a, "cuspide").map((h) => h.code)).toEqual(["cuspide-8-15"]);
  });

  it("montanti intermedi, arcarecci e grigliati", () => {
    const a = generate(SLUG, { costruzione: "carpenteria", montantiIntermedi: 2, arcarecci: 600, grigliati: 2 });
    expect(ofType(a, "pilastro")).toHaveLength(12);
    const arcarecci = a.pieces.filter((p) => p.label === "arcareccio");
    expect(arcarecci.length).toBeGreaterThan(0);
    for (const p of arcarecci) {
      expect(Math.abs(axisOf(p.pose, 0).z)).toBeLessThan(1e-9); // orizzontali, paralleli alla gronda
      expect(p.machinings.filter((m) => m.type === "taglio-testa")).toHaveLength(2);
    }
    expect(ofType(a, "grigliato")).toHaveLength(2 * 3);
    expect(errors(a)).toEqual([]);
  });
});
