import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { generate } from "@/domain";
import { multiply, rotationZ, translation } from "@/domain/math/mat4";
import { vec3 } from "@/domain/math/vec3";
import { pieceBoxBrep } from "@/geometry/neutral-brep-box";
import type { PieceResult } from "@/geometry/protocol";
import { boxWithOtherFace, holeBoxBrep } from "./__fixtures__/breps";
import { DEFAULT_SAT_OPTIONS, exportSat, satFileName, validateSat, type SatPieceRef } from ".";

const date = new Date(2026, 9, 14, 9, 30, 0);
const pieces: SatPieceRef[] = Array.from({ length: 20 }, (_, i) => ({
  id: `TVT-${String(i + 1).padStart(2, "0")}`,
  pose: multiply(translation(vec3(i * 600, 0, 2400)), rotationZ(Math.PI / 2)),
}));
const result = (id: string, brep = pieceBoxBrep({ b: 80, h: 160 }, 3500)): PieceResult => ({
  pieceId: id,
  cacheKey: "k",
  pose: pieces[0].pose,
  brep,
});
const results = pieces.map((p) => result(p.id));

describe("exportSat", () => {
  it("default: 7.0, assieme unico, mm, nome body", () => {
    expect(DEFAULT_SAT_OPTIONS).toEqual({
      version: "7.0",
      fileMode: "assieme-unico",
      units: "mm",
      includeName: true,
      producer: "Lovato Legnami - Configuratore pergole",
      nameAttribute: "ATTRIB_XACIS_NAME",
    });
  });

  it("assieme unico: 20 pezzi → 1 file con 20 body nominati", () => {
    const out = exportSat(pieces, results, { date, producer: "Biesse bSolid" });
    expect(out.extension).toBe("sat");
    expect(typeof out.data).toBe("string");
    expect(out.files).toHaveLength(1);
    expect(out.errors).toEqual([]);
    const v = validateSat(out.data as string);
    expect(v.errors).toEqual([]);
    expect(v.counts.body).toBe(20);
    expect(v.bodies.map((b) => b.name)).toEqual(pieces.map((p) => p.id));
    expect(v.header?.producer).toBe("Biesse bSolid");
  });

  it("un file per pezzo: ZIP con 20 voci <id>.sat, ciascuna con 1 body", () => {
    const out = exportSat(pieces, results, { date, fileMode: "un-file-per-pezzo" });
    expect(out.extension).toBe("zip");
    expect(out.mimeType).toBe("application/zip");
    const entries = unzipSync(out.data as Uint8Array);
    expect(Object.keys(entries).sort()).toEqual(pieces.map((p) => `${p.id}.sat`));
    for (const p of pieces) {
      const v = validateSat(strFromU8(entries[`${p.id}.sat`]));
      expect(v.errors).toEqual([]);
      expect(v.counts.body).toBe(1);
      expect(v.bodies[0].name).toBe(p.id);
    }
    expect(out.written).toHaveLength(20);
  });

  it("pezzi senza solido o con superficie non supportata → errori, gli altri esportati", () => {
    const rs = [
      result("TVT-01", holeBoxBrep()),
      { pieceId: "TVT-02", cacheKey: "k", pose: pieces[1].pose, error: { message: "taglio fallito" } },
      result("TVT-04", boxWithOtherFace()),
      ...results.slice(4),
    ];
    for (const fileMode of ["assieme-unico", "un-file-per-pezzo"] as const) {
      const out = exportSat(pieces, rs, { date, fileMode });
      expect(out.errors.map((e) => [e.pieceId, e.entity])).toEqual([
        ["TVT-02", "solido"],
        ["TVT-03", "solido"],
        ["TVT-04", "superficie"],
      ]);
      expect(out.errors[0].message).toContain("taglio fallito");
      expect(out.written).toHaveLength(17);
      expect(out.written[0]).toBe("TVT-01");
    }
  });

  it("versione 21.0 dichiarata nell'header", () => {
    const out = exportSat(pieces.slice(0, 1), results, { date, version: "21.0" });
    expect((out.data as string).split("\n")[0]).toBe("21000 0 1 0");
    expect(validateSat(out.data as string).ok).toBe(true);
  });

  it("opzioni non valide → errore zod", () => {
    expect(() => exportSat(pieces, results, { version: "9.0" as never })).toThrow();
  });

  it("assieme generato dal dominio (box puri TS): file valido con un body per pezzo", () => {
    const assembly = generate("addossata-monofalda");
    const rs = assembly.pieces.map((p) => result(p.id, pieceBoxBrep(p.section, p.length)));
    const out = exportSat(assembly.pieces, rs, { date });
    const v = validateSat(out.data as string);
    expect(v.errors).toEqual([]);
    expect(v.bodies.map((b) => b.name)).toEqual(assembly.pieces.map((p) => p.id));
  });

  it("nomi file sicuri", () => {
    expect(satFileName("PIL-01")).toBe("PIL-01.sat");
    expect(satFileName("a/b c")).toBe("a_b_c.sat");
  });
});
