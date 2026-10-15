import Link from "next/link"
import { FileDown, Phone, Mail } from "lucide-react"
import type { CustomerSummary } from "@/server/quotes/customer-summary"
import { cm, euro } from "./format"

/**
 * Pagina del cliente `/p/[token]` (12.8): riepilogo del preventivo dall'istantanea con il
 * PDF; senza riepilogo (collegamento scaduto o non valido) l'invito a contattare l'ufficio.
 * Componente server puro (nessuno stato), testato con i dati.
 */

const DATE = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" })

export function CustomerSummaryView({ summary, phone, email }: { summary: CustomerSummary | null; phone: string; email: string }) {
  if (!summary)
    return (
      <div className="site-container max-w-2xl py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[hsl(var(--site-gold-ink))]">Collegamento non valido</p>
        <h1 className="site-display mt-2 text-[clamp(2rem,1.6rem+2vw,3rem)] leading-tight">Questo collegamento è scaduto</h1>
        <p className="mt-4 text-lg text-foreground/80">
          Per motivi di riservatezza il riepilogo resta online per 90 giorni. Contatta il nostro ufficio: ti rimandiamo volentieri il preventivo.
        </p>
        <ContactButtons phone={phone} email={email} />
      </div>
    )
  const q = summary.quote
  return (
    <div className="site-container max-w-4xl py-12 sm:py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[hsl(var(--site-gold-ink))]">
        {summary.kind === "definitivo" ? "Preventivo" : "Preventivo indicativo"} {summary.code} · {DATE.format(new Date(summary.createdAt))}
      </p>
      <h1 className="site-display mt-2 text-[clamp(2rem,1.6rem+2vw,3rem)] leading-tight">
        {summary.firstName ? `${summary.firstName}, ecco` : "Ecco"} la tua {summary.typologyTitle.toLowerCase().startsWith("pergola") ? "" : "pergola "}
        {summary.typologyTitle}
      </h1>
      <div className="mt-10 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-6">
          {summary.measures.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-6" aria-labelledby="misure-titolo">
              <h2 id="misure-titolo" className="text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--site-gold-ink))]">
                Misure
              </h2>
              <dl className="mt-3 space-y-2">
                {summary.measures.map((m) => (
                  <div key={m.label} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{m.label}</dt>
                    <dd className="font-semibold tabular-nums">{cm(m.cm)}</dd>
                  </div>
                ))}
              </dl>
              {summary.outOfSquareDeg !== null && <p className="mt-3 text-muted-foreground">Muro fuori squadra di circa {summary.outOfSquareDeg}°.</p>}
            </section>
          )}
          {summary.notes.length > 0 && (
            <section aria-labelledby="note-titolo">
              <h2 id="note-titolo" className="site-display text-[1.4rem]">
                Da sapere
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                {summary.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <section className="rounded-2xl border-2 border-primary/30 bg-card p-6" aria-labelledby="prezzo-titolo">
          <h2 id="prezzo-titolo" className="text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--site-gold-ink))]">
            {summary.kind === "definitivo" ? "Prezzo" : "Prezzo indicativo"}
          </h2>
          {q.status === "completo" ? (
            <>
              <p className="site-display mt-2 text-[2.6rem] leading-none tabular-nums">{euro(q.totalCents)}</p>
              <p className="mt-2 text-muted-foreground">
                IVA inclusa{summary.kind === "indicativo" ? ` · tra ${euro(q.range.minCents)} e ${euro(q.range.maxCents)}` : ""}
              </p>
              <ul className="mt-4 space-y-2 border-t border-border pt-4">
                {q.groups
                  .filter((g) => g.amountCents !== 0)
                  .map((g) => (
                    <li key={g.id} className="flex justify-between gap-4">
                      <span>{g.label}</span>
                      <span className="tabular-nums text-muted-foreground">{euro(g.amountCents)}</span>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p className="site-display mt-2 text-[1.8rem]">Prezzo su richiesta</p>
          )}
          {q.notes.length > 0 && (
            <ul className="mt-4 space-y-1 text-[0.92rem] text-muted-foreground">
              {q.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <a href={summary.pdfUrl} className="site-btn site-btn-primary mt-6 w-full">
            <FileDown className="h-5 w-5" aria-hidden="true" /> Scarica il PDF
          </a>
        </section>
      </div>
      <p className="mt-10 text-muted-foreground">Hai domande o vuoi cambiare qualcosa? Citaci il codice {summary.code}.</p>
      <ContactButtons phone={phone} email={email} />
    </div>
  )
}

function ContactButtons({ phone, email }: { phone: string; email: string }) {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <a href={`tel:${phone.replace(/\s+/g, "")}`} className="site-btn site-btn-primary">
        <Phone className="h-5 w-5" aria-hidden="true" /> Chiama {phone}
      </a>
      <a href={`mailto:${email}`} className="site-btn site-btn-quiet">
        <Mail className="h-5 w-5" aria-hidden="true" /> Scrivi una email
      </a>
      <Link href="/contatti" className="site-btn site-btn-quiet">
        Contatti
      </Link>
    </div>
  )
}
