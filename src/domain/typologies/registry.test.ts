import { describe, expect, it } from "vitest";
import { translation } from "../math/mat4";
import { vec3 } from "../math/vec3";
import { pianaTest } from "./__tests__/piana-test";
import { TypologyNotFoundError, createRegistry } from "./registry";
import { TemplateError, type TypologyTemplate } from "./template";

describe("registro delle tipologie", () => {
  it("elenco con nome, descrizione e parametri", () => {
    const r = createRegistry([pianaTest]);
    const list = r.list();
    expect(list.map((t) => t.slug)).toEqual(["piana-test"]);
    expect(list[0]).toMatchObject({ name: "Piana (test)", description: expect.any(String) });
    expect(list[0].params.find((p) => p.name === "larghezza")).toMatchObject({ unit: "mm", min: 2000, max: 8000, default: 4000 });
    expect(r.get("piana-test")).toBe(pianaTest);
  });

  it("slug sconosciuto → errore \"tipologia non trovata\"", () => {
    const r = createRegistry([pianaTest]);
    expect(() => r.get("padiglione")).toThrow(TypologyNotFoundError);
    expect(() => r.generate("padiglione")).toThrow(/tipologia non trovata/);
  });

  it("generazione tramite registro con default", () => {
    const a = createRegistry([pianaTest]).generate("piana-test", { campate: 3 });
    expect(a.pieces.filter((p) => p.type === "pilastro")).toHaveLength(8);
  });

  it("template con tipo di componente sconosciuto → registrazione rifiutata", () => {
    const bad: TypologyTemplate = {
      ...pianaTest,
      slug: "con-capriata",
      build: () => [
        { kind: "place", ref: "c", type: "capriata" as never, section: { b: 100, h: 100 }, length: 1000, pose: translation(vec3(0, 0, 0)) },
      ],
    };
    const r = createRegistry();
    expect(() => r.register(bad)).toThrow(TemplateError);
    expect(() => r.register(bad)).toThrow(/primitivo fuori catalogo: "capriata"/);
    expect(r.has("con-capriata")).toBe(false);
  });

  it("parametro di sezione per un primitivo sconosciuto → rifiutato", () => {
    const bad: TypologyTemplate = {
      ...pianaTest,
      slug: "sezione-strana",
      params: [...pianaTest.params, { kind: "section", name: "s", label: "S", pieceType: "capriata" as never, default: "100×100" }],
    };
    expect(() => createRegistry([bad])).toThrow(/primitivo fuori catalogo/);
  });

  it("slug duplicato, default fuori limiti, generazione fallita → rifiutati", () => {
    const r = createRegistry([pianaTest]);
    expect(() => r.register(pianaTest)).toThrow(/già registrato/);
    const badDefault: TypologyTemplate = {
      ...pianaTest,
      slug: "default-errato",
      params: [{ kind: "number", name: "x", label: "X", unit: "mm", min: 0, max: 10, default: 20 }],
    };
    expect(() => r.register(badDefault)).toThrow(/default 20 fuori/);
    const broken: TypologyTemplate = {
      ...pianaTest,
      slug: "rotto",
      build: () => [{ kind: "place", ref: "a", type: "trave", section: { b: 100, h: 100 }, length: -5, pose: translation(vec3(0, 0, 0)) }],
    };
    expect(() => r.register(broken)).toThrow(/rotto.*length/);
  });
});
