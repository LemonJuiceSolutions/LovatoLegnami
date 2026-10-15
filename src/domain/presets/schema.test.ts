import { describe, expect, it } from "vitest";
import { ValidationError } from "../components/errors";
import { PRESET_CATALOG } from "./catalog";
import { parsePresets } from "./schema";

const issuesOf = (data: unknown) => {
  try {
    parsePresets(data);
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    return (e as ValidationError).issues;
  }
  throw new Error("atteso un errore");
};

describe("schema dei preset (6.5)", () => {
  it("il catalogo del dominio è valido", () => {
    const parsed = parsePresets(PRESET_CATALOG);
    expect(parsed.map((p) => p.id)).toEqual(PRESET_CATALOG.map((p) => p.id));
  });

  it("tipologia non registrata, id duplicato e parametro sconosciuto sono rifiutati", () => {
    const [a, b] = PRESET_CATALOG;
    const issues = issuesOf([
      { ...a, typologySlug: "inesistente" },
      { ...b, id: b!.id, params: { ...b!.params, nonEsiste: 3 } },
      { ...b },
    ]);
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(["[0].typologySlug", "[1].params", "[2].id"]));
  });
});
