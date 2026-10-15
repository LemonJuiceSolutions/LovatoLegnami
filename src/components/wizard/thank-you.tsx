"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, FileDown, Phone } from "lucide-react"
import { clearAnswers, readSubmitted } from "@/stores/wizard-session"
import type { SubmittedSummary } from "@/stores/wizard-store"
import { euro } from "./format"

/**
 * Pagina di conferma (12.7): il codice `PRV-…` dall'indirizzo e, dalla sessione del
 * browser, il riepilogo dell'invio con i collegamenti al PDF e alla pagina del cliente
 * (il token non è mai nell'indirizzo di questa pagina).
 */
export function ThankYou({ storage }: { storage?: Storage }) {
  const [submitted, setSubmitted] = React.useState<SubmittedSummary | null>(null)
  const code = useSearchParams()?.get("c") ?? null
  React.useEffect(() => {
    const s = readSubmitted(storage ?? sessionStorage)
    setSubmitted(s)
    // richiesta inviata: il prossimo preventivo riparte da zero (il riepilogo dell'invio resta)
    if (s && s.code === code) clearAnswers(storage ?? sessionStorage)
  }, [storage, code])
  const mine = submitted && submitted.code === code ? submitted : null

  return (
    <div className="site-container max-w-3xl py-12 sm:py-16">
      <CheckCircle2 className="h-14 w-14 text-primary" aria-hidden="true" />
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.14em] text-[hsl(var(--site-gold-ink))]">Richiesta inviata</p>
      <h1 className="site-display mt-2 text-[clamp(2.2rem,1.6rem+2.4vw,3.4rem)] leading-tight">Grazie! Abbiamo ricevuto la tua richiesta</h1>
      {code && (
        <p className="mt-6 text-lg">
          Il codice della tua richiesta è{" "}
          <strong className="site-display rounded-md bg-secondary px-2 py-0.5 text-[1.4rem] font-medium tracking-wide" data-testid="codice">
            {code}
          </strong>
          . Tienilo a portata di mano se ci chiami.
        </p>
      )}
      {mine && (
        <div className="mt-8 rounded-2xl border border-border bg-card p-6">
          <p className="site-display text-[1.5rem]">{mine.typologyTitle}</p>
          <p className="mt-1 text-muted-foreground">{mine.measures}</p>
          {mine.totalCents !== null ? (
            <p className="mt-4">
              Prezzo indicativo <strong className="site-display text-[1.6rem] font-medium text-[hsl(var(--site-gold-ink))]">{euro(mine.totalCents)}</strong>{" "}
              <span className="text-muted-foreground">IVA inclusa{mine.rangeCents ? ` (tra ${euro(mine.rangeCents[0])} e ${euro(mine.rangeCents[1])})` : ""}</span>
            </p>
          ) : (
            <p className="mt-4">Prezzo su richiesta: lo calcola il nostro ufficio.</p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={`/api/preventivo/${encodeURIComponent(mine.token)}/pdf`} className="site-btn site-btn-primary">
              <FileDown className="h-5 w-5" aria-hidden="true" /> Scarica il riepilogo PDF
            </a>
            <Link href={`/p/${encodeURIComponent(mine.token)}`} className="site-btn site-btn-quiet">
              Rivedi il riepilogo online
            </Link>
          </div>
          <p className="mt-4 text-[0.95rem] text-muted-foreground">Ti abbiamo mandato lo stesso riepilogo a {mine.email}.</p>
        </div>
      )}
      <h2 className="site-display mt-12 text-[1.6rem]">Cosa succede adesso</h2>
      <ol className="mt-4 space-y-4">
        {[
          "Il nostro ufficio controlla la tua richiesta, di solito entro due giorni lavorativi.",
          "Ti chiamiamo per fissare il sopralluogo gratuito e prendere le misure esatte.",
          "Ricevi il preventivo definitivo: decidi con calma, senza impegno.",
        ].map((t, i) => (
          <li key={t} className="flex gap-4">
            <span aria-hidden="true" className="site-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[hsl(var(--site-gold))] text-lg">
              {i + 1}
            </span>
            <span className="pt-1">{t}</span>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/" className="site-btn site-btn-quiet">
          Torna alla home
        </Link>
        <Link href="/contatti" className="site-btn site-btn-quiet">
          <Phone className="h-5 w-5" aria-hidden="true" /> Contattaci
        </Link>
      </div>
    </div>
  )
}
