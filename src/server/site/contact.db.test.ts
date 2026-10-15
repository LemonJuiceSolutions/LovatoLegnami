import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { closeDb, getDb } from "@/db/client"
import { emailOutbox } from "@/db/schema"
import { PRIVACY_NOTICE_VERSION } from "@/server/consent"
import { createMemorySender, setEmailSender } from "@/server/email"
import { renderEntry } from "@/server/email/outbox"
import { resetRateLimits } from "@/server/rate-limit"
import { freshDb } from "@/server/repositories/__tests__/helpers"
import { submitContact, type ContactSubmission } from "./contact"

const NOW = 1_800_000_000_000
const valid = (over: Partial<ContactSubmission> = {}): ContactSubmission => ({
  name: "Maria Rossi",
  email: "Maria@Example.it",
  phone: "+39 333 1234567",
  message: "Vorrei una pergola addossata di <b>4 × 3 m</b>.",
  consent: true,
  privacyVersion: PRIVACY_NOTICE_VERSION,
  website: "",
  startedAt: NOW - 60_000,
  ...over,
})

const sender = createMemorySender()

beforeAll(async () => {
  await freshDb()
  setEmailSender(sender)
})
beforeEach(() => resetRateLimits())
afterAll(() => closeDb())

describe("messaggio dal form Contatti (11.4)", () => {
  it("valido → voce nell'outbox per l'ufficio, inviata, con risposta al mittente e testo escapato", async () => {
    const res = await submitContact(valid(), { ip: "198.51.100.1", now: NOW })
    expect(res).toEqual({ ok: true })
    const db = await getDb()
    const rows = await db.select().from(emailOutbox).where(eq(emailOutbox.template, "messaggio-contatti"))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("inviata")
    const mail = await renderEntry(rows[0])
    expect(mail.replyTo).toBe("maria@example.it")
    expect(mail.subject).toBe("Messaggio dal sito – Maria Rossi")
    expect(mail.html).toContain("&lt;b&gt;4 × 3 m&lt;/b&gt;")
    expect(mail.text).toContain(`versione ${PRIVACY_NOTICE_VERSION}`)
  })

  it("campi non validi → errori per campo, nessuna voce", async () => {
    const res = await submitContact(valid({ email: "x", consent: false, message: "ciao" }), { ip: "198.51.100.2", now: NOW })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(Object.keys(res.fieldErrors ?? {}).sort()).toEqual(["consent", "email", "message"])
  })

  it("anti-spam: campo trappola o invio troppo rapido → rifiutato", async () => {
    expect((await submitContact(valid({ website: "https://spam.example" }), { ip: "198.51.100.3", now: NOW })).ok).toBe(false)
    expect((await submitContact(valid({ startedAt: NOW - 500 }), { ip: "198.51.100.3", now: NOW })).ok).toBe(false)
  })

  it("informativa cambiata nel frattempo → invito a ricaricare", async () => {
    const res = await submitContact(valid({ privacyVersion: "2020-01" }), { ip: "198.51.100.4", now: NOW })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toMatch(/informativa sulla privacy è stata aggiornata/)
  })

  it("limite per IP: oltre 5 messaggi in 10 minuti → messaggio cortese", async () => {
    for (let i = 0; i < 5; i++) expect((await submitContact(valid(), { ip: "198.51.100.5", now: NOW })).ok).toBe(true)
    const res = await submitContact(valid(), { ip: "198.51.100.5", now: NOW })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toMatch(/troppe richieste/)
  })
})
