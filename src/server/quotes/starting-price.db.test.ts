import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { closeDb } from "@/db/client"
import { seedDatabase } from "@/db/seed"
import { DEFAULT_PRICE_LIST } from "@/domain/pricing/data/default-listino"
import { freshDb } from "@/server/repositories/__tests__/helpers"
import { getActive } from "@/server/repositories/datasets"
import { startingPrice } from "@/server/admin/starting-price"
import { invalidatePublicCatalog } from "@/server/quotes/catalog"
import { loadSiteContent } from "@/server/site/content"
import { startingFinish } from "./starting-price"

/**
 * Prezzo "a partire da" unico (correzione B del gruppo 12): la scheda della tipologia nel
 * back-office e le pagine pubbliche (quindi il passo 1 del wizard) mostrano lo stesso
 * importo, con la stessa finitura di base.
 */

beforeAll(async () => {
  await freshDb()
  await seedDatabase()
  invalidatePublicCatalog()
})
afterAll(() => closeDb())

describe("prezzo 'a partire da' condiviso (correzione B)", () => {
  it("finitura di base: abete lamellare, trattamento meno caro, nessuna copertura", () => {
    expect(startingFinish(DEFAULT_PRICE_LIST)).toEqual({ species: "abete", quality: "lamellare", treatment: "impregnante-incolore", covering: null })
    const senzaAbete = {
      ...DEFAULT_PRICE_LIST,
      timber: { ...DEFAULT_PRICE_LIST.timber, species: DEFAULT_PRICE_LIST.timber.species.filter((s) => s.id !== "abete") },
      treatments: [],
    }
    expect(startingFinish(senzaAbete)).toEqual({ species: "larice", quality: "lamellare", treatment: null, covering: null })
  })

  it("admin e sito pubblico: stesso importo per ogni tipologia visibile", async () => {
    const [listino, regole, tipologie, presets] = await Promise.all([getActive("listino"), getActive("regole"), getActive("tipologie"), getActive("preset")])
    const version = { id: listino!.id, version: listino!.version, effectiveFrom: listino!.effectiveFrom, status: "attiva" as const }
    const content = await loadSiteContent({ log: () => {} })
    expect(content.typologies.length).toBeGreaterThan(0)
    for (const t of content.typologies) {
      const setting = tipologie!.data.find((s) => s.slug === t.slug)!
      const preset = presets!.data.find((p) => p.id === setting.referencePresetId) ?? presets!.data.find((p) => p.typologySlug === t.slug)!
      const admin = startingPrice(preset, listino!.data, version, regole!.data)
      expect(admin, t.slug).not.toBeNull()
      expect(t.fromPrice?.totalCents, t.slug).toBe(admin!.cents)
      expect(t.fromPrice?.finish).toBe("Abete lamellare, impregnante incolore")
    }
  })
})
