import { describe, expect, it } from "vitest";
import { identity, translation } from "@/domain/math/mat4";
import { vec3 } from "@/domain/math/vec3";
import { pieceBoxBrep } from "@/geometry/neutral-brep-box";
import { holeBoxBrep } from "./__fixtures__/breps";
import { compareWithSample, suggestVersion, summarizeSat } from "./compare";
import { writeSat, type SatWriteOptions } from "./writer";

const date = new Date(2026, 9, 14, 9, 30, 0);
const bodies = [
  { id: "TRV-01", brep: pieceBoxBrep({ b: 120, h: 240 }, 3000), pose: identity() },
  { id: "PIL-01", brep: holeBoxBrep(), pose: translation(vec3(0, 500, 0)) },
];
const ours = (o: SatWriteOptions = {}) => writeSat(bodies, { date, ...o }).text;
const sample70 = writeSat([bodies[0]], { date, producer: "SampleCAD 2020" }).text;

/** Campione di terzi: indici espliciti, attributo con altro nome, entità che non scriviamo, unità in metri. */
const thirdParty = [
  "700 0 1 0",
  "@14 Some CAD 2019 @11 ACIS 7.0 NT @24 Mon Jan 07 10:00:00 2019",
  "1000 9.9999999999999995e-007 1e-010",
  "-0 body $1 -1 $-1 $2 $-1 $-1 #",
  "-1 name_attrib-gen-attrib $-1 -1 $-1 $-1 $0 keep keep_kept ignore copy_keep @9 Part Name #",
  "-2 lump $-1 -1 $-1 $-1 $3 $0 #",
  "-3 shell $-1 -1 $-1 $-1 $-1 $4 $-1 $2 #",
  "-4 face $-1 -1 $-1 $-1 $5 $3 $-1 $6 forward single #",
  "-5 loop $-1 -1 $-1 $-1 $-1 $4 #",
  "-6 spline-surface $-1 -1 $-1 forward { exactsur 0 } I I I I #",
  "End-of-ACIS-data",
].join("\n");

describe("compareWithSample", () => {
  it("campione 7.0 vs nostro 21.0 → differenza di versione e suggerimento", () => {
    const c = compareWithSample(ours({ version: "21.0" }), sample70);
    const v = c.differences.find((d) => d.aspect === "versione");
    expect(v).toBeDefined();
    expect(v!.severity).toBe("errore");
    expect(v!.sample).toBe("700");
    expect(v!.ours).toBe("21000");
    expect(v!.message).toMatch(/campione ACIS 7\.0 NT \(700\).*nostro ACIS 21\.0 NT \(21000\)/);
    expect(v!.suggestion).toEqual({ option: "version", value: "7.0" });
    expect(c.compatible).toBe(false);
  });

  it("stessa versione, entità e body → nessuna differenza", () => {
    const c = compareWithSample(ours(), writeSat(bodies, { date, producer: "altro" }).text);
    expect(c.differences).toEqual([]);
    expect(c.compatible).toBe(true);
  });

  it("campione con un solo body e senza cilindri → avviso sulle entità e suggerimento file per pezzo", () => {
    const c = compareWithSample(ours(), sample70);
    expect(c.differences.find((d) => d.aspect === "versione")).toBeUndefined();
    const ent = c.differences.find((d) => d.aspect === "entità" && d.severity === "avviso");
    expect(ent?.message).toMatch(/cone-surface, ellipse-curve/);
    expect(c.differences.find((d) => d.aspect === "body")?.suggestion).toEqual({
      option: "fileMode",
      value: "un-file-per-pezzo",
    });
  });

  it("campione di terzi: unità, entità in più, attributi diversi", () => {
    const c = compareWithSample(ours(), thirdParty);
    const byAspect = (a: string) => c.differences.filter((d) => d.aspect === a);
    expect(byAspect("unità")[0].message).toMatch(/1 unità = 1000 mm/);
    expect(byAspect("entità").some((d) => d.severity === "info" && d.message.includes("spline-surface"))).toBe(true);
    expect(byAspect("attributi").some((d) => d.message.includes("name_attrib-gen-attrib"))).toBe(true);
    expect(c.sample.attributeNames).toEqual(["Part Name"]);
    expect(c.sample.bodyCount).toBe(1);
  });

  it("nome attributo diverso → suggerimento nameAttribute; nessun attributo → suggerimento includeName", () => {
    const withOtherName = ours({ nameAttribute: "NOME_PEZZO" });
    const c = compareWithSample(ours(), withOtherName);
    expect(c.differences.find((d) => d.aspect === "attributi")?.suggestion).toEqual({
      option: "nameAttribute",
      value: "NOME_PEZZO",
    });
    const plain = compareWithSample(ours(), ours({ includeName: false }));
    expect(plain.differences.find((d) => d.aspect === "attributi")?.suggestion).toEqual({
      option: "includeName",
      value: false,
    });
  });

  it("campione illeggibile → errore di header", () => {
    const c = compareWithSample(ours(), "ciao");
    expect(c.differences[0]).toMatchObject({ aspect: "header", severity: "errore" });
  });
});

describe("summarizeSat / suggestVersion", () => {
  it("riassunto del nostro file", () => {
    const s = summarizeSat(ours());
    expect(s).toMatchObject({ versionCode: 700, version: "7.0", units: 1, bodyCount: 2 });
    expect(s.attributeNames).toEqual(["ATTRIB_XACIS_NAME"]);
    expect(s.entityTypes["cone-surface"]).toBe(1);
  });

  it("versione suggerita per codici non supportati", () => {
    expect(suggestVersion(700)).toBe("7.0");
    expect(suggestVersion(600)).toBe("4.0");
    expect(suggestVersion(1500)).toBe("7.0");
    expect(suggestVersion(21800)).toBe("21.0");
    expect(suggestVersion(106)).toBe("4.0");
  });
});
