import { describe, expect, it } from "vitest";
import { pianaTest } from "./__tests__/piana-test";
import { ParamError, TemplateError, buildAssembly, defaultParams, resolveParams, type TypologyTemplate } from "./template";
import { translation } from "../math/mat4";
import { vec3 } from "../math/vec3";

describe("parametri del template", () => {
  it("default applicati per i parametri non forniti", () => {
    expect(resolveParams(pianaTest, { larghezza: 5000 })).toEqual({
      larghezza: 5000,
      profondita: 3000,
      altezza: 2400,
      campate: 2,
      sezionePilastro: "120×120",
      sezioneTrave: "120×240",
    });
    expect(defaultParams(pianaTest).larghezza).toBe(4000);
  });

  it("parametro fuori limite → errore con parametro, valore e intervallo", () => {
    const fn = () => buildAssembly(pianaTest, { larghezza: 1000 });
    expect(fn).toThrow(ParamError);
    expect(fn).toThrow(/larghezza.*1000.*\[2000, 8000\] mm/);
    try {
      fn();
    } catch (e) {
      expect(e).toMatchObject({ param: "larghezza", value: 1000, min: 2000, max: 8000 });
    }
  });

  it("tipo errato, intero richiesto, sezione non valida, parametro sconosciuto", () => {
    expect(() => resolveParams(pianaTest, { larghezza: "6000" })).toThrow(/larghezza.*numero/);
    expect(() => resolveParams(pianaTest, { campate: 1.5 })).toThrow(/campate.*intero/);
    expect(() => resolveParams(pianaTest, { sezioneTrave: "abc" })).toThrow(/sezioneTrave.*sezione non valida/);
    expect(() => resolveParams(pianaTest, { pippo: 1 })).toThrow(/pippo.*sconosciuto/);
  });

  it("sezioni normalizzate in forma canonica b×h", () => {
    expect(resolveParams(pianaTest, { sezioneTrave: "160x200" }).sezioneTrave).toBe("160×200");
  });
});

describe("interprete buildAssembly", () => {
  it("esegue gli step con id stabili per famiglia", () => {
    const a = buildAssembly(pianaTest);
    expect(a.typologySlug).toBe("piana-test");
    expect(a.pieces.map((p) => p.id)).toEqual(["PIL-01", "PIL-02", "PIL-03", "TRV-01", "PIL-04", "PIL-05", "PIL-06", "TRV-02"]);
    const t = a.pieces.find((p) => p.id === "TRV-01")!;
    expect(t.length).toBe(4000);
    expect(t.section).toEqual({ b: 120, h: 240 });
    expect(a.params.campate).toBe(2);
  });

  it("output deterministico", () => {
    expect(buildAssembly(pianaTest, { larghezza: 5000 })).toEqual(buildAssembly(pianaTest, { larghezza: 5000 }));
  });

  it("pavimento passato al contesto: pilastri di lunghezza individuale", () => {
    const a = buildAssembly(pianaTest, {}, { floorHeightAt: (_x, y) => -y / 30 });
    const pil = a.pieces.filter((p) => p.type === "pilastro");
    expect(pil[0].length).toBeCloseTo(2402, 9);
    expect(pil[3].length).toBeCloseTo(2400 + 2940 / 30, 9);
  });

  const base = (steps: TypologyTemplate["build"]): TypologyTemplate => ({ ...pianaTest, slug: "prova", build: steps });

  it("lavorazioni e giunti per ref; giunti espansi alla fine", () => {
    const t = base(() => [
      { kind: "place", ref: "a", type: "trave", section: { b: 160, h: 200 }, length: 4000, pose: translation(vec3(0, 0, 0)) },
      {
        kind: "place",
        ref: "b",
        type: "trave",
        section: { b: 160, h: 200 },
        length: 3000,
        pose: [0, -1, 0, 1000, 1, 0, 0, -500, 0, 0, 1, 0, 0, 0, 0, 1],
      },
      { kind: "machining", target: "a", spec: { type: "foro", diameter: 12, offset: 0, at: 300, face: "superiore" } },
      { kind: "joint", type: "mezzo-legno", a: "a", b: "b" },
    ]);
    const a = buildAssembly(t);
    expect(a.joints).toEqual([{ id: "G-01", type: "mezzo-legno", pieceA: "TRV-01", pieceB: "TRV-02", params: {} }]);
    expect(a.pieces[0].machinings.map((m) => m.type)).toEqual(["foro", "mezzo-legno"]);
    expect(a.pieces[1].machinings.map((m) => m.type)).toEqual(["mezzo-legno"]);
  });

  it("ref sconosciuto o duplicato → errore del template", () => {
    const sconosciuto = base(() => [{ kind: "machining", target: "x", spec: { type: "foro", diameter: 12, offset: 0, at: 1, face: "superiore" } }]);
    expect(() => buildAssembly(sconosciuto)).toThrow(TemplateError);
    expect(() => buildAssembly(sconosciuto)).toThrow(/"x"/);
    const p = { kind: "place", ref: "a", type: "trave", section: { b: 100, h: 100 }, length: 1000, pose: translation(vec3(0, 0, 0)) } as const;
    expect(() => buildAssembly(base(() => [p, p]))).toThrow(/ref duplicato/);
  });

  it("primitivo fuori catalogo → errore esplicito", () => {
    const t = base(() => [
      { kind: "place", ref: "a", type: "capriata" as never, section: { b: 100, h: 100 }, length: 1000, pose: translation(vec3(0, 0, 0)) },
    ]);
    expect(() => buildAssembly(t)).toThrow(/primitivo fuori catalogo: "capriata"/);
  });
});
