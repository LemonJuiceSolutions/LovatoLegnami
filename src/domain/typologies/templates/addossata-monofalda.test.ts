import { describe, expect, it } from "vitest";
import { measureAssembly } from "../../assembly/measures";
import { assemblyBounds } from "../../assembly/bounds";
import { fromJSON, toJSON } from "../../components/serialize";
import type { Assembly, Piece } from "../../components/types";
import type { BeccoUccello, TaglioTesta } from "../../components/types";
import { applyToPoint, degToRad } from "../../math/mat4";
import { vec3 } from "../../math/vec3";
import { generate, listTypologies } from "../registry";

const count = (a: Assembly, type: Piece["type"]) => a.pieces.filter((p) => p.type === type).length;
const byId = (a: Assembly, id: string) => a.pieces.find((p) => p.id === id)!;
const topZ = (p: Piece) => p.pose[11] + p.section.h / 2;

const spec = { larghezza: 6000, profondita: 3000, campate: 2, interasse: 600 };

describe("tipologia addossata-monofalda", () => {
  it("è registrata con nome, descrizione e parametri", () => {
    const t = listTypologies().find((x) => x.slug === "addossata-monofalda")!;
    expect(t.name).toBe("Addossata monofalda");
    expect(t.params.map((p) => p.name)).toEqual(
      expect.arrayContaining(["larghezza", "profondita", "altezza", "pendenza", "interasse", "sbalzo", "campate", "sezioneTrave"]),
    );
  });

  it("conteggi della spec: 6000×3000, 2 campate, interasse 600", () => {
    const a = generate("addossata-monofalda", spec);
    expect(count(a, "banchina")).toBe(1);
    expect(count(a, "trave")).toBe(1);
    expect(count(a, "pilastro")).toBe(3);
    expect(count(a, "travetto")).toBe(11);
    expect(count(a, "controvento")).toBe(6);
    expect(a.pieces).toHaveLength(22);
  });

  it("senza controventi se disattivati", () => {
    expect(count(generate("addossata-monofalda", { ...spec, controventi: false }), "controvento")).toBe(0);
  });

  it("dislivello banchina–trave = profondità·tan(pendenza); travetti = ipotenusa + sbalzo", () => {
    const a = generate("addossata-monofalda", { ...spec, pendenza: 15, sbalzo: 400 });
    const dz = topZ(byId(a, "BNC-01")) - topZ(byId(a, "TRV-01"));
    expect(dz).toBeCloseTo(3000 * Math.tan(degToRad(15)), 6);
    expect(a.meta.dislivello).toBeCloseTo(dz, 9);
    const t = byId(a, "TVT-01");
    // in pianta: profondità tra gli assi + mezze basi di trave e banchina + sbalzo
    expect(t.length * Math.cos(degToRad(15))).toBeCloseTo(3000 + 400 + (120 + 100) / 2, 6);
  });

  it("geometria coerente: pilastri a terra sotto la trave, trave e banchina a filo, gronda a y = 0, muro dietro", () => {
    const a = generate("addossata-monofalda", spec);
    const H = 2400;
    for (const p of a.pieces.filter((x) => x.type === "pilastro")) {
      expect(p.pose[11]).toBeCloseTo(0, 9); // piede a quota 0
      expect(p.length).toBeCloseTo(H, 9);
      expect(p.pose[7]).toBeCloseTo(byId(a, "TRV-01").pose[7], 9); // sotto l'asse trave
    }
    expect(byId(a, "TRV-01").pose[11] - 120).toBeCloseTo(H, 9);
    const b = assemblyBounds(a)!;
    expect(b.min.x).toBeCloseTo(0, 6);
    expect(b.max.x).toBeCloseTo(6000, 6);
    expect(b.min.y).toBeCloseTo(0, 6);
    expect(b.max.y).toBeCloseTo(a.meta.yMuro as number, 6);
    expect(b.min.z).toBeCloseTo(0, 6);
  });

  it("misure effettive coerenti con i parametri", () => {
    const a = generate("addossata-monofalda", { ...spec, sbalzo: 400, pendenza: 15 });
    const m = measureAssembly(a);
    expect(m.slope).toBeCloseTo(15, 9);
    expect(m.joistSpacing).toBeCloseTo(5920 / 10, 6);
    expect(m.clearHeight?.value).toBeCloseTo(2400, 6);
    const trave = m.spans.find((s) => s.pieceId === "TRV-01")!;
    expect(trave.supports.map((s) => s.pieceId)).toEqual(["PIL-01", "PIL-02", "PIL-03"]);
    expect(trave.span).toBeCloseTo(2340, 3);
    expect(trave.overhang).toBeCloseTo(600, 3);
    const tvt = m.spans.find((s) => s.pieceId === "TVT-06")!;
    expect(tvt.supports.map((s) => s.pieceId)).toEqual(["TRV-01", "BNC-01"]);
    expect(tvt.overhangStart).toBeCloseTo(400, 3); // sbalzo di gronda in pianta
  });

  it("lavorazioni: tagli di testa e becchi d'uccello sui travetti, fori sulla banchina", () => {
    const a = generate("addossata-monofalda", spec);
    const t = byId(a, "TVT-01");
    expect(t.machinings.map((m) => `${m.type}:${m.face}`)).toEqual([
      "taglio-testa:testa-inizio",
      "becco-uccello:inferiore",
      "becco-uccello:inferiore",
      "taglio-testa:testa-fine",
    ]);
    for (const m of t.machinings) expect((m as { angle: number }).angle).toBe(15);
    const fori = byId(a, "BNC-01").machinings;
    expect(fori.every((m) => m.type === "foro" && m.face === "destra")).toBe(true);
    expect(fori).toHaveLength(11); // (6000 − 300) / 600 → 10 passi
    for (const c of a.pieces.filter((p) => p.type === "controvento")) expect(c.machinings.map((m) => m.type)).toEqual(["taglio-testa", "taglio-testa"]);
  });

  it("becco d'uccello con vertice sullo spigolo a valle di trave e banchina, tagli a piombo", () => {
    const a = generate("addossata-monofalda", spec);
    const t = byId(a, "TVT-03");
    const trave = byId(a, "TRV-01");
    const banchina = byId(a, "BNC-01");
    const [b1, b2] = t.machinings.filter((m): m is BeccoUccello => m.type === "becco-uccello");
    const vertex = (m: BeccoUccello) => applyToPoint(t.pose, vec3(m.at, 0, -t.section.h / 2 + m.depth));
    expect(vertex(b1).y).toBeCloseTo(trave.pose[7] - trave.section.b / 2, 6);
    expect(vertex(b1).z).toBeCloseTo(topZ(trave), 6);
    expect(vertex(b2).y).toBeCloseTo(banchina.pose[7] - banchina.section.b / 2, 6);
    expect(vertex(b2).z).toBeCloseTo(topZ(banchina), 6);
    expect(b1.depth).toBeLessThanOrEqual(t.section.h / 3);
    // i piani dei tagli di testa sono verticali: il punto (at, 0, ±h/2·…) resta sulla stessa y
    for (const cut of t.machinings.filter((m): m is TaglioTesta => m.type === "taglio-testa")) {
      const r = degToRad(cut.angle);
      const p1 = applyToPoint(t.pose, vec3(cut.at, 0, 0));
      const p2 = applyToPoint(t.pose, vec3(cut.at + 50 * Math.sin(r), 0, 50 * Math.cos(r)));
      expect(p2.y).toBeCloseTo(p1.y, 6);
    }
    // il box non lavorato resta entro il muro e la gronda a piombo è a sbalzo dalla faccia trave
    const end = applyToPoint(t.pose, vec3(t.length, 0, -t.section.h / 2));
    expect(end.y).toBeCloseTo(a.meta.yMuro as number, 6);
    const eave = applyToPoint(t.pose, vec3(0, 0, -t.section.h / 2));
    expect(trave.pose[7] - trave.section.b / 2 - eave.y).toBeCloseTo(400, 6);
  });

  it("saette a 45° dal fianco del pilastro all'intradosso della trave", () => {
    const a = generate("addossata-monofalda", spec);
    const pil = byId(a, "PIL-01");
    const [s1, s2] = [byId(a, "CTV-01"), byId(a, "CTV-02")];
    for (const [ctv, side] of [[s1, -1], [s2, 1]] as const) {
      const [c0, c1] = ctv.machinings as TaglioTesta[];
      const a0 = applyToPoint(ctv.pose, vec3(c0.at, 0, 0));
      const a1 = applyToPoint(ctv.pose, vec3(c1.at, 0, 0));
      expect(a0.x).toBeCloseTo(pil.pose[3] + (side * pil.section.b) / 2, 6);
      expect(a1.z).toBeCloseTo(2400, 6);
      expect(a1.z - a0.z).toBeCloseTo(400, 6);
      expect(Math.abs(a1.x - a0.x)).toBeCloseTo(400, 6);
    }
  });

  it("id stabili al variare della larghezza a campate invariate", () => {
    const a = generate("addossata-monofalda", spec);
    const b = generate("addossata-monofalda", { ...spec, larghezza: 6400 });
    const ids = (x: Assembly, type: Piece["type"]) => x.pieces.filter((p) => p.type === type).map((p) => p.id);
    for (const type of ["banchina", "trave", "pilastro", "controvento"] as const) expect(ids(b, type)).toEqual(ids(a, type));
    expect(ids(b, "travetto").slice(0, 11)).toEqual(ids(a, "travetto"));
    expect(byId(b, "TRV-01").length).toBe(6400);
  });

  it("deterministica e serializzabile", () => {
    const a = generate("addossata-monofalda");
    expect(generate("addossata-monofalda")).toEqual(a);
    expect(fromJSON(toJSON(a))).toEqual(a);
  });
});
