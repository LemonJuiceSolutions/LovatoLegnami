import { beforeAll, describe, expect, it } from "vitest";
import { measureVolume, type Solid } from "replicad";
import { generate, listTypologies } from "@/domain";
import { translation } from "@/domain/math/mat4";
import { vec3 } from "@/domain/math/vec3";
import type { Machining } from "@/domain/components/types";
import { PieceBuildError, buildPieceSolid, isValidShape, type PieceSolidInput } from "./build-piece";
import { initOcct } from "./init";
import { placeShape } from "./pose";
import { nodeOcctFactory } from "./init-node";

beforeAll(async () => {
  await initOcct({ factory: nodeOcctFactory });
});

const base = { id: "P-01", section: { b: 120, h: 120 }, length: 2400 };
const m = (spec: Record<string, unknown>): Machining => ({ id: "P-01-L01", pieceId: "P-01", ...spec }) as Machining;
const piece = (machinings: Machining[], over: Partial<PieceSolidInput> = {}): PieceSolidInput => ({
  ...base,
  machinings,
  ...over,
});

function check(solid: Solid) {
  expect(isValidShape(solid)).toBe(true);
  return { faces: solid.faces, volume: measureVolume(solid) };
}

const BOX = 120 * 120 * 2400;

describe("buildPieceSolid", () => {
  it("box 120×120×2400 senza lavorazioni → 6 facce piane, volume esatto, bounding box coerente", () => {
    const solid = buildPieceSolid(piece([]));
    const { faces, volume } = check(solid);
    expect(faces).toHaveLength(6);
    expect(faces.every((f) => f.geomType === "PLANE")).toBe(true);
    expect(volume).toBeCloseTo(BOX, 3);
    const bb = solid.boundingBox.bounds;
    expect(bb[0][0]).toBeCloseTo(0, 6);
    expect(bb[1][0]).toBeCloseTo(2400, 6);
    expect(bb[0][1]).toBeCloseTo(-60, 6);
    expect(bb[1][2]).toBeCloseTo(60, 6);
  });

  it("foro passante Ø12 → 6 piane + 1 cilindrica, volume ridotto di π·36·spessore", () => {
    const { faces, volume } = check(buildPieceSolid(piece([m({ type: "foro", face: "sinistra", at: 1200, diameter: 12, offset: 0 })])));
    expect(faces).toHaveLength(7);
    expect(faces.filter((f) => f.geomType === "PLANE")).toHaveLength(6);
    expect(faces.filter((f) => f.geomType === "CYLINDRE")).toHaveLength(1);
    expect(volume).toBeCloseTo(BOX - Math.PI * 36 * 120, 3);
  });

  it("foro cieco con offset sulla faccia superiore", () => {
    const { faces, volume } = check(
      buildPieceSolid(piece([m({ type: "foro", face: "superiore", at: 300, diameter: 14, offset: 20, depth: 50 })])),
    );
    expect(faces).toHaveLength(8); // fondo piano del foro
    expect(volume).toBeCloseTo(BOX - Math.PI * 49 * 50, 2);
  });

  it("taglio di testa a 15° → solido valido, testa piana inclinata di 15°", () => {
    const h = 120;
    const at = (h / 2) * Math.tan((15 * Math.PI) / 180);
    const solid = buildPieceSolid(piece([m({ type: "taglio-testa", face: "testa-inizio", at, angle: 15 })]));
    const { faces, volume } = check(solid);
    expect(faces).toHaveLength(6);
    // Il piano passa per lo spigolo inferiore in X = 0: rimosso un prisma triangolare.
    expect(volume).toBeCloseTo(BOX - (0.5 * (2 * at) * h) * 120, 2);
    const head = faces.find((f) => f.normalAt().x < -0.5)!;
    expect(head.geomType).toBe("PLANE");
    const n = head.normalAt();
    expect((Math.acos(-n.x) * 180) / Math.PI).toBeCloseTo(15, 6);
    expect(n.y).toBeCloseTo(0, 9);
  });

  it("taglio di testa con secondo angolo su testa-fine", () => {
    const solid = buildPieceSolid(piece([m({ type: "taglio-testa", face: "testa-fine", at: 2300, angle: 10, angle2: 20 })]));
    const { faces } = check(solid);
    expect(faces).toHaveLength(6);
    const head = faces.find((f) => f.normalAt().x > 0.5)!;
    const n = head.normalAt();
    expect(n.y / n.x).toBeCloseTo(Math.tan((20 * Math.PI) / 180), 6);
    expect(-n.z / n.x).toBeCloseTo(Math.tan((10 * Math.PI) / 180), 6);
  });

  it("mezzo legno: volume ridotto di larghezza·profondità·faccia", () => {
    const { faces, volume } = check(buildPieceSolid(piece([m({ type: "mezzo-legno", face: "superiore", at: 1000, width: 120, depth: 60 })])));
    expect(faces).toHaveLength(10);
    expect(volume).toBeCloseTo(BOX - 120 * 60 * 120, 2);
  });

  it("mezzo legno a filo della testa", () => {
    const { volume } = check(buildPieceSolid(piece([m({ type: "mezzo-legno", face: "inferiore", at: 60, width: 120, depth: 60 })])));
    expect(volume).toBeCloseTo(BOX - 120 * 60 * 120, 2);
  });

  it("tenone di testa: resta il tenone width×height×length", () => {
    const L = 60;
    const { volume } = check(
      buildPieceSolid(piece([m({ type: "tenone", face: "testa-fine", at: 2400, width: 40, height: 80, length: L })])),
    );
    expect(volume).toBeCloseTo(120 * 120 * (2400 - L) + 40 * 80 * L, 2);
  });

  it("mortasa ortogonale e ruotata: volume ridotto di width·height·depth", () => {
    for (const angle of [0, 30]) {
      const { volume } = check(
        buildPieceSolid(
          piece([m({ type: "mortasa", face: "destra", at: 800, offset: 5, width: 41, height: 81, depth: 61, angle })]),
        ),
      );
      expect(volume).toBeCloseTo(BOX - 41 * 81 * 61, 2);
    }
  });

  it("becco d'uccello: intaglio triangolare con appoggio inclinato e battuta perpendicolare", () => {
    const depth = 30;
    const angle = 15;
    const t = Math.tan((angle * Math.PI) / 180);
    const solid = buildPieceSolid(piece([m({ type: "becco-uccello", face: "inferiore", at: 1000, depth, angle })]));
    const { faces, volume } = check(solid);
    expect(faces).toHaveLength(9); // faccia inferiore divisa in due + 2 facce dell'intaglio
    const area = 0.5 * depth * (depth * t + depth / t);
    expect(volume).toBeCloseTo(BOX - area * 120, 2);
    // Faccia d'appoggio: normale esterna (verso il basso) inclinata di `angle` dalla −Z, verso −X.
    const seat = faces.find((f) => {
      const n = f.normalAt();
      return n.z < -0.5 && Math.abs(n.x) > 1e-3;
    })!;
    const n = seat.normalAt();
    expect((Math.acos(-n.z) * 180) / Math.PI).toBeCloseTo(angle, 6);
    expect(seat.center.x).toBeGreaterThan(1000);
  });

  it("lavorazione senza procedura → PieceBuildError con id pezzo e tipo", () => {
    const bad = m({ type: "fresatura", face: "superiore", at: 100 });
    expect(() => buildPieceSolid(piece([bad]))).toThrowError(PieceBuildError);
    try {
      buildPieceSolid(piece([bad]));
    } catch (e) {
      expect((e as PieceBuildError).pieceId).toBe("P-01");
      expect((e as PieceBuildError).machiningType).toBe("fresatura");
      expect((e as Error).message).toContain("P-01");
    }
  });

  it("lavorazione che divide il pezzo → errore per pezzo", () => {
    const cut = m({ type: "mezzo-legno", face: "superiore", at: 1000, width: 100, depth: 119.999 });
    // depth < h: il dominio la accetta; qui forziamo un taglio passante per verificare l'errore.
    const through = { ...cut, depth: 125 } as Machining;
    expect(() => buildPieceSolid(piece([through]))).toThrowError(/diviso in 2 parti/);
  });

  it.each(["addossata-monofalda", "autoportante-bifalda"])("tutti i pezzi della tipologia %s di default sono solidi validi", (slug) => {
    const assembly = generate(slug);
    for (const p of assembly.pieces) {
      const solid = buildPieceSolid(p);
      expect(isValidShape(solid), p.id).toBe(true);
      const v = measureVolume(solid);
      expect(v, p.id).toBeGreaterThan(0);
      expect(v, p.id).toBeLessThanOrEqual(p.section.b * p.section.h * p.length + 1e-3);
      solid.delete();
    }
  });
});

describe("utensili delle tipologie estese (E2/E6)", () => {
  it("pilastro 90 con asola 8×68×180 e 2 fori Ø13 → solido unico valido, volume ridotto di asola + fori", () => {
    const pil = (machinings: Machining[]): PieceSolidInput => ({ id: "P-01", section: { b: 90, h: 90 }, length: 2400, machinings });
    const solid = buildPieceSolid(
      pil([
        m({ id: "P-01-L01", type: "asola-lama", face: "testa-inizio", at: 0, width: 8, height: 68, depth: 180 }),
        m({ id: "P-01-L02", type: "foro", face: "sinistra", at: 60, diameter: 13, offset: 0 }),
        m({ id: "P-01-L03", type: "foro", face: "sinistra", at: 140, diameter: 13, offset: 0 }),
      ]),
    );
    expect(isValidShape(solid)).toBe(true);
    expect(solid.solids).toHaveLength(1);
    const slot = 8 * 68 * 180;
    // I fori attraversano l'asola: il tratto nella lama (8 mm) è già vuoto.
    const holes = 2 * Math.PI * 6.5 ** 2 * (90 - 8);
    const removed = 90 * 90 * 2400 - measureVolume(solid);
    expect(Math.abs(removed - (slot + holes)) / (slot + holes)).toBeLessThan(0.01);
    expect(removed).toBeCloseTo(slot + holes, 0);
    // Asola dalla testa finale con scostamento lungo Z.
    const end = buildPieceSolid(
      pil([m({ type: "asola-lama", face: "testa-fine", at: 2400, width: 8, height: 40, depth: 250, offset: 15 })]),
    );
    expect(isValidShape(end)).toBe(true);
    expect(measureVolume(end)).toBeCloseTo(90 * 90 * 2400 - 8 * 40 * 250, 1);
    expect(end.boundingBox.bounds[1][0]).toBeCloseTo(2400, 6);
    solid.delete();
    end.delete();
  });

  it("dardo di Giove: due travi complementari sovrapposte → somma dei volumi b·h·(L1 + L2 − sovrapposizione), intersezione < 1 mm³", () => {
    const section = { b: 90, h: 160 };
    const [L1, L2, overlap] = [2000, 1500, 300];
    const dardo = { length: overlap, angle: 10, step: 30 };
    const a = buildPieceSolid({
      id: "A",
      section,
      length: L1,
      machinings: [m({ id: "A-L01", pieceId: "A", type: "dardo-di-giove", face: "testa-fine", at: L1, ...dardo })],
    });
    const bLocal = buildPieceSolid({
      id: "B",
      section,
      length: L2,
      machinings: [m({ id: "B-L01", pieceId: "B", type: "dardo-di-giove", face: "testa-inizio", at: 0, ...dardo, angle: -10 })],
    });
    expect(isValidShape(a)).toBe(true);
    expect(isValidShape(bLocal)).toBe(true);
    const b = placeShape(bLocal, translation(vec3(L1 - overlap, 0, 0)));
    const sum = measureVolume(a) + measureVolume(b);
    const expected = section.b * section.h * (L1 + L2 - overlap);
    expect(Math.abs(sum - expected) / expected).toBeLessThan(0.01);
    expect(sum).toBeCloseTo(expected, 0);
    const common = a.intersect(b);
    expect(measureVolume(common)).toBeLessThan(1);
    // Facce del profilo: 6 originali + piano obliquo ×2, dente, battuta (il piano di testa sparisce).
    expect(a.faces.every((f) => f.geomType === "PLANE")).toBe(true);
    for (const s of [a, bLocal, b, common]) s.delete();
  });

  it("i nuovi tipi di pezzo dritti usano il parallelepipedo di base", () => {
    const types = new Set(["tavola", "cantonale", "monaco", "mensola", "fascia", "grigliato"]);
    const found = new Set<string>();
    const assemblies = [
      ...listTypologies().map((t) => generate(t.slug)),
      generate("gazebo-padiglione", { costruzione: "carpenteria", arcarecci: 600, grigliati: 2 }),
    ];
    for (const a of assemblies) {
      for (const p of a.pieces) {
        if (!types.has(p.type) || found.has(p.type)) continue;
        found.add(p.type);
        const solid = buildPieceSolid({ ...p, machinings: [] });
        const { faces, volume } = check(solid);
        expect(faces, p.type).toHaveLength(6);
        expect(faces.every((f) => f.geomType === "PLANE"), p.type).toBe(true);
        expect(volume, p.type).toBeCloseTo(p.section.b * p.section.h * p.length, 2);
        solid.delete();
      }
    }
    expect([...found].sort()).toEqual([...types].sort());
  });
});

