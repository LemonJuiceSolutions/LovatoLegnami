import { describe, expect, it } from "vitest";
import { ValidationError } from "../components/errors";
import { listTypologies } from "../typologies/registry";
import { MVP_VISIBLE_TYPOLOGIES, defaultTypologySettings, parseTypologySettings } from "./typology-settings";

const issuesOf = (data: unknown) => {
  try {
    parseTypologySettings(data);
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    return (e as ValidationError).issues;
  }
  throw new Error("atteso un errore");
};

describe("impostazioni delle tipologie (6.5)", () => {
  it("i default coprono tutte le tipologie registrate, visibili le due MVP, e sono validi", () => {
    const d = defaultTypologySettings();
    expect(d.map((t) => t.slug)).toEqual(listTypologies().map((t) => t.slug));
    expect(d.filter((t) => t.visible).map((t) => t.slug)).toEqual([...MVP_VISIBLE_TYPOLOGIES]);
    expect(d.find((t) => t.slug === "addossata-monofalda")?.title).toBe(listTypologies()[0]!.name);
    expect(parseTypologySettings(d)).toEqual(d);
  });

  it("uno slug non registrato è rifiutato", () => {
    const d = defaultTypologySettings();
    d[1] = { ...d[1]!, slug: "pergola-volante" };
    expect(issuesOf(d)).toContainEqual({ path: "[1].slug", message: "tipologia non registrata: pergola-volante" });
  });

  it("un seoSlug duplicato è rifiutato", () => {
    const d = defaultTypologySettings();
    d[2] = { ...d[2]!, seoSlug: d[0]!.seoSlug };
    expect(issuesOf(d)).toContainEqual({ path: "[2].seoSlug", message: `slug SEO duplicato: ${d[0]!.seoSlug}` });
  });

  it("forma: titolo, slug SEO e immagini sono controllati", () => {
    const d = defaultTypologySettings();
    d[0] = { ...d[0]!, title: " ", seoSlug: "Pergola Bella", heroImage: { src: "http://x.it/a.jpg", alt: "" } };
    const paths = issuesOf(d).map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(["[0].title", "[0].seoSlug", "[0].heroImage.src", "[0].heroImage.alt"]));
    expect(issuesOf([{ ...defaultTypologySettings()[0], extra: 1 }]).length).toBeGreaterThan(0);
  });
});
