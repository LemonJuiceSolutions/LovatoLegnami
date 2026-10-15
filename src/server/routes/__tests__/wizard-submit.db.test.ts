import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { closeDb } from "@/db/client"
import { seedDatabase } from "@/db/seed"
import { loadPreset } from "@/domain/presets/catalog"
import { getActive } from "@/server/repositories/datasets"
import { PRIVACY_NOTICE_VERSION } from "@/server/consent"
import { createMemorySender, setEmailSender } from "@/server/email/sender"
import { invalidatePublicCatalog } from "@/server/quotes/catalog"
import { resetRateLimits } from "@/server/rate-limit"
import { getByCode } from "@/server/repositories/leads"
import { freshDb } from "@/server/repositories/__tests__/helpers"
import { createMemoryStorage, setFileStorage } from "@/server/storage/storage"
import { handleEstimatePost } from "@/server/routes/estimate"
import { handleSubmitPost } from "@/server/routes/submit"
import { getTypology } from "@/domain/typologies/registry"
import { parseConfigFile } from "@/stores/config-file"
import { DEFAULT_ANSWERS, measuresFromParams, newObstacle, type WizardAnswers } from "@/components/wizard/answers"
import { toConfig } from "@/components/wizard/to-config"
import { estimateBody } from "@/components/wizard/use-estimate"

/**
 * Dal wizard al server (12.7): la configurazione prodotta nel browser (adattata e
 * dimensionata) è accettata da stima e invio così com'è, e quella salvata con la richiesta
 * ha gli stessi parametri del riepilogo (il flusso condiviso è idempotente).
 */

const NOW = new Date("2026-10-15T08:00:00Z")
const sender = createMemorySender()

beforeAll(() => {
  setEmailSender(sender)
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

async function wizardAnswers(): Promise<WizardAnswers> {
  const preset = loadPreset("monofalda-grondaia")
  return {
    ...DEFAULT_ANSWERS,
    tipologia: { slug: "addossata-monofalda", presetId: "monofalda-grondaia", baseParams: preset.params },
    misure: { ...measuresFromParams(getTypology("addossata-monofalda"), preset.params) },
    spazio: {
      ...DEFAULT_ANSWERS.spazio,
      wallShape: "diagonali",
      diagonals: { front: 500, back: 500, left: 300, right: 300, d1: 590, d2: 576 },
      floor: "dislivello",
      floorDrop: 5,
      obstacles: [{ ...newObstacle("grondaia", "g1"), elevation: 300 }],
    },
    finiture: { ...DEFAULT_ANSWERS.finiture, covering: "policarbonato-alveolare" },
    contatti: { name: "Maria Rossi", email: "maria@example.it", phone: "333 1234567", cap: "37026", comune: "Pescantina", notes: "" },
  }
}

describe("wizard → stima e invio (12.7)", () => {
  it("la stima accetta la configurazione del wizard e il server non la cambia", async () => {
    const rules = (await getActive("regole"))!.data
    const answers = await wizardAnswers()
    const d = toConfig(answers, rules)
    expect(d.plan).not.toBeNull()
    const res = await handleEstimatePost(
      new Request("http://localhost/api/preventivo/stima", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.5" }, body: JSON.stringify(estimateBody(d.config!, answers)) }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.quote.status).toBe("completo")
    // le note del server sono quelle del wizard (stessa funzione, stesso flusso)
    for (const n of body.notes) expect(d.notes).toContain(n)

    const form = new FormData()
    form.set(
      "request",
      JSON.stringify({
        estimate: estimateBody(d.config!, answers),
        customer: { name: "Maria Rossi", email: "maria@example.it", phone: "333 1234567", cap: "37026", comune: "Pescantina" },
        notes: "Tinta preferita: Noce.",
        consent: { accepted: true, version: PRIVACY_NOTICE_VERSION },
        website: "",
        startedAt: NOW.getTime() - 120_000,
      }),
    )
    const sub = await handleSubmitPost(new Request("http://localhost/api/preventivo", { method: "POST", body: form, headers: { "x-forwarded-for": "203.0.113.5" } }), { now: () => NOW })
    expect(sub.status).toBe(201)
    const { code } = await sub.json()
    const { quotes } = await getByCode(code)
    const saved = parseConfigFile(quotes[0]!.config)
    expect(saved.params).toEqual(parseConfigFile(d.config).params)
    expect(saved.envelope.plan).toEqual(d.plan)
    expect(quotes[0]!.totalCents).toBe(body.quote.totalCents)
  })
})
