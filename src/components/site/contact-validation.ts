/**
 * Validazione del form Contatti (11.4), condivisa da browser e server: funzione pura senza
 * zod, così la pagina non porta la libreria nel bundle. Il server la riapplica sempre.
 */

export interface ContactValues {
  readonly name: string
  readonly email: string
  readonly phone: string
  readonly message: string
  readonly consent: boolean
}

export type ContactField = keyof ContactValues
export type ContactErrors = Partial<Record<ContactField, string>>

export const CONTACT_LIMITS = { name: 120, email: 254, phone: 40, message: 4000, minMessage: 10 } as const

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[+\d\s./()-]*$/

export function normalizeContact(v: ContactValues): ContactValues {
  return { name: v.name.trim(), email: v.email.trim().toLowerCase(), phone: v.phone.trim(), message: v.message.trim(), consent: v.consent }
}

export function validateContact(input: ContactValues): ContactErrors {
  const v = normalizeContact(input)
  const e: ContactErrors = {}
  if (v.name.length < 2) e.name = "Scrivi il tuo nome."
  else if (v.name.length > CONTACT_LIMITS.name) e.name = `Il nome può avere al massimo ${CONTACT_LIMITS.name} caratteri.`
  if (!EMAIL.test(v.email) || v.email.length > CONTACT_LIMITS.email) e.email = "Controlla l'indirizzo email: serve per risponderti."
  if (v.phone.length > CONTACT_LIMITS.phone || !PHONE.test(v.phone)) e.phone = "Il telefono può contenere solo cifre, spazi e +."
  if (v.message.length < CONTACT_LIMITS.minMessage) e.message = "Scrivi qualche parola in più sulla tua richiesta."
  else if (v.message.length > CONTACT_LIMITS.message) e.message = `Il messaggio può avere al massimo ${CONTACT_LIMITS.message} caratteri.`
  if (!v.consent) e.consent = "Per inviare il messaggio devi accettare l'informativa sul trattamento dei dati."
  return e
}

export type ContactResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string; readonly fieldErrors?: ContactErrors }
