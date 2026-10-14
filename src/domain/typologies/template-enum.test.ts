import { describe, expect, it } from "vitest";
import { translation } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { pianaTest } from "./__tests__/piana-test";
import { createRegistry, listTypologies } from "./registry";
import {
  ParamError,
  TemplateError,
  buildAssembly,
  isParamVisible,
  resolveParams,
  type EnumParamSpec,
  type ParamSpec,
  type TypologyTemplate,
} from "./template";

const costruzione: EnumParamSpec = {
  kind: "enum",
  name: "costruzione",
  label: "Costruzione",
  options: [
    { value: "bullonata", label: "Bullonata" },
    { value: "carpenteria", label: "Carpenteria" },
  ],
  default: "bullonata",
};

const forma: EnumParamSpec = {
  kind: "enum",
  name: "forma",
  label: "Forma",
  options: [
    { value: "piana", label: "Piana" },
    { value: "monofalda", label: "Monofalda" },
  ],
  default: "piana",
};

const testaPilastro: ParamSpec = {
  kind: "enum",
  name: "testaPilastro",
  label: "Testa del pilastro",
  options: [
    { value: "squadra", label: "A squadra" },
    { value: "inclinata", label: "Inclinata" },
  ],
  default: "squadra",
  visibleWhen: (p) => p.forma === "monofalda",
};

/** Template che usa `ctx.enum` per scegliere la lunghezza della trave. */
const conScelte: TypologyTemplate = {
  ...pianaTest,
  slug: "con-scelte",
  params: [...pianaTest.params, costruzione, forma, testaPilastro],
  build: (ctx) => [
    {
      kind: "place",
      ref: "t",
      type: ctx.enum("costruzione") === "bullonata" ? "tavola" : "trave",
      section: { b: 45, h: 120 },
      length: ctx.enum("testaPilastro") === "squadra" ? 4000 : 3000,
      pose: translation(vec3(0, 0, 2400)),
    },
  ],
};

describe("parametri a scelta (enum)", () => {
  it("valore fuori dalle opzioni → ParamError che elenca le opzioni", () => {
    const fn = () => buildAssembly(conScelte, { costruzione: "saldata" });
    expect(fn).toThrow(ParamError);
    expect(fn).toThrow(/costruzione.*saldata.*bullonata, carpenteria/);
    expect(() => resolveParams(conScelte, { costruzione: 3 })).toThrow(/ammessi: bullonata, carpenteria/);
  });

  it("default applicato e letto con ctx.enum", () => {
    expect(resolveParams(conScelte).costruzione).toBe("bullonata");
    expect(buildAssembly(conScelte).pieces[0].type).toBe("tavola");
    expect(buildAssembly(conScelte, { costruzione: "carpenteria" }).pieces[0].type).toBe("trave");
  });

  it("ctx.enum su un parametro di altro tipo → errore del template", () => {
    const t: TypologyTemplate = { ...conScelte, slug: "enum-errato", build: (ctx) => (ctx.enum("larghezza"), []) };
    expect(() => buildAssembly(t)).toThrow(/larghezza è di tipo number, non enum/);
  });
});

describe("visibilità condizionata", () => {
  it("visibleWhen falso non impedisce la risoluzione del default", () => {
    const params = resolveParams(conScelte, { forma: "piana" });
    expect(isParamVisible(testaPilastro, params)).toBe(false);
    expect(params.testaPilastro).toBe("squadra");
    expect(buildAssembly(conScelte, { forma: "piana" }).pieces[0].length).toBe(4000);
    expect(isParamVisible(testaPilastro, resolveParams(conScelte, { forma: "monofalda" }))).toBe(true);
    expect(isParamVisible(costruzione, params)).toBe(true);
  });

  it("valore esplicito di un parametro nascosto conservato", () => {
    expect(buildAssembly(conScelte, { forma: "piana", testaPilastro: "inclinata" }).pieces[0].length).toBe(3000);
  });
});

describe("metadati di catalogo e validazione", () => {
  it("il registro espone categoria, tag e riferimento", () => {
    const [info] = createRegistry([{ ...conScelte, reference: "T-A" }]).list();
    expect(info).toMatchObject({ slug: "con-scelte", category: "autoportante", tags: ["test"], reference: "T-A" });
    for (const t of listTypologies()) {
      expect(t.category).toBeTruthy();
      expect(t.tags.length).toBeGreaterThan(0);
    }
  });

  it("default dell'enum fuori dalle opzioni → rifiutato", () => {
    const bad: TypologyTemplate = { ...conScelte, slug: "enum-default", params: [...pianaTest.params, { ...costruzione, default: "saldata" }] };
    expect(() => createRegistry([bad])).toThrow(TemplateError);
    expect(() => createRegistry([bad])).toThrow(/default "saldata" non tra le opzioni/);
  });

  it("categoria non ammessa → rifiutata", () => {
    const bad = { ...conScelte, slug: "cat-errata", category: "capannone" } as unknown as TypologyTemplate;
    expect(() => createRegistry([bad])).toThrow(/categoria non ammessa "capannone"/);
  });
});
