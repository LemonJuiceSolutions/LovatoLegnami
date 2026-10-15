import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { closeDb } from "@/db/client"
import { seedDatabase } from "@/db/seed"
import { freshDb } from "@/server/repositories/__tests__/helpers"
import { getActive, openDraft, publishDraft, saveDraft } from "@/server/repositories/datasets"
import { blacklistedKeys } from "@/server/public-dto"
import { invalidatePublicCatalog } from "@/server/quotes/catalog"
import { buildSitemap } from "@/components/site/seo"
import { loadSiteContent, loadSiteTypology } from "./content"

beforeAll(async () => {
  await freshDb()
  await seedDatabase()
  invalidatePublicCatalog()
})
afterAll(() => closeDb())

describe("contenuti del sito dal dataset attivo (11.2, 11.3)", () => {
  it("dopo il seed: le due tipologie MVP, in ordine, con disegno e prezzo 'a partire da'", async () => {
    const content = await loadSiteContent({ log: () => {} })
    expect(content.source).toBe("archivio")
    expect(content.typologies.map((t) => t.slug)).toEqual(["addossata-monofalda", "autoportante-bifalda"])
    for (const t of content.typologies) {
      expect(t.drawingSvg).toMatch(/^<svg [^>]*role="img"/)
      expect(t.drawingSvg).toContain("<polygon")
      expect(t.fromPrice).not.toBeNull()
      expect(t.fromPrice!.totalCents).toBeGreaterThan(100_000)
      expect(t.fromPrice!.widthMm).toBeGreaterThan(1000)
      expect(t.features.some((f) => f.startsWith("Larghezza da"))).toBe(true)
    }
    expect(content.gallery.length).toBeGreaterThan(0)
    expect(content.gallery.every((g) => g.kind === "drawing")).toBe(true)
  })

  it("sitemap (11.5): le tipologie visibili del dataset attivo, nessuna nascosta", async () => {
    const { typologies } = await loadSiteContent({ log: () => {} })
    const urls = buildSitemap("https://www.example.it", typologies).map((e) => e.url)
    expect(urls).toContain("https://www.example.it/pergole/addossata-monofalda")
    expect(urls).toContain("https://www.example.it/pergole/autoportante-bifalda")
    expect(urls.some((u) => u.includes("portale-sandwich"))).toBe(false)
  })

  it("non espone dati interni: solo il totale della vista cliente", async () => {
    const content = await loadSiteContent({ log: () => {} })
    const json = JSON.stringify(content.typologies.map(({ drawingSvg: _svg, ...rest }) => rest)).toLowerCase()
    expect(blacklistedKeys(JSON.parse(json))).toEqual([])
    for (const w of ["margine", "€/h", "tariffa", "sfrido", "listino"]) expect(json).not.toContain(w)
  })

  it("tipologia nascosta → null; tipologia resa visibile con seoSlug proprio → trovata", async () => {
    expect(await loadSiteTypology("portale-sandwich", { log: () => {} })).toBeNull()
    const active = await getActive("tipologie")
    const draft = await openDraft("tipologie", null)
    const data = active!.data.map((t) =>
      t.slug === "portale-sandwich"
        ? { ...t, visible: true, seoSlug: "pergola-libera", title: "Pergola libera", referencePresetId: "libera-4x3" }
        : t.slug === "addossata-monofalda"
          ? { ...t, visible: false }
          : t,
    )
    await saveDraft("tipologie", data, draft.updatedAt, null)
    await publishDraft("tipologie", null)
    invalidatePublicCatalog()

    expect(await loadSiteTypology("addossata-monofalda", { log: () => {} })).toBeNull()
    const libera = await loadSiteTypology("pergola-libera", { log: () => {} })
    expect(libera?.title).toBe("Pergola libera")
    expect(libera?.fromPrice?.presetName).toBe("Pergola libera 4×3")
  })

  it("database non disponibile → impostazioni di default (MVP) senza prezzi", async () => {
    const logs: string[] = []
    const content = await loadSiteContent({
      settings: () => Promise.reject(new Error("connessione rifiutata")),
      presets: () => Promise.reject(new Error("connessione rifiutata")),
      catalog: () => Promise.reject(new Error("connessione rifiutata")),
      log: (m) => logs.push(m),
    })
    expect(content.source).toBe("default")
    expect(content.typologies.map((t) => t.slug)).toEqual(["addossata-monofalda", "autoportante-bifalda"])
    expect(content.typologies.every((t) => t.fromPrice === null)).toBe(true)
    expect(logs).toHaveLength(2)
  })
})
