import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { closeDb } from "@/db/client"
import { seedDatabase } from "@/db/seed"
import { PRIVACY_NOTICE_VERSION } from "@/server/consent"
import { createMemorySender, setEmailSender } from "@/server/email/sender"
import { blacklistedKeys } from "@/server/public-dto"
import { invalidatePublicCatalog } from "@/server/quotes/catalog"
import { resetRateLimits } from "@/server/rate-limit"
import { anonymize, getByCode } from "@/server/repositories/leads"
import { freshDb, makeUser } from "@/server/repositories/__tests__/helpers"
import { createMemoryStorage, setFileStorage } from "@/server/storage/storage"
import { handleSubmitPost } from "@/server/routes/submit"
import { defaultConfig, serializeConfig } from "@/stores"
import { loadCustomerSummary } from "./customer-summary"

/** Caricamento del riepilogo del cliente dal token (12.8). */

const NOW = new Date("2026-10-15T08:00:00Z")
const DAY = 24 * 60 * 60 * 1000

beforeAll(() => {
  setEmailSender(createMemorySender())
  setFileStorage(createMemoryStorage())
})
beforeEach(async () => {
  await freshDb()
  await seedDatabase()
  invalidatePublicCatalog()
  resetRateLimits()
})
afterAll(() => {
  setEmailSender(undefined)
  setFileStorage(undefined)
  return closeDb()
})

async function submitLead(): Promise<{ code: string; token: string }> {
  const form = new FormData()
  form.set(
    "request",
    JSON.stringify({
      estimate: {
        config: JSON.parse(serializeConfig(defaultConfig("addossata-monofalda"))),
        declared: { access: "facile" },
        commercial: { species: "abete", quality: "lamellare", treatment: "impregnante-incolore", covering: null },
      },
      customer: { name: "Maria Rossi", email: "maria@example.it", phone: "333 1234567", cap: "37026", comune: "Pescantina" },
      notes: null,
      consent: { accepted: true, version: PRIVACY_NOTICE_VERSION },
      website: "",
      startedAt: NOW.getTime() - 60_000,
    }),
  )
  const res = await handleSubmitPost(new Request("http://localhost/api/preventivo", { method: "POST", body: form, headers: { "x-forwarded-for": "203.0.113.7" } }), { now: () => NOW })
  expect(res.status).toBe(201)
  return res.json()
}

describe("riepilogo del cliente (12.8)", () => {
  it("token valido ⇒ vista cliente dall'istantanea, senza dati interni né contatti", async () => {
    const { code, token } = await submitLead()
    const s = await loadCustomerSummary(token, new Date(NOW.getTime() + DAY))
    expect(s).not.toBeNull()
    expect(s).toMatchObject({ code, kind: "indicativo", firstName: "Maria", pdfUrl: `/api/preventivo/${token}/pdf` })
    const { quotes } = await getByCode(code)
    expect(s!.quote.totalCents).toBe(quotes[0]!.totalCents)
    expect(s!.measures.map((m) => m.label)).toEqual(["Larghezza", "Profondità", "Altezza sotto trave"])
    expect(blacklistedKeys(s)).toEqual([])
    expect(JSON.stringify(s)).not.toMatch(/maria@example\.it|333 1234567/)
  })

  it("token scaduto, sconosciuto o richiesta anonimizzata ⇒ null", async () => {
    const { code, token } = await submitLead()
    expect(await loadCustomerSummary(token, new Date(NOW.getTime() + 91 * DAY))).toBeNull()
    expect(await loadCustomerSummary("sconosciuto-token-che-non-esiste-affatto-xx", NOW)).toBeNull()
    const admin = await makeUser("admin@lovato.it", "admin")
    const { lead } = await getByCode(code)
    await anonymize(lead.id, admin.id)
    expect(await loadCustomerSummary(token, NOW)).toBeNull()
  })
})
