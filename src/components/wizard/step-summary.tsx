"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2, Pencil } from "lucide-react"
import { planDeviations, type EnvelopePlan } from "@/domain/envelope/plan"
import { getTypology } from "@/domain/typologies/registry"
import { measureFields, stepPath, type WizardStep } from "./answers"
import { cm, euro } from "./format"
import { Preview3D } from "./preview-3d"
import { Notice, StepHeading } from "./ui"
import { useEstimate, type EstimateState } from "./use-estimate"
import { useWizard, useWizardContext } from "./wizard-context"

/**
 * Passo 5 (12.6, spec "Riepilogo con 3D e prezzo indicativo"): pergola in 3D (box,
 * dettaglio su richiesta), misure finali dopo adattamento, pianta con l'eventuale fuori
 * squadra, note semplici e prezzo indicativo dal server con fascia e voci principali.
 */
export function StepSummary() {
  const { data } = useWizardContext()
  const derived = useWizard((s) => s.derived)
  const answers = useWizard((s) => s.answers)
  const estimate = useEstimate()
  const typology = data.typologies.find((t) => t.slug === answers.tipologia.slug)
  const fields = React.useMemo(() => (answers.tipologia.slug ? measureFields(getTypology(answers.tipologia.slug)) : []), [answers.tipologia.slug])
  const params = derived.config?.params ?? {}
  const serverNotes = estimate.status === "ok" || estimate.status === "loading" ? estimate.notes : []
  const notes = [...new Set([...derived.notes, ...serverNotes])]

  return (
    <section aria-labelledby="passo-titolo">
      <StepHeading
        id="passo-titolo"
        eyebrow={typology ? `Passo 5 · ${typology.title}` : "Passo 5"}
        title="Ecco la tua pergola"
        intro="Eccola, con le misure adattate al tuo spazio e il prezzo indicativo. Se qualcosa non va, torna indietro e cambialo: il prezzo si aggiorna subito."
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:gap-14">
        <div className="min-w-0 space-y-8">
          {derived.prepared && derived.envelope ? (
            <Preview3D assembly={derived.prepared.assembly} envelope={derived.envelope} species={answers.finiture.species} title={typology?.title ?? "pergola"} />
          ) : (
            derived.error && <Notice tone="warning">{derived.error}</Notice>
          )}

          <MobilePrice estimate={estimate} />

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <SummaryTitle step="misure">Misure finali</SummaryTitle>
              <dl className="mt-3 space-y-2">
                {fields.map((f) => {
                  const v = params[f.param]
                  return (
                    <div key={f.key} className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{f.label}</dt>
                      <dd className="font-semibold tabular-nums">{typeof v === "number" ? cm(v / 10) : "—"}</dd>
                    </div>
                  )
                })}
                {derived.posts && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Pilastri</dt>
                    <dd className="font-semibold tabular-nums">{derived.posts.count}</dd>
                  </div>
                )}
              </dl>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <SummaryTitle step="spazio">Pianta</SummaryTitle>
              <PlanSketch plan={derived.plan} width={Number(params.larghezza ?? 0)} depth={Number(params.profondita ?? params.sbalzo ?? 0)} wall={answers.spazio.againstWall} />
            </div>
          </div>

          {notes.length > 0 && (
            <div>
              <h2 className="site-display text-[1.45rem]">Da sapere</h2>
              <ul className="mt-3 space-y-3">
                {notes.map((n) => (
                  <li key={n}>
                    <Notice tone={/verifica del nostro ufficio|non sta/.test(n) ? "warning" : "info"}>{n}</Notice>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <PriceCard estimate={estimate} />
      </div>
    </section>
  )
}

function SummaryTitle({ step, children }: { step: WizardStep; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--site-gold-ink))]">{children}</h2>
      <Link href={stepPath(step)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[0.95rem] underline-offset-4 hover:underline">
        <Pencil className="h-4 w-4" aria-hidden="true" /> Modifica<span className="sr-only"> {String(children).toLowerCase()}</span>
      </Link>
    </div>
  )
}

/** Pianta schematica: rettangolo o quadrilatero fuori squadra, muro in evidenza. */
function PlanSketch({ plan, width, depth, wall }: { plan: EnvelopePlan | null; width: number; depth: number; wall: boolean }) {
  const corners = plan
    ? plan.corners.map((c) => ({ x: c.x, y: c.y }))
    : [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: depth },
        { x: 0, y: depth },
      ]
  const maxX = Math.max(1, ...corners.map((c) => c.x))
  const maxY = Math.max(1, ...corners.map((c) => c.y))
  const s = Math.min(200 / maxX, 120 / maxY)
  // y verso il muro = in alto nel disegno
  const pts = corners.map((c) => [20 + c.x * s, 140 - c.y * s] as const)
  const dev = plan ? Math.abs(planDeviations(plan).maxCornerDeg) : 0
  return (
    <figure className="mt-3">
      <svg viewBox="0 0 240 160" className="w-full text-foreground" role="img" aria-label={dev >= 0.5 ? `Pianta fuori squadra di circa ${Math.round(dev)} gradi` : "Pianta in squadra"}>
        <polygon points={pts.map((p) => p.join(",")).join(" ")} fill="hsl(var(--primary) / 0.1)" stroke="currentColor" strokeWidth="1.5" />
        {wall && <line x1={pts[3]![0]} y1={pts[3]![1]} x2={pts[2]![0]} y2={pts[2]![1]} stroke="hsl(var(--site-gold))" strokeWidth="5" strokeLinecap="round" />}
      </svg>
      <figcaption className="mt-1 text-[0.95rem] text-muted-foreground">
        {wall ? "In oro il muro. " : ""}
        {dev >= 0.5 ? `Fuori squadra di circa ${Math.round(dev)}°.` : "In squadra."}
      </figcaption>
    </figure>
  )
}

/** Su telefono il prezzo compare subito sotto il 3D (la scheda completa è più in basso). */
function MobilePrice({ estimate }: { estimate: EstimateState }) {
  const quote = estimate.status === "ok" ? estimate.quote : estimate.status === "loading" ? estimate.quote : null
  return (
    <a href="#prezzo-titolo" className="flex items-center justify-between gap-4 rounded-2xl border-2 border-primary/30 bg-card px-5 py-4 lg:hidden">
      <span className="text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--site-gold-ink))]">Prezzo indicativo</span>
      <span className="site-display text-[1.7rem] leading-none tabular-nums">
        {quote && quote.status === "completo" ? euro(quote.totalCents) : estimate.status === "error" || quote?.status === "incompleto" ? "su richiesta" : "…"}
      </span>
    </a>
  )
}

/** Riga sul trasporto: per il CAP indicato al passo 3, oppure l'invito a indicarlo. */
function TransportLine({ cap }: { cap: string }) {
  const valid = /^\d{5}$/.test(cap.trim())
  return valid ? (
    <p className="mt-3 text-[0.95rem] text-muted-foreground" data-testid="trasporto-cap">
      Trasporto calcolato per il CAP {cap.trim()}.
    </p>
  ) : (
    <p className="mt-3 text-[0.95rem] text-muted-foreground" data-testid="trasporto-cap">
      Trasporto stimato senza CAP:{" "}
      <Link href={stepPath("spazio")} className="font-medium text-foreground underline underline-offset-4">
        indica il CAP del cantiere
      </Link>{" "}
      per un prezzo più preciso.
    </p>
  )
}

function PriceCard({ estimate }: { estimate: EstimateState }) {
  const cap = useWizard((s) => s.answers.contatti.cap)
  const quote = estimate.status === "ok" || estimate.status === "loading" ? (estimate.status === "ok" ? estimate.quote : estimate.quote) : null
  const loading = estimate.status === "loading" || estimate.status === "idle"
  return (
    <aside aria-labelledby="prezzo-titolo" className="lg:sticky lg:top-24 lg:self-start">
      <div className="overflow-hidden rounded-2xl border-2 border-primary/30 bg-card">
        <div className="site-grain h-2" aria-hidden="true" />
        <div className="p-6" aria-live="polite" aria-busy={loading}>
          <h2 id="prezzo-titolo" className="text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--site-gold-ink))]">
            Prezzo indicativo
          </h2>
          {estimate.status === "error" ? (
            <div className="mt-3">
              <p className="site-display text-[2rem] leading-tight">Prezzo su richiesta</p>
              <p className="mt-2 text-muted-foreground">{estimate.message}</p>
            </div>
          ) : quote && quote.status === "incompleto" ? (
            <div className="mt-3">
              <p className="site-display text-[2rem] leading-tight">Prezzo su richiesta</p>
              <p className="mt-2 text-muted-foreground">Alcune voci le calcola il nostro ufficio: inviaci la richiesta e ti rispondiamo con il preventivo.</p>
            </div>
          ) : quote ? (
            <>
              <p className={`site-display mt-2 text-[clamp(2.4rem,2rem+1.5vw,3.2rem)] leading-none tabular-nums transition-opacity ${loading ? "opacity-50" : ""}`} data-testid="totale">
                {euro(quote.totalCents)}
              </p>
              <p className="mt-2 text-muted-foreground">
                IVA inclusa · tra {euro(quote.range.minCents)} e {euro(quote.range.maxCents)}
              </p>
              <TransportLine cap={cap} />
              <ul className="mt-5 space-y-2 border-t border-border pt-4">
                {quote.groups
                  .filter((g) => g.amountCents !== 0)
                  .map((g) => (
                    <li key={g.id} className="flex justify-between gap-4">
                      <span>{g.label}</span>
                      <span className="tabular-nums text-muted-foreground">{euro(g.amountCents)}</span>
                    </li>
                  ))}
                {quote.discountCents !== 0 && (
                  <li className="flex justify-between gap-4">
                    <span>Sconti</span>
                    <span className="tabular-nums text-muted-foreground">{euro(quote.discountCents)}</span>
                  </li>
                )}
                <li className="flex justify-between gap-4 text-[0.95rem] text-muted-foreground">
                  <span>di cui IVA {quote.vatPct}%</span>
                  <span className="tabular-nums">{euro(quote.vatCents)}</span>
                </li>
              </ul>
            </>
          ) : null}
          {loading && (
            <p className="mt-3 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> calcolo…
            </p>
          )}
          {quote && quote.notes.length > 0 && (
            <ul className="mt-4 space-y-1 text-[0.92rem] text-muted-foreground">
              {quote.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <p className="mt-5 text-[0.95rem] text-muted-foreground">Prezzo indicativo, da confermare con il sopralluogo gratuito. Nessun impegno.</p>
        </div>
      </div>
    </aside>
  )
}
