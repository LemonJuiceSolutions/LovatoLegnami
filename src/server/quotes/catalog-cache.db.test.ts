import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { closeDb } from "@/db/client"
import { seedDatabase } from "@/db/seed"
import { freshDb } from "@/server/repositories/__tests__/helpers"
import { getActive, openDraft, publishDraft, saveDraft } from "@/server/repositories/datasets"
import { getPublicCatalog, invalidatePublicCatalog } from "./catalog"
import { loadSiteContent } from "@/server/site/content"
import { loadWizardData } from "@/server/site/wizard-data"

/**
 * 14.2 (bug trovato nel browser): dopo la pubblicazione di un listino il "a partire da"
 * del sito restava quello vecchio. La server action di pubblicazione invalidava la cache
 * del catalogo nel proprio grafo di moduli; le pagine (altro grafo) ricalcolavano il sito
 * con il catalogo vecchio ancora in memoria (60 s) e lo rimettevano nella cache di Next per
 * altri 300 s.
 */

/** Manodopera +20% nella bozza, poi pubblicata (senza invalidare: come un'altra istanza). */
async function publishLabourIncrease() {
  const active = await getActive("listino")
  const draft = await openDraft("listino", null)
  const labour = { ...active!.data.labour, hourlyRateCents: Math.round(active!.data.labour.hourlyRateCents * 1.2) }
  await saveDraft("listino", { ...active!.data, labour }, draft.updatedAt, null)
  await publishDraft("listino", null)
}

const quiet = { log: () => {} }

beforeEach(async () => {
  await freshDb()
  await seedDatabase()
  invalidatePublicCatalog()
})
afterAll(() => closeDb())

describe("cache del catalogo pubblico", () => {
  it("l'invalidazione raggiunge un'altra istanza del modulo (stesso processo)", async () => {
    const warm = await getPublicCatalog()
    vi.resetModules()
    const other = await import("./catalog")
    expect(await other.getPublicCatalog()).toBe(warm) // stessa cache condivisa
    await publishLabourIncrease()
    other.invalidatePublicCatalog()
    const fresh = await getPublicCatalog()
    expect(fresh.priceListVersion.version).toBe(warm.priceListVersion.version + 1)
  })

  it("contenuti del sito e dati del wizard leggono la versione appena pubblicata anche con la cache calda", async () => {
    const before = await loadSiteContent(quiet)
    const priceBefore = before.typologies[0]!.fromPrice!.totalCents
    await getPublicCatalog() // cache in memoria calda, mai invalidata
    await publishLabourIncrease()
    const after = await loadSiteContent(quiet)
    expect(after.typologies[0]!.fromPrice!.totalCents).toBeGreaterThan(priceBefore)
    const wizard = await loadWizardData()
    expect(wizard.pricing).toBe(true)
  })
})
