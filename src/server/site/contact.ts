import { normalizeContact, validateContact, type ContactResult, type ContactValues } from "@/components/site/contact-validation"
import { PRIVACY_NOTICE_VERSION } from "@/server/consent"
import { enqueue, flush } from "@/server/email/outbox"
import { getEnv } from "@/server/env"
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/server/rate-limit"

/**
 * Messaggio dal form Contatti (11.4): validazione (la stessa del browser), anti-spam come
 * l'invio della richiesta (campo trappola, tempo di compilazione), consenso con la
 * versione dell'informativa del server, limite per IP (stessi limiti dell'invio della
 * richiesta, chiave separata), poi **outbox** verso l'ufficio e invio immediato. Un errore
 * del provider resta nell'outbox (`da-reinviare`) e non cambia la risposta al visitatore.
 */

export interface ContactSubmission extends ContactValues {
  readonly privacyVersion: string
  /** Campo trappola: i visitatori non lo vedono, i bot lo compilano. */
  readonly website: string
  /** Istante (ms) in cui il form è stato mostrato. */
  readonly startedAt: number
}

export const MIN_FILL_MS = 3_000
export const MAX_FILL_MS = 24 * 60 * 60 * 1000
const GENERIC_ERROR = "Invio non riuscito: riprova, oppure scrivici o chiamaci direttamente."

export async function submitContact(input: ContactSubmission, ctx: { ip: string; now?: number }): Promise<ContactResult> {
  const now = ctx.now ?? Date.now()
  const limit = checkRateLimit("submit", `contatti:${ctx.ip}`)
  if (!limit.allowed) return { ok: false, message: RATE_LIMIT_MESSAGE }

  const elapsed = now - input.startedAt
  if (input.website.trim() !== "" || !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS || elapsed > MAX_FILL_MS) return { ok: false, message: GENERIC_ERROR }

  const fieldErrors = validateContact(input)
  if (Object.keys(fieldErrors).length > 0) return { ok: false, message: "Controlla i campi evidenziati.", fieldErrors }
  if (input.privacyVersion !== PRIVACY_NOTICE_VERSION)
    return { ok: false, message: "L'informativa sulla privacy è stata aggiornata: ricarica la pagina e rileggila prima di inviare." }

  const v = normalizeContact(input)
  try {
    const entry = await enqueue({
      template: "messaggio-contatti",
      to: getEnv().officeEmail,
      payload: { name: v.name, email: v.email, phone: v.phone, message: v.message, privacyVersion: PRIVACY_NOTICE_VERSION },
    })
    await flush({ ids: [entry.id] }).catch((e) => console.error("[contatti] invio email non riuscito", e instanceof Error ? e.message : e))
  } catch (e) {
    console.error("[contatti] messaggio non accodato", e instanceof Error ? e.message : e)
    return { ok: false, message: GENERIC_ERROR }
  }
  return { ok: true }
}

/** Valori del form dai campi di `FormData`. */
export function contactFromFormData(fd: FormData): ContactSubmission {
  const s = (k: string) => {
    const v = fd.get(k)
    return typeof v === "string" ? v : ""
  }
  return {
    name: s("name"),
    email: s("email"),
    phone: s("phone"),
    message: s("message"),
    consent: s("consent") === "on" || s("consent") === "true",
    privacyVersion: s("privacyVersion"),
    website: s("website"),
    startedAt: Number(s("startedAt")),
  }
}
