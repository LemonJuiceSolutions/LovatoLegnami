import { describe, expect, it } from "vitest";
import { identity, multiply, rotationZ, translation, type Mat4 } from "@/domain/math/mat4";
import { vec3 } from "@/domain/math/vec3";
import { checkBrepTopology } from "@/geometry/neutral-brep";
import { arcBrep, boxBrep, pieceBoxBrep } from "@/geometry/neutral-brep-box";
import { boxWithOtherFace, holeBoxBrep } from "./__fixtures__/breps";
import { validateSat } from "./validate";
import { writeSat } from "./writer";

const date = new Date(2026, 9, 14, 9, 30, 0);
const box = pieceBoxBrep({ b: 120, h: 240 }, 3000);

/** Righe dei record (senza header e terminatore). */
const recordLines = (text: string) => {
  const lines = text.trimEnd().split("\n");
  return lines.slice(3, -1);
};
const countTypes = (text: string) => {
  const counts: Record<string, number> = {};
  for (const l of recordLines(text)) {
    const t = l.split(" ")[0];
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
};

describe("writeSat – facce piane", () => {
  it("parallelepipedo → conteggi esatti della spec", () => {
    const { text, written, errors } = writeSat([{ id: "TRV-01", brep: box, pose: identity() }], {
      date,
      includeName: false,
    });
    expect(errors).toEqual([]);
    expect(written).toEqual(["TRV-01"]);
    expect(countTypes(text)).toEqual({
      body: 1,
      lump: 1,
      shell: 1,
      face: 6,
      loop: 6,
      coedge: 24,
      edge: 12,
      vertex: 8,
      point: 8,
      "plane-surface": 6,
      "straight-curve": 12,
    });
  });

  it("header 7.0, terminatore e una riga per record chiusa da #", () => {
    const { text } = writeSat([{ id: "TRV-01", brep: box, pose: identity() }], { date, producer: "CAM X" });
    const lines = text.split("\n");
    expect(lines[0]).toBe("700 0 1 0");
    expect(lines[1]).toBe("@5 CAM X @11 ACIS 7.0 NT @24 Wed Oct 14 09:30:00 2026");
    expect(lines[2]).toBe("1 9.9999999999999995e-007 1e-010");
    expect(text.endsWith("End-of-ACIS-data\n")).toBe(true);
    for (const l of recordLines(text)) expect(l.endsWith(" #")).toBe(true);
  });

  it("nome del body = id del pezzo (attributo stringa collegato al body)", () => {
    const { text } = writeSat([{ id: "TRV-01", brep: box, pose: identity() }], { date });
    const recs = recordLines(text);
    expect(recs[0]).toBe("body $1 -1 $-1 $2 $-1 $-1 #");
    expect(recs[1]).toBe(
      "string_attrib-name_attrib-gen-attrib $-1 -1 $-1 $-1 $0 keep keep_kept ignore copy_keep @17 ATTRIB_XACIS_NAME @6 TRV-01 #",
    );
    expect(recs[2]).toBe("lump $-1 -1 $-1 $-1 $3 $0 #");
    expect(recs[3]).toMatch(/^shell \$-1 -1 \$-1 \$-1 \$-1 \$4 \$-1 \$2 #$/);
  });

  it("record tipici nel layout 7.0", () => {
    const { text } = writeSat([{ id: "B", brep: boxBrep(vec3(0, 0, 0), vec3(10, 20, 30)), pose: identity() }], {
      date,
      includeName: false,
    });
    const recs = recordLines(text);
    const face = recs.find((l) => l.startsWith("face "))!;
    expect(face).toMatch(/^face \$-1 -1 \$-1 \$\d+ \$\d+ \$2 \$-1 \$\d+ forward single #$/);
    expect(recs.find((l) => l.startsWith("plane-surface "))).toMatch(
      /^plane-surface \$-1 -1 \$-1 (-?[\d.]+ ){9}forward_v I I I I #$/,
    );
    expect(recs.find((l) => l.startsWith("coedge "))).toMatch(
      /^coedge \$-1 -1 \$-1 \$\d+ \$\d+ \$\d+ \$\d+ (forward|reversed) \$\d+ \$-1 #$/,
    );
    expect(recs.find((l) => l.startsWith("edge "))).toMatch(
      /^edge \$-1 -1 \$-1 \$\d+ 0 \$\d+ (10|20|30) \$\d+ \$\d+ forward @7 unknown #$/,
    );
    expect(recs.find((l) => l.startsWith("straight-curve "))).toMatch(/^straight-curve \$-1 -1 \$-1 (-?[\d.]+ ){6}I I #$/);
    expect(recs.filter((l) => l.startsWith("point ")).map((l) => l.slice("point $-1 -1 $-1 ".length, -2))).toContain("10 20 30");
  });

  it("coordinate trasformate nel sistema dell'assieme (posa applicata alla geometria)", () => {
    const pose: Mat4 = multiply(translation(vec3(1000, 500, 2400)), rotationZ(Math.PI / 2));
    const { text } = writeSat([{ id: "B", brep: boxBrep(vec3(0, 0, 0), vec3(10, 20, 30)), pose }], {
      date,
      includeName: false,
    });
    const points = recordLines(text)
      .filter((l) => l.startsWith("point "))
      .map((l) => l.slice("point $-1 -1 $-1 ".length, -2));
    // (10, 20, 30) ruotato di 90° attorno a Z → (−20, 10, 30), poi traslato
    expect(points).toContain("980 510 2430");
    expect(points).toContain("1000 500 2400");
    expect(text).not.toMatch(/\btransform\b/);
    expect(text).not.toMatch(/-0 |e-1[0-9]/);
  });

  it("più body: indici globali e numero di body nell'header", () => {
    const bodies = ["TVT-01", "TVT-02", "TVT-03"].map((id, i) => ({
      id,
      brep: box,
      pose: translation(vec3(0, i * 600, 0)),
    }));
    const { text, written } = writeSat(bodies, { date });
    expect(written).toEqual(["TVT-01", "TVT-02", "TVT-03"]);
    expect(text.split("\n")[0]).toBe("700 0 3 0");
    const recs = recordLines(text);
    const perBody = recs.length / 3;
    expect(recs[perBody]).toBe(`body $${perBody + 1} -1 $-1 $${perBody + 2} $-1 $-1 #`);
    expect(countTypes(text).body).toBe(3);
  });

  it("versione 4.0: record senza id/pattern e spigoli senza parametri", () => {
    const { text } = writeSat([{ id: "B", brep: box, pose: identity() }], { date, version: "4.0" });
    const recs = recordLines(text);
    expect(text.split("\n")[0]).toBe("400 0 1 0");
    expect(recs[0]).toBe("body $1 $2 $-1 $-1 #");
    expect(recs[1]).toMatch(/ 17 ATTRIB_XACIS_NAME 1 B #$/);
    expect(recs.find((l) => l.startsWith("edge "))).toMatch(/^edge \$-1 \$\d+ \$\d+ \$\d+ \$\d+ forward #$/);
  });

  it("posa non rigida → errore per quel pezzo, gli altri sono scritti", () => {
    const mirror: Mat4 = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const { written, errors } = writeSat(
      [
        { id: "A", brep: box, pose: mirror },
        { id: "B", brep: box, pose: identity() },
      ],
      { date },
    );
    expect(written).toEqual(["B"]);
    expect(errors).toHaveLength(1);
    expect(errors[0].pieceId).toBe("A");
    expect(errors[0].entity).toBe("posa");
  });
});

describe("writeSat – facce cilindriche e superfici non supportate", () => {
  it("la fixture del foro è una B-rep topologicamente valida", () => {
    expect(checkBrepTopology(holeBoxBrep())).toEqual([]);
  });

  it("pezzo con foro → 1 cone-surface (semiangolo 0) + 2 ellipse-curve, cucitura scartata", () => {
    const { text, errors } = writeSat([{ id: "PIL-01", brep: holeBoxBrep(), pose: identity() }], { date });
    expect(errors).toEqual([]);
    const c = countTypes(text);
    expect(c["cone-surface"]).toBe(1);
    expect(c["ellipse-curve"]).toBe(2);
    expect(c["plane-surface"]).toBe(6);
    expect(c["straight-curve"]).toBe(12);
    expect(c.face).toBe(7);
    expect(c.edge).toBe(14);
    expect(c.vertex).toBe(10);
    // 6 loop esterni + 2 interni + 2 della faccia cilindrica (uno per cerchio)
    expect(c.loop).toBe(10);
    expect(c.coedge).toBe(24 + 2 + 2);
    const recs = recordLines(text);
    expect(recs.find((l) => l.startsWith("cone-surface "))).toBe(
      "cone-surface $-1 -1 $-1 50 50 0 0 0 1 10 0 0 1 I I 0 1 10 forward I I I I #",
    );
    expect(recs.filter((l) => l.startsWith("ellipse-curve "))).toEqual([
      "ellipse-curve $-1 -1 $-1 50 50 0 0 0 1 10 0 0 1 I I #",
      "ellipse-curve $-1 -1 $-1 50 50 50 0 0 1 10 0 0 1 I I #",
    ]);
    // spigoli circolari chiusi: stesso vertice, parametri 0 e 2π
    expect(recs.filter((l) => l.startsWith("edge ") && l.includes(" 6.28318530717959 "))).toHaveLength(2);
    expect(recs.find((l) => l.startsWith("face ") && l.includes(" reversed single"))).toBeDefined();
  });

  it("faccia di tipo `altro` → errore con id e tipo, gli altri pezzi sono nel file", () => {
    const { text, written, errors } = writeSat(
      [
        { id: "TVT-01", brep: box, pose: identity() },
        { id: "TVT-02", brep: boxWithOtherFace(), pose: identity() },
        { id: "TVT-03", brep: holeBoxBrep(), pose: identity() },
      ],
      { date },
    );
    expect(written).toEqual(["TVT-01", "TVT-03"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ pieceId: "TVT-02", entity: "superficie", entityType: "GeomAbs_BSplineSurface" });
    expect(errors[0].message).toContain("TVT-02");
    expect(errors[0].message).toContain("GeomAbs_BSplineSurface");
    expect(text.split("\n")[0]).toBe("700 0 2 0");
    expect(countTypes(text).body).toBe(2);
    expect(text).toContain("@6 TVT-01");
    expect(text).toContain("@6 TVT-03");
    expect(text).not.toContain("TVT-02");
  });

  it("curva di tipo `altro` → errore di curva", () => {
    const b = holeBoxBrep();
    const edges = b.edges.map((e) =>
      e.kind === "cerchio" ? { ...e, kind: "altro" as const, curveType: "GeomAbs_BSplineCurve" } : e,
    );
    const { errors } = writeSat([{ id: "X", brep: { ...b, edges: edges as never }, pose: identity() }], { date });
    expect(errors[0]).toMatchObject({ pieceId: "X", entity: "curva", entityType: "GeomAbs_BSplineCurve" });
  });
});

describe("writeSat – pezzi curvi (arcBrep)", () => {
  const sweep = (93 * Math.PI) / 180;
  const arc = arcBrep({ b: 90, h: 90 }, 2400, sweep);

  it("un arco → 1 body con 2 cone-surface, 4 ellipse-curve, 8 straight-curve, validatore senza errori", () => {
    const pose: Mat4 = multiply(translation(vec3(500, 0, 0)), rotationZ(Math.PI / 2));
    const { text, written, errors } = writeSat([{ id: "ARC-01", brep: arc, pose }], { date });
    expect(errors).toEqual([]);
    expect(written).toEqual(["ARC-01"]);
    const c = countTypes(text);
    expect(c.body).toBe(1);
    expect(c["cone-surface"]).toBe(2);
    expect(c["plane-surface"]).toBe(4);
    expect(c["ellipse-curve"]).toBe(4);
    expect(c["straight-curve"]).toBe(8);
    expect(c.face).toBe(6);
    expect(c.edge).toBe(12);
    expect(c.vertex).toBe(8);
    const v = validateSat(text);
    expect(v.errors).toEqual([]);
    expect(v.counts.body).toBe(1);
    expect(v.bodies[0].name).toBe("ARC-01");
    // spigoli circolari parziali: parametri 0 e sweep (non 2π)
    expect(text).not.toMatch(/ 6\.28318530717959 /);
  });

  it.each(["4.0", "21.0"] as const)("versione %s: SAT dell'arco valido", (version) => {
    const { text, errors } = writeSat([{ id: "ARC-01", brep: arc, pose: identity() }], { date, version });
    expect(errors).toEqual([]);
    expect(validateSat(text).errors).toEqual([]);
  });
});
