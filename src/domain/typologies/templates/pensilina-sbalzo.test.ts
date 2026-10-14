import { describe, expect, it } from "vitest";
import { maxHeight, pieceObb } from "../../assembly/bounds";
import { planeOfHeadCut } from "../../components/head-cut";
import type { Assembly, Piece, TaglioTesta } from "../../components/types";
import { checkCollisions } from "../../envelope/collisions";
import { fitToEnvelope } from "../../envelope/fit";
import { parseEnvelope } from "../../envelope/types";
import { axisOf } from "../../math/mat4";
import { obbVertices } from "../../math/obb";
import { signedDistance } from "../../math/plane";
import { DEFAULT_LOVATO_RULES } from "../../rules/data/default-lovato";
import { evaluateRules } from "../../rules/engine";
import { generate, listTypologies } from "../registry";

const SLUG = "pensilina-sbalzo";
const ofType = (a: Assembly, t: Piece["type"]) => a.pieces.filter((p) => p.type === t);
const errors = (a: Assembly) => evaluateRules(a, DEFAULT_LOVATO_RULES).violations.filter((v) => v.severity === "errore");
const slopeOf = (p: Piece) => (Math.asin(Math.abs(axisOf(p.pose, 0).z)) * 180) / Math.PI;
const tiltOf = (p: Piece) => (Math.acos(axisOf(p.pose, 2).z) * 180) / Math.PI;
const base = { larghezza: 4000, sbalzo: 1200, numeroMensole: 3, attacco: "scomparsa-17" };

describe("pensilina-sbalzo", () => {
  it("registrata con categoria pensilina e riferimento T-J", () => {
    expect(listTypologies().find((t) => t.slug === SLUG)).toMatchObject({ category: "pensilina", reference: "T-J" });
  });

  it("4000, sbalzo 1200, 3 mensole a scomparsa 17°: asola + 2 fori per mensola, travetti a 17°, 1 fascia, nessun pilastro", () => {
    const a = generate(SLUG, base);
    const mensole = ofType(a, "mensola");
    expect(mensole).toHaveLength(3);
    for (const m of mensole) {
      expect(m.machinings.filter((x) => x.type === "asola-lama")).toHaveLength(1);
      expect(m.machinings.filter((x) => x.type === "foro")).toHaveLength(2);
      expect(slopeOf(m)).toBeCloseTo(17, 9);
    }
    const travetti = ofType(a, "travetto");
    expect(travetti.length).toBeGreaterThan(0);
    for (const t of travetti) expect(tiltOf(t)).toBeCloseTo(17, 9); // ruotati sulla falda
    expect(ofType(a, "fascia")).toHaveLength(1);
    expect(ofType(a, "pilastro")).toHaveLength(0);
    expect(a.hardware.filter((h) => h.code === "supporto-scomparsa-17")).toHaveLength(3);
    expect(a.meta).toMatchObject({ pendenza: 17, originePendenza: "ferramenta" });
    expect(errors(a)).toEqual([]);
  });

  it("testa a muro tagliata sul piano del muro: nessuna parte lavorata oltre il muro", () => {
    const a = generate(SLUG, base);
    for (const m of ofType(a, "mensola")) {
      const cut = m.machinings.find((x): x is TaglioTesta => x.type === "taglio-testa" && x.face === "testa-fine")!;
      const pl = planeOfHeadCut(m, cut);
      expect(pl.point.y).toBeCloseTo(1200, 6);
      expect(Math.abs(pl.normal.y)).toBeCloseTo(1, 9);
      // il box grezzo supera il muro solo con il cuneo inferiore asportato dal taglio
      const beyond = obbVertices(pieceObb(m)).filter((v) => v.y > 1200 + 1e-6);
      expect(beyond.every((v) => signedDistance(pl, v) > 0)).toBe(true);
    }
  });

  it("staffa inclinata 25° → travetti a 25°, pendenza dalla ferramenta; scarpa con pendenza libera", () => {
    const a = generate(SLUG, { ...base, attacco: "staffa-inclinata-25" });
    for (const t of ofType(a, "travetto")) expect(tiltOf(t)).toBeCloseTo(25, 9);
    expect(a.meta).toMatchObject({ pendenza: 25, originePendenza: "ferramenta" });
    const s = generate(SLUG, { ...base, attacco: "scarpa", pendenza: 8, sezioneMensola: "100×140" });
    expect(s.hardware.filter((h) => h.code === "scarpa-ancoraggio-100x140")).toHaveLength(3);
    expect(s.meta).toMatchObject({ pendenza: 8, originePendenza: "parametro" });
    expect(() => generate(SLUG, { ...base, attacco: "scarpa" })).toThrow(/scarpa d'ancoraggio/);
  });

  it("saette opzionali: una per mensola con staffa per listone al piede", () => {
    const a = generate(SLUG, { ...base, saette: true });
    expect(ofType(a, "controvento")).toHaveLength(3);
    expect(a.hardware.filter((h) => h.code === "staffa-listone-90")).toHaveLength(3);
    expect(errors(a)).toEqual([]);
  });

  it("fitToEnvelope su 4500×1500×3000 trova una soluzione agendo su altezza e sbalzo", () => {
    const env = parseEnvelope({ box: { width: 4500, depth: 1500, height: 3000 } });
    const r = fitToEnvelope(SLUG, env, { numeroMensole: 3 }, DEFAULT_LOVATO_RULES);
    if (!r.ok) throw new Error(r.message);
    expect(r.limits.map((l) => l.param)).toEqual(["altezza", "profondita", "larghezza"]);
    expect(r.params.sbalzo as number).toBeLessThanOrEqual(1500);
    expect(r.params.sbalzo as number).toBeGreaterThan(1200);
    expect(maxHeight(r.assembly)).toBeLessThanOrEqual(3000);
    expect(checkCollisions(r.assembly, env)).toEqual([]);
    expect(errors(r.assembly)).toEqual([]);
    expect(ofType(r.assembly, "pilastro")).toHaveLength(0);
  });
});
