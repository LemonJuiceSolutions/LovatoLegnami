import { describe, expect, it } from "vitest"
import { listTypologies } from "@/domain"
import { filterTypologies, normalizeSearch, presentCategories } from "./typology-helpers"

const all = listTypologies()
const slugs = (list: { slug: string }[]) => list.map((t) => t.slug)

describe("filtro delle tipologie", () => {
  it("categoria gazebo → solo gazebo-padiglione", () => {
    expect(slugs(filterTypologies(all, "gazebo", ""))).toEqual(["gazebo-padiglione"])
  })

  it("tutte senza ricerca → elenco completo nell'ordine del registro", () => {
    expect(slugs(filterTypologies(all, "tutte", ""))).toEqual(slugs(all))
  })

  it("ricerca su nome, tag e descrizione senza maiuscole né accenti", () => {
    expect(slugs(filterTypologies(all, "tutte", "ARCO"))).toContain("carport-arco")
    expect(slugs(filterTypologies(all, "tutte", "dardo giove"))).toEqual(["monofalda-scalare"])
    expect(filterTypologies(all, "carport", "gazebo")).toEqual([])
    expect(normalizeSearch("  Più   Àlto ")).toBe("piu alto")
  })

  it("le categorie presenti coprono le 5 categorie", () => {
    expect(presentCategories(all)).toEqual(["addossata", "autoportante", "carport", "gazebo", "pensilina"])
  })
})
