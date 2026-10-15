"use client"

import Link from "next/link"
import { useEffect, useRef, useState, useTransition } from "react"
import { CONTACT_LIMITS, validateContact, type ContactErrors, type ContactField, type ContactResult } from "./contact-validation"

const fieldClass =
  "mt-2 block w-full rounded-[var(--site-radius)] border border-input bg-card px-4 py-3 text-[1.0625rem] text-foreground placeholder:text-muted-foreground/80 focus-visible:border-primary aria-[invalid=true]:border-destructive"

/**
 * Form Contatti (11.4): validazione nel browser (la stessa del server), errori sul campo
 * annunciati, campo trappola nascosto, consenso con la versione dell'informativa. L'azione
 * arriva come prop (server action in produzione, funzione finta nei test).
 */
export function ContactForm({ action, privacyVersion }: { action: (fd: FormData) => Promise<ContactResult>; privacyVersion: string }) {
  const [errors, setErrors] = useState<ContactErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const startedAt = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (startedAt.current) startedAt.current.value = String(Date.now())
  }, [])

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const values = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      message: String(fd.get("message") ?? ""),
      consent: fd.get("consent") === "on",
    }
    const found = validateContact(values)
    setErrors(found)
    const first = Object.keys(found)[0] as ContactField | undefined
    if (first) {
      setMessage("Controlla i campi evidenziati.")
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    setMessage(null)
    startTransition(async () => {
      const result = await action(fd)
      if (result.ok) {
        setSentTo(values.email.trim().toLowerCase())
      } else {
        setErrors(result.fieldErrors ?? {})
        setMessage(result.message)
      }
    })
  }

  if (sentTo)
    return (
      <div role="status" className="rounded-[var(--site-radius)] border border-primary/40 bg-secondary/60 p-6">
        <p className="site-display site-h3">Messaggio inviato.</p>
        <p className="mt-2 text-foreground/85">Ti risponderemo all&apos;indirizzo {sentTo}. Se hai fretta, chiamaci in orario d&apos;ufficio.</p>
      </div>
    )

  const describe = (f: ContactField) => (errors[f] ? `contatti-${f}-errore` : undefined)
  const errorText = (f: ContactField) =>
    errors[f] ? (
      <p id={`contatti-${f}-errore`} className="mt-2 font-medium text-destructive">
        {errors[f]}
      </p>
    ) : null

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-6" aria-describedby={message ? "contatti-esito" : undefined}>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="contatti-name" className="font-medium">
            Nome e cognome
          </label>
          <input id="contatti-name" name="name" autoComplete="name" maxLength={CONTACT_LIMITS.name} className={fieldClass} aria-invalid={!!errors.name} aria-describedby={describe("name")} />
          {errorText("name")}
        </div>
        <div>
          <label htmlFor="contatti-email" className="font-medium">
            Email
          </label>
          <input
            id="contatti-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={CONTACT_LIMITS.email}
            className={fieldClass}
            aria-invalid={!!errors.email}
            aria-describedby={describe("email")}
          />
          {errorText("email")}
        </div>
      </div>
      <div className="sm:max-w-[calc(50%-0.75rem)]">
        <label htmlFor="contatti-phone" className="font-medium">
          Telefono <span className="font-normal text-muted-foreground">(facoltativo)</span>
        </label>
        <input
          id="contatti-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={CONTACT_LIMITS.phone}
          className={fieldClass}
          aria-invalid={!!errors.phone}
          aria-describedby={describe("phone")}
        />
        {errorText("phone")}
      </div>
      <div>
        <label htmlFor="contatti-message" className="font-medium">
          Messaggio
        </label>
        <textarea
          id="contatti-message"
          name="message"
          rows={6}
          maxLength={CONTACT_LIMITS.message}
          className={fieldClass}
          aria-invalid={!!errors.message}
          aria-describedby={describe("message")}
        />
        {errorText("message")}
      </div>

      {/* campo trappola per i bot: fuori dallo schermo e fuori dall'ordine di tabulazione */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="contatti-website">Lascia vuoto questo campo</label>
        <input id="contatti-website" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <input type="hidden" name="startedAt" ref={startedAt} defaultValue="0" />
      <input type="hidden" name="privacyVersion" value={privacyVersion} readOnly />

      <div>
        <div className="flex items-start gap-3">
          <input
            id="contatti-consent"
            name="consent"
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
            aria-invalid={!!errors.consent}
            aria-describedby={describe("consent")}
          />
          <label htmlFor="contatti-consent">
            Ho letto l&apos;
            <Link href="/privacy" className="text-primary underline underline-offset-4">
              informativa sulla privacy
            </Link>{" "}
            (versione {privacyVersion}) e acconsento al trattamento dei miei dati per ricevere una risposta.
          </label>
        </div>
        {errorText("consent")}
      </div>

      {message && (
        <p id="contatti-esito" role="alert" className="font-medium text-destructive">
          {message}
        </p>
      )}
      <button type="submit" disabled={pending} className="site-btn site-btn-primary disabled:opacity-60">
        {pending ? "Invio in corso…" : "Invia il messaggio"}
      </button>
    </form>
  )
}
