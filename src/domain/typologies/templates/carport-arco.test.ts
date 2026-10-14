import { describe, expect, it } from "vitest";
import { pieceObbs } from "../../assembly/bounds";
import { measureAssembly } from "../../assembly/measures";
import { planeOfHeadCut } from "../../components/head-cut";
import type { Assembly, Piece } from "../../components/types";
import { arcFrame } from "../../math/arc";
import { applyToPoint, multiply } from "../../math/mat4";
import { obbVertices } from "../../math/obb";
import { vec3 } from "../../math/vec3";
import { DEFAULT_LOVATO_RULES } from "../../rules/data/default-lovato";
import { evaluateRules } from "../../rules/engine";
import { generate, listTypologies } from "../registry";
import { ParamError } from "../template";
import { solveArch } from "./carport-arco";

const SLUG = "carport-arco";
const ofType = (a: Assembly, t: Piece["type"]) => a.pieces.filter((p) => p.type === t);
const errors = (a: Assembly) => evaluateRules(a, DEFAULT_LOVATO_RULES).violations.filter((v) => v.severity === "errore");
/** Spigolo della sezione di testa (s = sviluppo) a quota radiale `z` (locale della sezione). */
const headCorner = (arc: Piece, z: number) => applyToPoint(multiply(arc.pose, arcFrame(arc.curve!.radius, arc.length)), vec3(0, 0, z));
const carport5x3 = { larghezza: 3000, profondita: 5000, campate: 1, raggioArco: 2400, sbalzoFrontale: 2500 };

describe("carport-arco", () => {
  it("registrata con categoria carport e riferimento T-E", () => {
    expect(listTypologies().find((t) => t.slug === SLUG)).toMatchObject({ category: "carport", reference: "T-E" });
  });

  it("carport 5×3: 4 pilastri, 2 archi di sviluppo 3900 ± 50, 4 tavole da 5000, 8 travetti, 6 P greco", () => {
    const a = generate(SLUG, carport5x3);
    expect(ofType(a, "pilastro")).toHaveLength(4);
    const archi = ofType(a, "arco");
    expect(archi).toHaveLength(2);
    for (const arc of archi) expect(Math.abs(arc.length - 3900)).toBeLessThanOrEqual(50);
    expect(ofType(a, "tavola").map((t) => t.length)).toEqual(Array(4).fill(5000));
    expect(ofType(a, "travetto")).toHaveLength(8);
    expect(a.hardware.filter((h) => h.code === "staffa-terra-p-greco")).toHaveLength(6);
    // 2 M12 per pilastro e 2 M8 in testa a ogni arco (tavola + arco + tavola = 180 mm)
    expect(a.hardware.filter((h) => h.code === "bullone-m12x200")).toHaveLength(8);
    expect(a.hardware.filter((h) => h.code === "bullone-m8x200")).toHaveLength(4);
    expect(errors(a)).toEqual([]);
  });

  it("la testa di ogni arco sta tra le due tavole del proprio portale", () => {
    const a = generate(SLUG, carport5x3);
    const tavole = ofType(a, "tavola");
    for (const arc of ofType(a, "arco")) {
      const x = applyToPoint(arc.pose, vec3(0, 0, 0)).x;
      const pair = tavole.filter((t) => Math.abs(applyToPoint(t.pose, vec3(0, 0, 0)).x - x) < 100);
      expect(pair).toHaveLength(2);
      const tx = pair.map((t) => applyToPoint(t.pose, vec3(0, 0, 0)).x).sort((p, q) => p - q);
      const [inner0, inner1] = [tx[0] + pair[0].section.b / 2, tx[1] - pair[1].section.b / 2];
      const z0 = applyToPoint(pair[0].pose, vec3(0, 0, 0)).z;
      const [zb, zt] = [z0 - pair[0].section.h / 2, z0 + pair[0].section.h / 2];
      const last = pieceObbs(arc).at(-1)!;
      for (const v of obbVertices(last)) {
        expect(v.x).toBeGreaterThanOrEqual(inner0 - 1e-6);
        expect(v.x).toBeLessThanOrEqual(inner1 + 1e-6);
        expect(v.z).toBeLessThanOrEqual(zt + 1e-6);
      }
      expect(pieceObbs(arc)).toHaveLength(Math.ceil(arc.curve!.sweep / 15));
      // sezione di testa (esatta): a filo del fronte e interamente nella fascia delle tavole
      const corners = [-45, 45].map((z) => headCorner(arc, z));
      for (const c of corners) {
        expect(c.y).toBeCloseTo(0, 6);
        expect(c.z).toBeGreaterThan(zb);
        expect(c.z).toBeLessThan(zt);
      }
      const head = a.pieces.find((p) => p.id === arc.id)!;
      const bolts = a.hardware.filter((h) => h.kind === "bullone" && h.pieceIds.includes(head.id));
      expect(bolts).toHaveLength(2);
      expect(bolts.every((b) => b.pieceIds.length === 3 && pair.every((t) => b.pieceIds.includes(t.id)))).toBe(true);
      // la testa dell'arco appoggia le tavole: lo sbalzo frontale misurato è entro l'arco
      const m = measureAssembly(a).spans.find((s) => s.pieceId === pair[0].id)!;
      expect(m.supports.some((s) => s.pieceId === arc.id)).toBe(true);
      expect(zb).toBeLessThan(zt);
    }
  });

  it("piede dell'arco tagliato a filo del pavimento, sopra la staffa a P greco", () => {
    const a = generate(SLUG, carport5x3);
    for (const arc of ofType(a, "arco")) {
      const cut = arc.machinings.find((m) => m.type === "taglio-testa" && m.face === "testa-inizio");
      expect(cut?.type === "taglio-testa" && cut.angle2).toBeFalsy();
      const pl = planeOfHeadCut(arc, cut as Parameters<typeof planeOfHeadCut>[1]);
      expect(pl.point.z).toBeCloseTo(0, 6);
      expect(Math.abs(pl.normal.z)).toBeCloseTo(1, 9);
      // 2 fori della P greco al piede e 2 fori dei bulloni in testa
      expect(arc.machinings.filter((m) => m.type === "foro")).toHaveLength(4);
    }
  });

  it("raggio 1000 → errore con il raggio minimo", () => {
    try {
      generate(SLUG, { ...carport5x3, raggioArco: 1000 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ParamError);
      expect((e as ParamError).param).toBe("raggioArco");
      expect((e as Error).message).toMatch(/raggio minimo 1292 mm/);
    }
  });

  it("solveArch: testa orizzontale all'asse della sandwich e spigolo alto del piede sul pavimento", () => {
    const R = 2400;
    const h = 90;
    const D = 2537.5;
    const { sweep } = solveArch(R, h, D);
    const psi = (sweep * Math.PI) / 180;
    expect(R * (1 - Math.cos(psi))).toBeCloseTo(D + (h / 2) * Math.abs(Math.cos(psi)), 9);
    expect(sweep).toBeGreaterThan(90);
  });

  it("doppio 5×6: 3 archi, 16 travetti, 9 P greco; controventi solo tra i pilastri", () => {
    const a = generate(SLUG, { larghezza: 6000, profondita: 5000, campate: 2, controventi: true });
    expect(ofType(a, "arco")).toHaveLength(3);
    expect(ofType(a, "travetto")).toHaveLength(16);
    expect(a.hardware.filter((h) => h.code === "staffa-terra-p-greco")).toHaveLength(9);
    const braces = ofType(a, "controvento");
    expect(braces.length).toBeGreaterThan(0);
    for (const b of braces) {
      const ys = [0, b.length].map((x) => applyToPoint(b.pose, vec3(x, 0, 0)).y);
      expect(Math.min(...ys)).toBeGreaterThan(2500); // dietro il pilastro anteriore
    }
    expect(errors(a)).toEqual([]);
  });
});
