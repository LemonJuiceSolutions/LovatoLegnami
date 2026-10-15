import { describe, expect, it } from "vitest";
import { assemblyBounds } from "../../assembly/bounds";
import { contactRange, measureAssembly } from "../../assembly/measures";
import { fromJSON, toJSON } from "../../components/serialize";
import type { Assembly, Mortasa, Piece, Tenone } from "../../components/types";
import { generate, listTypologies } from "../registry";

const ofType = (a: Assembly, type: Piece["type"]) => a.pieces.filter((p) => p.type === type);
const byId = (a: Assembly, id: string) => a.pieces.find((p) => p.id === id)!;
const spec = { larghezza: 5000, profondita: 4000, campate: 2, interasse: 800 };

describe("tipologia autoportante-bifalda", () => {
  it("è registrata insieme alla monofalda", () => {
    expect(listTypologies().map((t) => t.slug).slice(0, 2)).toEqual(["addossata-monofalda", "autoportante-bifalda"]);
  });

  it("conteggi della spec: 5000×4000, 2 campate, interasse 800", () => {
    const a = generate("autoportante-bifalda", spec);
    expect(ofType(a, "trave")).toHaveLength(2);
    expect(ofType(a, "colmo")).toHaveLength(1);
    expect(ofType(a, "pilastro")).toHaveLength(6);
    expect(ofType(a, "puntone").length).toBeGreaterThanOrEqual(6);
    const g = measureAssembly(a).joistGroups;
    expect(g).toHaveLength(2);
    expect(g[0].pieceIds.length).toBe(g[1].pieceIds.length);
    expect(g[0].pieceIds.length + g[1].pieceIds.length).toBe(ofType(a, "travetto").length);
    expect(g[0].pieceIds).toHaveLength(8); // (5000 − 80) / 800 → 7 campi
    expect(ofType(a, "controvento")).toHaveLength(12);
  });

  it("simmetria delle falde a 20°: stesso numero di travetti, lunghezze e lavorazioni speculari", () => {
    const a = generate("autoportante-bifalda", { ...spec, pendenza: 20 });
    const yC = a.meta.yColmo as number;
    const tvt = ofType(a, "travetto");
    const n = tvt.length / 2;
    const [front, back] = [tvt.slice(0, n), tvt.slice(n)];
    front.forEach((f, i) => {
      const b = back[i];
      expect(b.length).toBeCloseTo(f.length, 9);
      expect(b.pose[3]).toBeCloseTo(f.pose[3], 9); // stessa x
      expect(b.pose[7] - yC).toBeCloseTo(yC - f.pose[7], 9); // y speculare rispetto al colmo
      expect(b.pose[11]).toBeCloseTo(f.pose[11], 9);
      expect(b.machinings.map(({ id: _i, pieceId: _p, ...m }) => m)).toEqual(f.machinings.map(({ id: _i, pieceId: _p, ...m }) => m));
    });
    const m = measureAssembly(a);
    expect(m.slope).toBeCloseTo(20, 9);
    const bounds = assemblyBounds(a)!;
    // gronde: tagli a piombo per lo spigolo inferiore delle teste (il box non lavorato arriva a y = 0 e 2·yColmo)
    const cut = tvt[0].section.h * Math.sin((20 * Math.PI) / 180);
    expect(bounds.min.y).toBeCloseTo(cut, 6);
    expect(bounds.max.y).toBeCloseTo(2 * yC - cut, 6);
  });

  it("puntoni innestati con tenone-mortasa in travi e colmo, lavorazioni complementari", () => {
    const a = generate("autoportante-bifalda", spec);
    expect(a.joints).toHaveLength(12);
    for (const j of a.joints) {
      expect(j.type).toBe("tenone-mortasa");
      const t = byId(a, j.pieceA).machinings.find((m) => m.jointId === j.id) as Tenone;
      const m = byId(a, j.pieceB).machinings.find((x) => x.jointId === j.id) as Mortasa;
      expect(byId(a, j.pieceA).type).toBe("puntone");
      expect(["trave", "colmo"]).toContain(byId(a, j.pieceB).type);
      expect(t.type).toBe("tenone");
      expect(m.type).toBe("mortasa");
      const gap = j.type === "tenone-mortasa" ? j.params.gap : 0;
      expect([m.width, m.height, m.depth]).toEqual([t.width + gap, t.height + gap, t.length + gap]);
      expect(m.angle).toBeCloseTo(0, 9);
    }
    for (const p of ofType(a, "puntone")) expect(p.machinings.map((m) => `${m.type}:${m.face}`).sort()).toEqual(["tenone:testa-fine", "tenone:testa-inizio"]);
    expect(byId(a, "COL-01").machinings.filter((m) => m.type === "mortasa")).toHaveLength(6);
  });

  it("puntoni sotto i travetti senza interferenze, colmo appoggiato sui puntoni", () => {
    const a = generate("autoportante-bifalda", spec);
    // nessuna intersezione tra i box di puntoni e travetti (c'è luce tra estradosso e intradosso)
    for (const p of ofType(a, "puntone")) for (const t of ofType(a, "travetto")) expect(contactRange(p, t, 1e-3)).toBeUndefined();
    const m = measureAssembly(a);
    const colmo = m.spans.find((s) => s.pieceId === "COL-01")!;
    expect(colmo.supports.map((s) => s.pieceId)).toEqual(["PNT-01", "PNT-02", "PNT-03", "PNT-04", "PNT-05", "PNT-06"]);
    const tvt = m.spans.find((s) => s.pieceId === "TVT-01")!;
    expect(tvt.supports.map((s) => s.pieceId)).toEqual(["TRV-01", "COL-01"]);
    expect(tvt.overhangStart).toBeCloseTo(400, 3);
    expect(m.clearHeight?.value).toBeCloseTo(2400, 6);
  });

  it("deterministica e serializzabile", () => {
    const a = generate("autoportante-bifalda");
    expect(generate("autoportante-bifalda")).toEqual(a);
    expect(fromJSON(toJSON(a))).toEqual(a);
  });
});
