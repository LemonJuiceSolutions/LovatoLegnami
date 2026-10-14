import { describe, expect, it } from "vitest";
import { identity, multiply, rotationX, rotationZ, translation } from "@/domain/math/mat4";
import { vec3 } from "@/domain/math/vec3";
import { pieceBoxBrep } from "@/geometry/neutral-brep-box";
import { holeBoxBrep } from "./__fixtures__/breps";
import { scanSat, validateSat } from "./validate";
import { writeSat, type SatBodyInput } from "./writer";

const date = new Date(2026, 9, 14, 9, 30, 0);
const pose = multiply(translation(vec3(500, 1200, 2400)), multiply(rotationZ(0.3), rotationX(0.2)));
const bodies: SatBodyInput[] = [
  { id: "TRV-01", brep: pieceBoxBrep({ b: 120, h: 240 }, 3000), pose: identity() },
  { id: "PIL-01", brep: holeBoxBrep(), pose },
];
const good = writeSat(bodies, { date }).text;

/** Sostituisce il campo `field` (0 = tipo) del record `n` (0-based) nel testo. */
function corrupt(text: string, n: number, field: number, value: string): string {
  const lines = text.split("\n");
  const tokens = lines[3 + n].split(" ");
  tokens[field] = value;
  lines[3 + n] = tokens.join(" ");
  return lines.join("\n");
}
const recordIndex = (text: string, type: string) => text.split("\n").slice(3).findIndex((l) => l.startsWith(`${type} `));

describe("validateSat", () => {
  it("passa sui file del writer (7.0) con conteggi e nomi dei body", () => {
    const v = validateSat(good);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.version).toBe("7.0");
    expect(v.header?.bodyCount).toBe(2);
    expect(v.header?.producer).toBe("Lovato Legnami - Configuratore pergole");
    expect(v.counts).toMatchObject({ body: 2, lump: 2, shell: 2, face: 13, "cone-surface": 1, "ellipse-curve": 2 });
    expect(v.bodies.map((b) => b.name)).toEqual(["TRV-01", "PIL-01"]);
  });

  it("passa sui file 4.0 e 21.0 (layout delle rispettive versioni)", () => {
    for (const version of ["4.0", "21.0"] as const) {
      const v = validateSat(writeSat(bodies, { date, version }).text);
      expect(v.errors).toEqual([]);
      expect(v.version).toBe(version);
    }
  });

  it("passa senza attributo nome (body senza nome)", () => {
    const v = validateSat(writeSat(bodies, { date, includeName: false }).text);
    expect(v.ok).toBe(true);
    expect(v.bodies.map((b) => b.name)).toEqual([undefined, undefined]);
  });

  it("fallisce con un riferimento a un indice inesistente", () => {
    const v = validateSat(corrupt(good, 0, 4, "$9999"));
    expect(v.ok).toBe(false);
    expect(v.errors.join("\n")).toMatch(/\$9999 non esiste/);
  });

  it("fallisce con un riferimento di tipo incompatibile", () => {
    // il lump del primo body punta allo shell invece che al body
    const v = validateSat(corrupt(good, 2, 6, "$3"));
    expect(v.errors.join("\n")).toMatch(/lump.*\.body: \$3 è shell, atteso body/);
  });

  it("fallisce con un loop aperto", () => {
    const first = recordIndex(good, "coedge");
    // il next del primo coedge salta a un coedge di un altro loop
    const v = validateSat(corrupt(good, first, 4, `$${3 + first + 6}`));
    expect(v.ok).toBe(false);
    expect(v.errors.join("\n")).toMatch(/loop aperto|appartiene al loop/);
  });

  it("fallisce con partner incoerente, vertice fuori curva, terminatore o body mancanti", () => {
    const first = recordIndex(good, "coedge");
    expect(validateSat(corrupt(good, first, 6, `$${3 + first}`)).errors.join("\n")).toMatch(/partner/);
    const edge = recordIndex(good, "edge");
    expect(validateSat(corrupt(good, edge, 5, "7")).errors.join("\n")).toMatch(/non sta sulla curva/);
    expect(validateSat(good.replace("End-of-ACIS-data", "")).errors.join("\n")).toMatch(/terminatore/);
    expect(validateSat(good.replace(/^700 0 2 0/, "700 0 3 0")).errors.join("\n")).toMatch(/dichiarati 3 body/);
  });

  it("segnala record irraggiungibili e tipi non supportati", () => {
    const extra = good.replace("End-of-ACIS-data", "point $-1 -1 $-1 1 2 3 #\nEnd-of-ACIS-data");
    expect(validateSat(extra).errors.join("\n")).toMatch(/non raggiungibile/);
    const unknown = good.replace("End-of-ACIS-data", "spline-surface $-1 -1 $-1 @3 a b 1 2 #\nEnd-of-ACIS-data");
    expect(validateSat(unknown).errors.join("\n")).toMatch(/"spline-surface" non supportato/);
  });

  it("accetta indici espliciti (-n) e fine riga CRLF", () => {
    const lines = good.split("\n");
    const indexed = lines.map((l, i) => (i >= 3 && l.endsWith("#") ? `-${i - 3} ${l}` : l)).join("\r\n");
    expect(validateSat(indexed).errors).toEqual([]);
  });
});

describe("scanSat", () => {
  it("legge header, tipi e stringhe senza layout", () => {
    const s = scanSat(good);
    expect(s.header.code).toBe(700);
    expect(s.header.acisVersion).toBe("ACIS 7.0 NT");
    expect(s.header.units).toBe(1);
    expect(s.terminator).toBe("End-of-ACIS-data");
    expect(s.records[1]).toEqual({
      type: "string_attrib-name_attrib-gen-attrib",
      strings: ["ATTRIB_XACIS_NAME", "TRV-01"],
    });
    expect(s.records.filter((r) => r.type === "body")).toHaveLength(2);
  });
});
