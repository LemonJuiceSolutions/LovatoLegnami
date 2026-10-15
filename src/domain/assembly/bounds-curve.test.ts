import { describe, expect, it } from "vitest";
import { createPiece } from "../components/schemas";
import { checkCollisions } from "../envelope/collisions";
import { parseEnvelope } from "../envelope/types";
import { arcLength } from "../math/arc";
import { translation } from "../math/mat4";
import { type OBB, obbVertices } from "../math/obb";
import { type Vec3, dot, sub, vec3 } from "../math/vec3";
import { assemblyBounds, minClearHeight, pieceHullVertices, pieceObb, pieceObbs } from "./bounds";
import { contactRange, measureAssembly } from "./measures";

const R = 2400;
const SWEEP = 93;
const arco = createPiece({
  id: "ARC-01",
  type: "arco",
  section: { b: 90, h: 90 },
  length: arcLength(R, SWEEP),
  pose: translation(vec3(500, 45, 100)),
  curve: { radius: R, sweep: SWEEP },
});

const inObb = (o: OBB, p: Vec3, tol = 1e-6): boolean => {
  const d = sub(p, o.center);
  const h = [o.halfSize.x, o.halfSize.y, o.halfSize.z];
  return o.axes.every((a, i) => Math.abs(dot(a, d)) <= h[i] + tol);
};

/** Punto del legno dell'arco (sistema assieme) a raggio r, angolo t (rad), y locale. */
const woodPoint = (r: number, t: number, y: number): Vec3 => vec3(500 + r * Math.sin(t), 45 + y, 100 + R - r * Math.cos(t));

const env = (obstacles: unknown[] = []) => parseEnvelope({ box: { width: 4000, depth: 1000, height: 3000 }, obstacles });

describe("ingombro a segmenti dei pezzi curvi (1.3)", () => {
  it("pezzo dritto: un solo box; arco 93°: ceil(93/15) = 7 box che contengono tutto il legno", () => {
    const trave = createPiece({ id: "TRV-01", type: "trave", section: { b: 90, h: 90 }, length: 3000, pose: translation(vec3(0, 0, 0)) });
    expect(pieceObbs(trave)).toEqual([pieceObb(trave)]);
    const obbs = pieceObbs(arco);
    expect(obbs).toHaveLength(7);
    const t1 = (SWEEP * Math.PI) / 180;
    for (let i = 0; i <= 60; i++)
      for (const r of [R - 45, R, R + 45])
        for (const y of [-45, 45]) {
          const q = woodPoint(r, (t1 * i) / 60, y);
          expect(obbs.some((o) => inObb(o, q))).toBe(true);
          expect(inObb(pieceObb(arco), q)).toBe(true);
        }
  });

  it("ostacolo tra corda e arco → nessuna collisione (il box unico lo toccherebbe)", () => {
    const g = { id: "OST-01", type: "generico", side: "anteriore", offset: 1900, width: 100, elevation: 1080, height: 80, projection: 200 };
    for (const [x, z] of [[1900, 1080], [2000, 1160], [2000, 1080], [1900, 1160]]) {
      const r = Math.hypot(x - 500, z - 100 - R);
      expect(r).toBeLessThan(R - 45);
    }
    expect(checkCollisions({ pieces: [arco] }, env())).toEqual([]);
    expect(checkCollisions({ pieces: [arco] }, env([g]))).toEqual([]);
  });

  it("ostacolo che taglia il legno a metà sviluppo → collisione su ARC-01", () => {
    const g = { id: "OST-02", type: "generico", side: "anteriore", offset: 2200, width: 80, elevation: 800, height: 100, projection: 200 };
    const c = checkCollisions({ pieces: [arco] }, env([g]));
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ pieceId: "ARC-01", obstacleId: "OST-02" });
    expect(c[0].depth).toBeGreaterThan(0);
  });

  it("limiti dell'assieme e altezza libera dai box di segmento", () => {
    const box = assemblyBounds({ pieces: [arco] })!;
    // il box di corda del primo segmento è inclinato di 6,6° e scende di ~16 mm sotto il legno;
    // ritagliato dai piani radiali e tangenti delle teste del tratto il piede è esatto
    expect(Math.min(...pieceObbs(arco).flatMap(obbVertices).map((v) => v.z))).toBeLessThan(100 - 45 - 10);
    expect(box.min.z).toBeCloseTo(100 - 45, 6);
    expect(box.min.x).toBeCloseTo(500, 6);
    // estradosso a 93°: quota massima del legno = centro + (R + h/2)·sin(3°) sulla testa radiale
    const zTop = 100 + R - (R - 45) * Math.cos((SWEEP * Math.PI) / 180);
    expect(box.max.z).toBeGreaterThanOrEqual(zTop - 1e-6);
    expect(box.max.z).toBeLessThan(zTop + 50);
    expect(minClearHeight({ pieces: [arco] }, { types: ["arco"] })!.value).toBeCloseTo(box.min.z, 9);
  });

  it("un pezzo appoggiato sulla testa dell'arco trova la zona d'appoggio sui box di segmento", () => {
    const last = pieceObbs(arco)[6];
    const zTop = Math.max(...obbVertices(last).map((v) => v.z));
    const xs = obbVertices(last).map((v) => v.x);
    const tavola = createPiece({
      id: "TAV-01",
      type: "tavola",
      section: { b: 45, h: 145 },
      length: 5000,
      pose: translation(vec3(0, 45, zTop + 72.5)),
    });
    const r = contactRange(tavola, arco)!;
    expect(r).toBeDefined();
    expect(r.from).toBeGreaterThanOrEqual(Math.min(...xs) - 1);
    expect(r.to).toBeLessThanOrEqual(Math.max(...xs) + 1);
    // l'arco non ha luce (nessun appoggio dichiarato per il tipo)
    expect(measureAssembly({ pieces: [arco, tavola] }).spans.find((s) => s.pieceId === "ARC-01")).toBeUndefined();
  });

  it("vertici del legno: ogni punto del legno sta in un box ritagliato, i ritagli non escono dai box", () => {
    const hull = pieceHullVertices(arco);
    const obbs = pieceObbs(arco);
    // ogni vertice ritagliato sta nel box del suo tratto (8 + punti di taglio per box)
    for (const v of hull) expect(obbs.some((o) => inObb(o, v))).toBe(true);
    // il legno del tratto è dentro il poliedro ritagliato: verificato sulla distanza dal centro
    const C = vec3(500, 45, 100 + R);
    for (const v of hull) expect(Math.hypot(v.x - C.x, v.z - C.z)).toBeLessThanOrEqual((R + 45) / Math.cos((SWEEP / 7 / 2) * (Math.PI / 180)) + 1e-6);
    // estradosso a 90° (dentro il quinto tratto): conservativo di pochi mm tra i piani tangenti
    const xMax = Math.max(...hull.map((v) => v.x));
    expect(xMax).toBeGreaterThanOrEqual(500 + R + 45 - 1e-6);
    expect(xMax).toBeLessThan(500 + R + 45 + 10);
  });
});
