import { describe, expect, it } from "vitest";
import { planeOfHeadCut } from "../../components/head-cut";
import type { Assembly, Piece } from "../../components/types";
import { applyToPoint, axisOf } from "../../math/mat4";
import { plane, signedDistance } from "../../math/plane";
import { vec3 } from "../../math/vec3";
import { DEFAULT_LOVATO_RULES } from "../../rules/data/default-lovato";
import { evaluateRules } from "../../rules/engine";
import { generate, getTypology, listTypologies } from "../registry";
import { ParamError, isParamVisible, resolveParams } from "../template";

const SLUG = "addossata-sandwich";
const ofType = (a: Assembly, t: Piece["type"]) => a.pieces.filter((p) => p.type === t);
const deg = (r: number) => (r * 180) / Math.PI;
/** Vertici del box non lavorato nel sistema assieme. */
const corners = (p: Piece) =>
  [0, p.length].flatMap((x) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => applyToPoint(p.pose, vec3(x, (sy * p.section.b) / 2, (sz * p.section.h) / 2)))));
const errors = (a: Assembly) => evaluateRules(a, DEFAULT_LOVATO_RULES).violations.filter((v) => v.severity === "errore");

describe("addossata-sandwich", () => {
  it("registrata con categoria addossata e riferimento T-B/T-C/T-F", () => {
    expect(listTypologies().find((t) => t.slug === SLUG)).toMatchObject({ category: "addossata", reference: "T-B/T-C/T-F" });
  });

  it("Addossata 2×3 con listoni paralleli: 2 pilastri, 4 tavole da 2000, 4 travetti da 3000, 2 STM, 6 bulloni", () => {
    const a = generate(SLUG, { larghezza: 3000, profondita: 2000, campate: 1, attaccoMuro: "listoni-paralleli", costruzione: "bullonata" });
    expect(ofType(a, "pilastro")).toHaveLength(2);
    expect(ofType(a, "tavola").map((p) => p.length)).toEqual([2000, 2000, 2000, 2000]);
    expect(ofType(a, "travetto").map((p) => p.length)).toEqual([3000, 3000, 3000, 3000]);
    const stm = a.hardware.filter((h) => h.id.startsWith("STM-"));
    expect(stm.map((h) => h.code)).toEqual(["staffa-muro-listoni-paralleli-90", "staffa-muro-listoni-paralleli-90"]);
    expect(stm.every((h) => h.pieceIds.length === 2)).toBe(true); // la lama serra entrambe le tavole
    expect(a.hardware.filter((h) => h.kind === "bullone")).toHaveLength(6);
    expect(a.hardware.find((h) => h.code === "vite-6x160")?.quantity).toBe(16);
    expect(errors(a)).toEqual([]);
  });

  it("pendenza 10°: taglio di testa di 10° lato muro, nessun vertice lavorato oltre il muro", () => {
    const a = generate(SLUG, { pendenza: 10 });
    const yMuro = a.meta.yMuro as number;
    const wall = plane(vec3(0, yMuro, 0), vec3(0, -1, 0)); // distanza positiva = lato struttura
    for (const t of ofType(a, "tavola")) {
      expect(deg(Math.asin(axisOf(t.pose, 0).z))).toBeCloseTo(10, 6);
      const cut = t.machinings.find((m) => m.type === "taglio-testa" && m.face === "testa-fine");
      expect(cut?.type === "taglio-testa" && Math.abs(cut.angle)).toBeCloseTo(10, 6);
      const cutPlane = planeOfHeadCut(t, cut as never);
      for (const v of corners(t))
        if (signedDistance(wall, v) < -1e-6) expect(signedDistance(cutPlane, v)).toBeGreaterThan(-1e-6); // oltre il muro ⇒ asportato
      expect(Math.max(...corners(t).map((v) => -signedDistance(wall, v)))).toBeGreaterThan(0);
    }
    for (const p of a.pieces.filter((x) => x.type !== "tavola")) for (const v of corners(p)) expect(signedDistance(wall, v)).toBeGreaterThan(-1e-6);
  });

  it("staffa inclinata 25°: pendenza imposta dalla ferramenta, parametro pendenza nascosto", () => {
    const a = generate(SLUG, { attaccoMuro: "staffa-inclinata-25", pendenza: 5 });
    expect(a.meta).toMatchObject({ pendenza: 25, originePendenza: "ferramenta" });
    for (const t of ofType(a, "tavola")) expect(deg(Math.asin(axisOf(t.pose, 0).z))).toBeCloseTo(25, 6);
    const spec = getTypology(SLUG).params.find((p) => p.name === "pendenza")!;
    expect(isParamVisible(spec, resolveParams(getTypology(SLUG), { attaccoMuro: "staffa-inclinata-25" }))).toBe(false);
    expect(isParamVisible(spec, resolveParams(getTypology(SLUG), {}))).toBe(true);
    expect(generate(SLUG).meta).toMatchObject({ pendenza: 5, originePendenza: "parametro" });
  });

  it("4×6 addossata: 3 pilastri, 6 tavole da 4000, 12 travetti da 3000, 3 staffe, 9 bulloni", () => {
    const a = generate(SLUG, { larghezza: 6000, profondita: 4000, campate: 2, interasse: 750 });
    expect(ofType(a, "pilastro")).toHaveLength(3);
    expect(ofType(a, "tavola").map((p) => p.length)).toEqual(Array(6).fill(4000));
    expect(ofType(a, "travetto").map((p) => p.length)).toEqual(Array(12).fill(3000));
    expect(a.hardware.filter((h) => h.kind === "staffa-muro")).toHaveLength(3);
    expect(a.hardware.filter((h) => h.kind === "bullone")).toHaveLength(9);
    expect(a.hardware.find((h) => h.code === "vite-6x160")?.quantity).toBe(36);
    expect(errors(a)).toEqual([]);
  });

  it("carpenteria su banchina: becco d'uccello delle travi sulla banchina, nessun bullone", () => {
    const a = generate(SLUG, { attaccoMuro: "banchina", costruzione: "carpenteria", pendenza: 12 });
    expect(ofType(a, "banchina")).toHaveLength(1);
    for (const t of ofType(a, "trave")) expect(t.machinings.map((m) => m.type)).toEqual(expect.arrayContaining(["becco-uccello", "taglio-testa", "mortasa"]));
    expect(a.hardware.some((h) => h.kind === "bullone")).toBe(false);
    expect(errors(a)).toEqual([]);
  });

  it("scomparsa 17° in carpenteria: asola e 2 fori in testa a ogni trave; in bullonata → errore", () => {
    const a = generate(SLUG, { attaccoMuro: "scomparsa-17", costruzione: "carpenteria" });
    expect(a.meta.pendenza).toBe(17);
    for (const t of ofType(a, "trave")) expect(t.machinings.filter((m) => m.jointId?.startsWith("STM")).map((m) => m.type)).toEqual(["asola-lama", "foro", "foro"]);
    expect(() => generate(SLUG, { attaccoMuro: "scomparsa-17" })).toThrow(ParamError);
    expect(() => generate(SLUG, { costruzione: "carpenteria" })).toThrow(/listoni paralleli.*bullonata/);
  });
});
