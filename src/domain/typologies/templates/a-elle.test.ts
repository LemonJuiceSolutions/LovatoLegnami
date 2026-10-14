import { describe, expect, it } from "vitest";
import { pieceObb } from "../../assembly/bounds";
import { planeOfHeadCut } from "../../components/head-cut";
import type { Assembly, Piece, TaglioTesta } from "../../components/types";
import { applyToPoint, axisOf } from "../../math/mat4";
import { obbVertices } from "../../math/obb";
import { plane, signedDistance } from "../../math/plane";
import { normalize, vec3 } from "../../math/vec3";
import { DEFAULT_LOVATO_RULES } from "../../rules/data/default-lovato";
import { evaluateRules } from "../../rules/engine";
import { generate, listTypologies } from "../registry";

const SLUG = "a-elle";
const ofType = (a: Assembly, t: Piece["type"]) => a.pieces.filter((p) => p.type === t);
const errors = (a: Assembly) => evaluateRules(a, DEFAULT_LOVATO_RULES).violations.filter((v) => v.severity === "errore");
const deg = (r: number) => (r * 180) / Math.PI;
const slopeOf = (p: Piece) => deg(Math.asin(Math.abs(axisOf(p.pose, 0).z)));
const ali = { larghezzaA: 4000, larghezzaB: 4000, profondita: 3000 };

/** Vertici del box del pezzo non asportati dai tagli di testa (piani per il lato del materiale rimosso). */
const keptVertices = (p: Piece) => {
  const cuts = p.machinings.filter((m): m is TaglioTesta => m.type === "taglio-testa").map((m) => planeOfHeadCut(p, m));
  return obbVertices(pieceObb(p)).filter((v) => cuts.every((c) => signedDistance(c, v) <= 1e-6));
};

describe("a-elle", () => {
  it("registrata con categoria addossata e riferimento §3 estensioni", () => {
    expect(listTypologies().find((t) => t.slug === SLUG)).toMatchObject({ category: "addossata", reference: "§3 estensioni" });
  });

  it("ali 4000/4000, profondità 3000: un solo pilastro nell'angolo esterno, compluvio a 45° in pianta", () => {
    const a = generate(SLUG, ali);
    const posts = ofType(a, "pilastro");
    expect(posts).toHaveLength(1);
    const o = applyToPoint(posts[0].pose, vec3(0, 0, 0));
    expect([o.x, o.y]).toEqual([3000, 4000 - 3000]);
    const valley = ofType(a, "cantonale");
    expect(valley).toHaveLength(1);
    const X = axisOf(valley[0].pose, 0);
    expect(deg(Math.atan2(Math.abs(X.y), Math.abs(X.x)))).toBeCloseTo(45, 9);
    // il compluvio sale verso l'angolo dei muri con pendenza atan(tan α / √2)
    expect(slopeOf(valley[0])).toBeCloseTo(deg(Math.atan(Math.tan((15 * Math.PI) / 180) / Math.SQRT2)), 9);
    expect(ofType(a, "trave")).toHaveLength(2);
    expect(ofType(a, "banchina")).toHaveLength(2);
  });

  it("nessun vertice di travetto oltre il piano della diagonale; stessa pendenza nelle due ali", () => {
    const a = generate(SLUG, ali);
    // piano verticale della diagonale dall'angolo dei muri (0, 4000) all'angolo delle gronde, normale verso l'ala A
    const diag = plane(vec3(0, 4000, 0), normalize(vec3(1, 1, 0)));
    const travetti = ofType(a, "travetto");
    const wingA = travetti.filter((t) => Math.abs(axisOf(t.pose, 0).x) < 1e-9);
    const wingB = travetti.filter((t) => Math.abs(axisOf(t.pose, 0).y) < 1e-9);
    expect(wingA.length + wingB.length).toBe(travetti.length);
    expect(wingA.length).toBeGreaterThan(0);
    expect(wingB.length).toBe(wingA.length);
    for (const t of wingA) for (const v of keptVertices(t)) expect(signedDistance(diag, v)).toBeGreaterThanOrEqual(-1e-3);
    for (const t of wingB) for (const v of keptVertices(t)) expect(signedDistance(diag, v)).toBeLessThanOrEqual(1e-3);
    const slopes = travetti.map(slopeOf);
    for (const s of slopes) expect(s).toBeCloseTo(15, 9);
    // i travetti che incontrano il compluvio hanno un taglio composto (a piombo e 45° in pianta)
    const jacks = travetti.filter((t) => t.machinings.some((m) => m.type === "taglio-testa" && m.face === "testa-inizio" && Math.abs(m.angle2 ?? 0) > 1));
    expect(jacks.length).toBeGreaterThan(0);
  });

  it("carpenteria di default: becchi d'uccello su banchine e travi, tenone del pilastro; nessun errore con i default", () => {
    const a = generate(SLUG);
    expect(a.params.costruzione).toBe("carpenteria");
    expect(ofType(a, "pilastro")[0].machinings.some((m) => m.type === "tenone")).toBe(true);
    for (const t of ofType(a, "travetto")) expect(t.machinings.some((m) => m.type === "becco-uccello")).toBe(true);
    expect(a.hardware.some((h) => h.kind === "bullone")).toBe(false);
    expect(errors(a)).toEqual([]);
  });

  it("bullonata: staffe inclinate a muro con pendenza imposta, nessuna banchina", () => {
    const a = generate(SLUG, { costruzione: "bullonata", attaccoMuro: "staffa-inclinata-25" });
    expect(ofType(a, "banchina")).toHaveLength(0);
    for (const t of ofType(a, "travetto")) expect(slopeOf(t)).toBeCloseTo(25, 9);
    expect(a.meta).toMatchObject({ pendenza: 25, originePendenza: "ferramenta" });
    expect(a.hardware.filter((h) => h.code === "staffa-inclinata-25").length).toBe(ofType(a, "travetto").length + 1);
  });
});
