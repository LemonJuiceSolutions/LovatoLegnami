import { describe, expect, it } from "vitest";
import { pieceHullVertices } from "../../assembly/bounds";
import type { Assembly, TaglioTesta } from "../../components/types";
import { axisOf } from "../../math/mat4";
import { type Plane, plane, signedDistance } from "../../math/plane";
import { vec3 } from "../../math/vec3";
import { generate } from "../registry";

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Muro posteriore ruotato di `angle` gradi (si allontana verso +X) passante per (x0, y0). */
const backWall = (x0: number, y0: number, angle: number): Plane => plane(vec3(x0, y0, 0), vec3(Math.sin(rad(angle)), -Math.cos(rad(angle)), 0));

const behind = (a: Assembly, wall: Plane) => Math.min(...a.pieces.flatMap((p) => pieceHullVertices(p).map((v) => signedDistance(wall, v))));
const headFine = (p: Assembly["pieces"][number]) =>
  p.machinings.filter((m): m is TaglioTesta => m.type === "taglio-testa" && m.face === "testa-fine").at(-1)!;

describe("addossata-monofalda con il muro reale", () => {
  const base = generate("addossata-monofalda", { larghezza: 5000 });
  const yMuro = base.meta.yMuro as number;
  const wall = backWall(0, yMuro, 5);
  const a = generate("addossata-monofalda", { larghezza: 5000 }, { wallPlane: wall });

  it("senza opzione → assieme identico (fixture golden invariata)", () => {
    expect(generate("addossata-monofalda", {}, {})).toEqual(generate("addossata-monofalda"));
    // piano ortogonale al fronte: cambiano solo le teste dei travetti, tagliate sul muro invece che
    // a piombo h·sin(pendenza) prima (box non lavorato a filo muro): + h·tan(pendenza) di lunghezza
    const flat = generate("addossata-monofalda", { larghezza: 5000 }, { wallPlane: plane(vec3(0, yMuro, 0), vec3(0, -1, 0)) });
    flat.pieces.forEach((p, i) => {
      const q = base.pieces[i];
      if (p.type !== "travetto") return expect(p).toEqual(q);
      expect(p.length).toBeCloseTo(q.length + p.section.h * Math.tan(rad(15)), 6);
      expect(headFine(p).angle).toBeCloseTo(15, 9);
      expect(headFine(p).angle2).toBeUndefined();
    });
  });

  it("muro a 5° su 5000 → banchina ruotata di 5° e aderente al muro, teste entro la pianta", () => {
    const b = a.pieces.find((p) => p.type === "banchina")!;
    const X = axisOf(b.pose, 0);
    expect(deg(Math.atan2(X.y, X.x))).toBeCloseTo(5, 9);
    const hull = pieceHullVertices(b);
    const ds = hull.map((v) => signedDistance(wall, v));
    expect(Math.min(...ds)).toBeCloseTo(0, 6); // faccia posteriore sul muro
    expect(Math.max(...ds)).toBeCloseTo(b.section.b, 6);
    expect(Math.min(...hull.map((v) => v.x))).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...hull.map((v) => v.x))).toBeLessThanOrEqual(5000 + 1e-9);
  });

  it("travetti con lunghezze linearmente variabili e taglio di testa composto ≈ 5° in pianta", () => {
    const tvt = a.pieces.filter((p) => p.type === "travetto");
    const xs = tvt.map((p) => p.pose[3]);
    const ls = tvt.map((p) => p.length);
    const k = (ls.at(-1)! - ls[0]) / (xs.at(-1)! - xs[0]);
    // lunghezza lungo la falda: la profondità cresce di tan 5° per mm di larghezza
    expect(k).toBeCloseTo(Math.tan(rad(5)) / Math.cos(rad(15)), 6);
    tvt.forEach((p, i) => expect(ls[i]).toBeCloseTo(ls[0] + k * (xs[i] - xs[0]), 6));
    for (const p of tvt) {
      const cut = headFine(p);
      expect(Math.abs(cut.angle2 ?? 0)).toBeCloseTo(5, 0);
      // angle2 = atan(tan 5° / cos 15°): angolo nel sistema del travetto inclinato
      expect(Math.abs(cut.angle2!)).toBeCloseTo(deg(Math.atan(Math.tan(rad(5)) / Math.cos(rad(15)))), 9);
      expect(cut.angle).not.toBe(0);
    }
  });

  it("nessun vertice del legno lavorato oltre il piano del muro; solo i pezzi a muro cambiano", () => {
    expect(behind(a, wall)).toBeGreaterThanOrEqual(-1e-3);
    const same = (t: string) => a.pieces.filter((p) => p.type === t);
    for (const t of ["trave", "pilastro"]) expect(same(t)).toEqual(base.pieces.filter((p) => p.type === t));
  });

  it("piano dato in un'altra posizione: posato alla profondità del template nel punto più vicino", () => {
    const far = generate("addossata-monofalda", { larghezza: 5000 }, { wallPlane: backWall(2000, yMuro + 800, 5) });
    expect(far).toEqual(a);
    const negative = generate("addossata-monofalda", { larghezza: 5000 }, { wallPlane: backWall(0, 0, -5) });
    const w = backWall(5000, yMuro, -5); // si allontana verso sinistra: punto più vicino a destra
    expect(behind(negative, w)).toBeGreaterThanOrEqual(-1e-3);
    expect(() => generate("addossata-monofalda", {}, { wallPlane: plane(vec3(0, 0, 0), vec3(1, 0, 0)) })).toThrow(/non è compatibile/);
  });
});
