import { describe, expect, it } from "vitest";
import type { Assembly, Piece } from "../../components/types";
import { applyToPoint, axisOf } from "../../math/mat4";
import { vec3 } from "../../math/vec3";
import { DEFAULT_LOVATO_RULES } from "../../rules/data/default-lovato";
import { evaluateRules } from "../../rules/engine";
import { generate, listTypologies } from "../registry";

const SLUG = "monofalda-scalare";
const ofType = (a: Assembly, t: Piece["type"]) => a.pieces.filter((p) => p.type === t);
const yRange = (p: Piece) => {
  const ys = [0, p.length].map((x) => applyToPoint(p.pose, vec3(x, 0, 0)).y);
  return [Math.min(...ys), Math.max(...ys)];
};
const errors = (a: Assembly) => evaluateRules(a, DEFAULT_LOVATO_RULES).violations.filter((v) => v.severity === "errore");

/** Copertura camper 404×799: 4 file, salto di 115 mm tra le file. */
const camper = (extra: Record<string, string | number | boolean> = {}) => {
  const bay = (7990 - 2 * 300) / 3;
  const pendenza = (Math.atan(115 / bay) * 180) / Math.PI;
  return generate(SLUG, { larghezza: 4040, profondita: 7990, file: 4, sbalzo: 300, pendenza, ...extra });
};

describe("monofalda-scalare", () => {
  it("registrata con categoria autoportante e riferimento T-G", () => {
    expect(listTypologies().find((t) => t.slug === SLUG)).toMatchObject({ category: "autoportante", reference: "T-G" });
  });

  it("copertura camper: 8 pilastri con 4 lunghezze a passo 115, 8 tavole, correnti in 3 tronchi per linea", () => {
    const a = camper();
    const posts = ofType(a, "pilastro");
    expect(posts).toHaveLength(8);
    const lengths = [...new Set(posts.map((p) => Math.round(p.length * 1000) / 1000))].sort((x, y) => y - x);
    expect(lengths).toHaveLength(4);
    for (let i = 1; i < 4; i++) expect(lengths[i - 1] - lengths[i]).toBeCloseTo(115, 6);
    expect(a.meta.salto).toBeCloseTo(115, 6);
    expect(ofType(a, "tavola")).toHaveLength(8);
    expect(ofType(a, "tavola").every((t) => t.length === 4040)).toBe(true);
    expect(a.hardware.filter((h) => h.kind === "bullone").every((h) => h.code === "bullone-m12x240")).toBe(true);
    expect(ofType(a, "fascia")).toHaveLength(1);
    expect(ofType(a, "controvento").every((c) => Math.abs(c.length - 800) < 1e-6)).toBe(true);
    expect(errors(a)).toEqual([]);
  });

  it("correnti spezzati sopra le file intermedie, nessun giunto sulle file d'estremità", () => {
    const a = camper();
    const correnti = ofType(a, "trave");
    expect(correnti).toHaveLength(2 * 3); // 2 linee × 3 campate
    const rowYs = [300, 300 + 2463.3333333333335, 300 + 2 * 2463.3333333333335, 7690];
    const ends = correnti.flatMap(yRange).filter((y) => y > 10 && y < 7980);
    // ogni estremità interna cade sulla trave sandwich di una fila intermedia (assi a ±105, asse del corrente spostato di (h/2)·sin α)
    for (const y of ends) expect(rowYs.slice(1, 3).some((r) => Math.abs(y - r) <= 110)).toBe(true);
    expect(new Set(ends.map((y) => rowYs.findIndex((r) => Math.abs(y - r) <= 110))).size).toBe(2);
    for (const c of correnti) expect((Math.asin(Math.abs(axisOf(c.pose, 0).z)) * 180) / Math.PI).toBeCloseTo(a.meta.pendenza as number, 6);
  });

  it("dardo di Giove: due lavorazioni complementari per giunzione", () => {
    const a = camper({ giunzione: "dardo-di-giove" });
    const joints = a.joints.filter((j) => j.type === "dardo-di-giove");
    expect(joints).toHaveLength(2 * 2);
    for (const j of joints) {
      const ms = a.pieces.flatMap((p) => p.machinings.filter((m) => m.jointId === j.id));
      expect(ms).toHaveLength(2);
      expect(ms.every((m) => m.type === "dardo-di-giove" && m.length === 300)).toBe(true);
      const [m1, m2] = ms as Extract<(typeof ms)[number], { type: "dardo-di-giove" }>[];
      expect(m1.step).toBe(m2.step);
      expect(Math.abs(m1.angle)).toBe(Math.abs(m2.angle));
    }
    expect(errors(a)).toEqual([]);
  });

  it("mezzo legno: tronchi sovrapposti a mezzo legno; carpenteria: traversi singoli, nessun bullone", () => {
    const a = camper({ giunzione: "mezzo-legno" });
    expect(a.joints.filter((j) => j.type === "mezzo-legno")).toHaveLength(4);
    const c = camper({ costruzione: "carpenteria" });
    expect(ofType(c, "tavola")).toHaveLength(0);
    expect(c.hardware.some((h) => h.kind === "bullone")).toBe(false);
    expect(errors(c)).toEqual([]);
  });
});
