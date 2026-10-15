"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Camera, Loader2, Send, X } from "lucide-react"
import { getTypology } from "@/domain/typologies/registry"
import { cn } from "@/lib/utils"
import { measureFields, type ContactDraft } from "./answers"
import { TINTS } from "./finishes"
import { cm, euro } from "./format"
import { MAX_PHOTOS, MAX_UPLOAD_BYTES, preparePhotos, TOO_HEAVY, type PreparedPhoto, type Resizer } from "./photos"
import { clearSceneShot, sceneShot } from "./scene-capture"
import { StepHeading } from "./ui"
import { estimateBody, useEstimate } from "./use-estimate"
import { useWizard, useWizardActions, useWizardContext } from "./wizard-context"

/**
 * Passo 6 (12.7, spec `richieste-preventivo` "Invio della richiesta"): contatti, CAP e
 * comune del cantiere, note, fino a 5 foto ridimensionate nel browser, consenso con il
 * collegamento all'informativa e la sua versione, campo trappola. Invio multipart a
 * `POST /api/preventivo` e conferma su `/preventivo/grazie?c=PRV-…`.
 */

type Field = keyof ContactDraft | "consent" | "photos" | "form"
export type ContactErrors = Partial<Record<Field, string>>

export const CONSENT_MESSAGE = "Per inviare la richiesta devi accettare l'informativa sul trattamento dei dati."

/** Controlli del form (gli stessi del server, con messaggi per il cliente). */
export function validateContacts(c: ContactDraft, consent: boolean): ContactErrors {
  const e: ContactErrors = {}
  if (c.name.trim().length < 2) e.name = "Scrivi nome e cognome."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email.trim())) e.email = "Controlla l'indirizzo email (es. nome@esempio.it)."
  if (!/^[+0-9][0-9 ()./-]{5,29}$/.test(c.phone.trim())) e.phone = "Scrivi un numero di telefono valido."
  if (!/^\d{5}$/.test(c.cap.trim())) e.cap = "Il CAP ha 5 cifre."
  if (c.comune.trim().length < 2) e.comune = "Scrivi il comune del cantiere."
  if (c.notes.length > 2000) e.notes = "Al massimo 2000 caratteri."
  if (!consent) e.consent = CONSENT_MESSAGE
  return e
}

const SERVER_FIELDS: Readonly<Record<string, Field>> = {
  "customer.name": "name",
  "customer.email": "email",
  "customer.phone": "phone",
  "customer.cap": "cap",
  "customer.comune": "comune",
  notes: "notes",
  "consent.accepted": "consent",
  photos: "photos",
}

export function StepContacts({ resize }: { resize?: Resizer }) {
  const { data, fetcher } = useWizardContext()
  const router = useRouter()
  const contacts = useWizard((s) => s.answers.contatti)
  const answers = useWizard((s) => s.answers)
  const config = useWizard((s) => s.derived.config)
  const { setContacts, markSubmitted } = useWizardActions()
  const estimate = useEstimate()
  const [consent, setConsent] = React.useState(false)
  const [website, setWebsite] = React.useState("")
  const [photos, setPhotos] = React.useState<PreparedPhoto[]>([])
  const [preparing, setPreparing] = React.useState(false)
  const [errors, setErrors] = React.useState<ContactErrors>({})
  const [sending, setSending] = React.useState(false)
  const startedAt = React.useRef(Date.now())
  const typology = data.typologies.find((t) => t.slug === answers.tipologia.slug)

  const onFiles = async (list: FileList | null) => {
    const files = list ? Array.from(list) : []
    if (!files.length) return
    setPreparing(true)
    const r = await preparePhotos(files, photos.length, resize)
    setPreparing(false)
    setErrors((e) => ({ ...e, photos: r.error ?? undefined }))
    if (!r.error) setPhotos((p) => [...p, ...r.photos])
  }

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const found = validateContacts(contacts, consent)
    const photoBytes = photos.reduce((s, p) => s + p.blob.size, 0) + (sceneShot()?.size ?? 0)
    if (photoBytes > MAX_UPLOAD_BYTES) found.photos = TOO_HEAVY
    setErrors(found)
    if (Object.keys(found).length) {
      const first = Object.keys(found)[0]
      document.getElementById(`contatti-${first}`)?.focus()
      return
    }
    if (!config) {
      setErrors({ form: "Manca la configurazione della pergola: torna ai passi precedenti." })
      return
    }
    const tint = TINTS.find((t) => t.id === answers.finiture.tint)
    const notes = [contacts.notes.trim(), tint ? `Tinta preferita: ${tint.label}.` : ""].filter(Boolean).join("\n\n")
    const request = {
      estimate: estimateBody(config, answers),
      customer: { name: contacts.name.trim(), email: contacts.email.trim(), phone: contacts.phone.trim(), cap: contacts.cap.trim(), comune: contacts.comune.trim() },
      notes: notes || null,
      consent: { accepted: consent, version: data.consent.version },
      website,
      startedAt: startedAt.current,
    }
    const form = new FormData()
    form.set("request", JSON.stringify(request))
    for (const p of photos) form.append("photos", p.blob, p.name)
    const scene = sceneShot()
    if (scene) form.set("scene", scene, "scena.png")
    setSending(true)
    try {
      const res = await fetcher("/api/preventivo", { method: "POST", body: form })
      const json = (await res.json().catch(() => ({}))) as { code?: string; token?: string; error?: string; issues?: { path: string; message: string }[] }
      if (res.status === 201 && json.code && json.token) {
        const fields = typology ? measureFields(getTypology(typology.slug)) : []
        const quote = estimate.status === "ok" ? estimate.quote : null
        markSubmitted({
          code: json.code,
          token: json.token,
          typologyTitle: typology?.title ?? "Pergola",
          measures: fields.map((f) => `${f.label} ${cm(Number(config.params[f.param] ?? 0) / 10)}`).join(" · "),
          totalCents: quote && quote.status === "completo" ? quote.totalCents : null,
          rangeCents: quote && quote.status === "completo" ? [quote.range.minCents, quote.range.maxCents] : null,
          email: request.customer.email,
        })
        clearSceneShot()
        router.push(`/preventivo/grazie?c=${encodeURIComponent(json.code)}`)
        return
      }
      const mapped: ContactErrors = {}
      for (const i of json.issues ?? []) {
        const f = SERVER_FIELDS[i.path]
        if (f && !mapped[f]) mapped[f] = f === "consent" ? CONSENT_MESSAGE : i.message
      }
      if (!Object.keys(mapped).length) mapped.form = json.error ?? "Invio non riuscito: riprova tra qualche istante."
      setErrors(mapped)
    } catch {
      setErrors({ form: "Connessione assente: controlla la rete e riprova." })
    } finally {
      setSending(false)
    }
  }

  const field = (name: keyof ContactDraft, label: string, props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "name"> = {}) => (
    <TextField
      name={name}
      label={label}
      value={contacts[name]}
      error={errors[name]}
      onChange={(v) => {
        setContacts({ [name]: v })
        if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }))
      }}
      {...props}
    />
  )
  const quote = estimate.status === "ok" ? estimate.quote : null

  return (
    <section aria-labelledby="passo-titolo">
      <StepHeading
        id="passo-titolo"
        eyebrow="Passo 6 · Ultimo passo"
        title="Dove ti ricontattiamo?"
        intro="Ti mandiamo subito per email il riepilogo in PDF. Poi ti chiamiamo per fissare il sopralluogo gratuito: nessun impegno."
      />
      {quote && quote.status === "completo" && (
        <p className="mb-8 rounded-xl border border-border bg-card px-5 py-4">
          Prezzo indicativo <strong className="site-display text-[1.4rem] font-medium text-[hsl(var(--site-gold-ink))]">{euro(quote.totalCents)}</strong>{" "}
          <span className="text-muted-foreground">IVA inclusa{/^\d{5}$/.test(contacts.cap) ? ", con il trasporto per il tuo CAP" : ""}</span>
        </p>
      )}
      <form onSubmit={submit} noValidate className="space-y-6" aria-describedby={errors.form ? "contatti-form" : undefined}>
        <div className="grid gap-6 sm:grid-cols-2">
          {field("name", "Nome e cognome", { autoComplete: "name" })}
          {field("phone", "Telefono", { autoComplete: "tel", inputMode: "tel", type: "tel" })}
          <div className="sm:col-span-2">{field("email", "Email", { autoComplete: "email", inputMode: "email", type: "email" })}</div>
          {field("cap", "CAP del cantiere", { autoComplete: "postal-code", inputMode: "numeric", maxLength: 5 })}
          {field("comune", "Comune del cantiere", { autoComplete: "address-level2" })}
        </div>

        <div>
          <label htmlFor="contatti-notes" className="mb-1.5 block font-medium">
            Note <span className="font-normal text-muted-foreground">(facoltative)</span>
          </label>
          <textarea
            id="contatti-notes"
            rows={4}
            value={contacts.notes}
            onChange={(e) => setContacts({ notes: e.target.value })}
            maxLength={2000}
            className="w-full rounded-lg border-2 border-input bg-background px-4 py-3 text-lg outline-none focus-visible:border-primary"
            placeholder="Per esempio: orari in cui chiamarti, cosa ti serve, dettagli dello spazio."
          />
        </div>

        <div>
          <p className="mb-1.5 font-medium" id="contatti-photos-label">
            Foto dello spazio <span className="font-normal text-muted-foreground">(facoltative, fino a {MAX_PHOTOS})</span>
          </p>
          <p className="mb-3 text-muted-foreground">Una foto del muro e del punto dove andrà la pergola ci aiuta molto.</p>
          {photos.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-3" aria-label="Foto allegate">
              {photos.map((p) => (
                <li key={p.id}>
                  <PhotoThumb photo={p} onRemove={() => setPhotos((list) => list.filter((x) => x.id !== p.id))} />
                </li>
              ))}
            </ul>
          )}
          {photos.length < MAX_PHOTOS && (
            <label className="site-btn site-btn-quiet cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-[hsl(var(--site-gold))]">
              {preparing ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
              {preparing ? "Preparo le foto…" : "Aggiungi foto"}
              <input
                id="contatti-photos"
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                aria-describedby={errors.photos ? "contatti-photos-error" : undefined}
                aria-invalid={errors.photos ? true : undefined}
                onChange={(e) => {
                  void onFiles(e.target.files)
                  e.target.value = ""
                }}
              />
            </label>
          )}
          {errors.photos && (
            <p id="contatti-photos-error" role="alert" className="mt-2 font-medium text-destructive">
              {errors.photos}
            </p>
          )}
        </div>

        {/* campo trappola: invisibile e fuori dal tab, un umano lo lascia vuoto */}
        <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
          <label htmlFor="contatti-website">Sito web</label>
          <input id="contatti-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>

        <div className={cn("rounded-xl border-2 p-5", errors.consent ? "border-destructive" : "border-border")}>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              id="contatti-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked)
                if (e.target.checked) setErrors((x) => ({ ...x, consent: undefined }))
              }}
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby={errors.consent ? "contatti-consent-error" : undefined}
              className="mt-1 h-6 w-6 shrink-0 accent-[hsl(var(--primary))]"
            />
            <span>
              Acconsento al trattamento dei miei dati per ricevere il preventivo, come descritto nell&apos;
              <Link href="/privacy" target="_blank" className="underline underline-offset-4">
                informativa sulla privacy
              </Link>{" "}
              <span className="text-muted-foreground">(versione {data.consent.version})</span>.
            </span>
          </label>
          {errors.consent && (
            <p id="contatti-consent-error" role="alert" className="mt-2 font-medium text-destructive">
              {errors.consent}
            </p>
          )}
        </div>

        {errors.form && (
          <p id="contatti-form" role="alert" className="font-medium text-destructive">
            {errors.form}
          </p>
        )}
        <button type="submit" disabled={sending || preparing} className="site-btn site-btn-primary w-full text-lg sm:w-auto disabled:opacity-60">
          {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
          {sending ? "Invio in corso…" : "Invia la richiesta"}
        </button>
      </form>
    </section>
  )
}

function TextField({
  name,
  label,
  value,
  error,
  onChange,
  ...props
}: { name: string; label: string; value: string; error?: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "name">) {
  const id = `contatti-${name}`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn("h-12 w-full rounded-lg border-2 bg-background px-4 text-lg outline-none focus-visible:border-primary", error ? "border-destructive" : "border-input")}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function PhotoThumb({ photo, onRemove }: { photo: PreparedPhoto; onRemove: () => void }) {
  const [url, setUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (typeof URL.createObjectURL !== "function") return
    const u = URL.createObjectURL(photo.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [photo.blob])
  return (
    <span className="relative block h-24 w-24 overflow-hidden rounded-lg border border-border bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element -- anteprima locale (blob:) */}
      {url && <img src={url} alt={`Foto ${photo.name}`} className="h-full w-full object-cover" />}
      <button type="button" onClick={onRemove} aria-label={`Togli la foto ${photo.name}`} className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 shadow">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </span>
  )
}
