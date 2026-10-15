"use client"

import * as React from "react"
import { AlertCircle, AlertTriangle, Database, Info } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatEuro, type CustomerQuote, type OfficeCutGroup, type OfficeView, type QuoteGroup } from "@/domain"
import { cn } from "@/lib/utils"
import { priceListLabel, ruleSetLabel } from "@/stores/catalog"
import { useConfiguratore } from "@/stores/use-configuratore"
import { cutsPerBar, formatMm, formatPct, groupBars, lineDetail, siteFactorRows } from "./pricing-helpers"

/**
 * Pannello "Preventivo" del configuratore interno (spec `configuratore-ui`, "Pannello
 * preventivo"): vista ufficio aggiornata a ogni modifica (righe per categoria con le
 * spiegazioni, totali e margini, piano di taglio per sezione con le barre e lo sfrido,
 * fattori di cantiere e complicazioni scattate, versione del listino, avvisi) e scheda
 * "Anteprima cliente" con la vista che riceverebbe il cliente.
 */

function Amount({ cents, className }: { cents: number; className?: string }) {
  return <span className={cn("whitespace-nowrap tabular-nums", className)}>{formatEuro(cents)}</span>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h4>
}

/** Versione di listino e regole con l'origine (archivio o default) e l'eventuale avviso. */
export function CatalogInfo() {
  const catalog = useConfiguratore((s) => s.catalog)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Badge variant="secondary" data-testid="price-list-version">
          {priceListLabel(catalog.priceListVersion)}
        </Badge>
        <Badge variant="outline">{ruleSetLabel(catalog.ruleSetVersion)}</Badge>
        <span className="inline-flex items-center gap-1 text-muted-foreground" data-testid="catalog-source">
          <Database className="h-3 w-3" />
          {catalog.loading ? "caricamento…" : catalog.source === "archivio" ? "archivio" : "dati di default"}
        </span>
      </div>
      {catalog.error && (
        <Alert className="py-2">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">{catalog.error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function GroupLines({ group }: { group: QuoteGroup }) {
  return (
    <ul className="space-y-2">
      {group.lines.map((l) => (
        <li key={l.code} data-line={l.code} className="rounded-md border px-3 py-2">
          <div className="flex items-start justify-between gap-2 text-sm">
            <span className="min-w-0">
              {l.label}
              {l.visibility === "ufficio" && (
                <Badge variant="outline" className="ml-1.5 px-1.5 py-0 text-[10px]">
                  ufficio
                </Badge>
              )}
            </span>
            <Amount cents={l.amountCents} className="font-medium" />
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{lineDetail(l)}</div>
          {l.explain.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-muted-foreground">
              {l.explain.map((e, i) => (
                <li key={i}>· {e}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

function BarsOf({ group }: { group: OfficeCutGroup }) {
  const rows = groupBars(group.bars)
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const cuts = cutsPerBar(r)
        return (
          <li key={r.key} data-bar={r.length} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                {r.count} × barra {formatMm(r.length)}
              </span>
              <span>
                tagli {cuts.map((c) => formatMm(c.length).replace(" mm", "")).join(" + ")} · {r.reusable ? "spezzone" : "sfrido"} {formatMm(r.offcut)}
              </span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-sm border bg-muted" aria-hidden>
              {cuts.map((c, i) => (
                <div key={`${c.id}-${i}`} title={`${c.id}: ${formatMm(c.length)}`} className="h-full border-r border-background bg-primary/70" style={{ width: `${(c.length / r.length) * 100}%` }} />
              ))}
              {r.offcut > 0 && (
                <div className={cn("h-full", r.reusable ? "bg-muted-foreground/30" : "bg-destructive/40")} style={{ width: `${(r.offcut / r.length) * 100}%` }} />
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Dettaglio del legno: per sezione barre consumate con i tagli e sfrido percentuale. */
export function CutPlanDetail({ cutPlan }: { cutPlan: OfficeView["cutPlan"] }) {
  return (
    <div className="space-y-4" data-testid="cut-plan">
      <p className="text-xs text-muted-foreground">
        Sfrido complessivo {formatPct(cutPlan.totals.wastePct)} · {cutPlan.totals.piecesVolumeM3.toFixed(3).replace(".", ",")} m³ di pezzi su{" "}
        {cutPlan.totals.barsVolumeM3.toFixed(3).replace(".", ",")} m³ di barre · <Amount cents={cutPlan.totals.costCents} />
      </p>
      {cutPlan.groups.map((g) => (
        <section key={g.key} data-cut-group={g.sectionLabel} className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">Sezione {g.sectionLabel}</span>
            <span className="flex items-center gap-2 text-xs">
              <Badge variant="secondary" className="px-1.5 py-0" data-testid="waste-pct">
                sfrido {formatPct(g.wastePct)}
              </Badge>
              <Amount cents={g.costCents} />
            </span>
          </div>
          <BarsOf group={g} />
          {g.nonRicavabili.length > 0 && (
            <p className="text-xs text-destructive">
              Non ricavabili: {g.nonRicavabili.map((d) => `${d.id} (${formatMm(d.length)})`).join(", ")}
            </p>
          )}
        </section>
      ))}
      {cutPlan.curved.length > 0 && (
        <p className="text-xs text-muted-foreground">Pezzi curvi (fuori piano di taglio): {cutPlan.curved.map((c) => `${c.id} ${c.sectionLabel}`).join(", ")}</p>
      )}
      <p className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-primary/70" /> pezzo</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-muted-foreground/30" /> spezzone riutilizzabile</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-destructive/40" /> sfrido</span>
      </p>
    </div>
  )
}

function OfficeQuote({ quote }: { quote: OfficeView }) {
  const t = quote.totals
  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-muted-foreground">Totale IVA inclusa</span>
          <Amount cents={t.totalCents} className="text-xl font-semibold" />
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Costi</dt>
          <dd className="text-right"><Amount cents={t.costCents} /></dd>
          <dt className="text-muted-foreground">Margini</dt>
          <dd className="text-right" data-testid="margin"><Amount cents={t.marginCents} /></dd>
          {t.discountCents !== 0 && (
            <>
              <dt className="text-muted-foreground">Sconti</dt>
              <dd className="text-right"><Amount cents={t.discountCents} /></dd>
            </>
          )}
          <dt className="text-muted-foreground">Imponibile</dt>
          <dd className="text-right"><Amount cents={t.taxableCents} /></dd>
          <dt className="text-muted-foreground">IVA {t.vatPct}%</dt>
          <dd className="text-right"><Amount cents={t.vatCents} /></dd>
        </dl>
      </div>

      {quote.warnings.length > 0 && (
        <ul className="space-y-1.5" aria-label="Avvisi del preventivo">
          {quote.warnings.map((w, i) => (
            <li key={`${w.code}-${w.ref ?? i}`} className="flex items-start gap-2 text-xs">
              {w.blocking ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      )}

      <Accordion type="multiple" className="w-full">
        {quote.groups.map((g) => (
          <AccordionItem key={g.category} value={g.category} data-group={g.category}>
            <AccordionTrigger className="py-2 text-sm hover:no-underline">
              <span className="flex flex-1 items-center justify-between gap-2 pr-2">
                <span>{g.label}</span>
                <Amount cents={g.amountCents} className="text-xs font-normal text-muted-foreground" />
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <GroupLines group={g} />
            </AccordionContent>
          </AccordionItem>
        ))}
        <AccordionItem value="dettaglio-legno">
          <AccordionTrigger className="py-2 text-sm hover:no-underline">Dettaglio legno e piano di taglio</AccordionTrigger>
          <AccordionContent>
            <CutPlanDetail cutPlan={quote.cutPlan} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="cantiere" className="border-b-0">
          <AccordionTrigger className="py-2 text-sm hover:no-underline">
            <span className="flex flex-1 items-center justify-between gap-2 pr-2">
              <span>Cantiere e complicazioni</span>
              {quote.firedRules.length > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {quote.firedRules.length}
                </Badge>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            {quote.firedRules.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nessuna complicazione scattata.</p>
            ) : (
              <ul className="space-y-2" aria-label="Complicazioni scattate">
                {quote.firedRules.map((r) => (
                  <li key={r.id} data-rule={r.id} className="rounded-md border px-3 py-2">
                    <div className="flex items-start justify-between gap-2 text-sm">
                      <span>{r.label}</span>
                      <Amount cents={r.amountCents} className="font-medium" />
                    </div>
                    <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                      {r.explain.map((e, i) => (
                        <li key={i}>· {e}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            <SectionTitle>Fattori di cantiere</SectionTitle>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs">
              {siteFactorRows(quote.siteFactors).map((f) => (
                <React.Fragment key={f.key}>
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="text-right tabular-nums" data-factor={f.key}>{f.value}</dd>
                </React.Fragment>
              ))}
            </dl>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

/** Vista cliente: poche voci con i margini già distribuiti, IVA, totale e fascia (stessa del sito). */
export function CustomerPreview({ quote }: { quote: CustomerQuote }) {
  return (
    <div className="space-y-3" data-testid="customer-preview">
      {quote.status === "incompleto" && <p className="text-sm font-medium">Prezzo su richiesta</p>}
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
        {quote.groups.map((g) => (
          <React.Fragment key={g.id}>
            <dt>{g.label}</dt>
            <dd className="text-right"><Amount cents={g.amountCents} /></dd>
          </React.Fragment>
        ))}
        {quote.discountCents !== 0 && (
          <>
            <dt>Sconto</dt>
            <dd className="text-right"><Amount cents={quote.discountCents} /></dd>
          </>
        )}
        {quote.minimumAdjustmentCents > 0 && (
          <>
            <dt>Adeguamento al minimo d&apos;ordine</dt>
            <dd className="text-right"><Amount cents={quote.minimumAdjustmentCents} /></dd>
          </>
        )}
        <dt className="border-t pt-1.5 text-muted-foreground">Imponibile</dt>
        <dd className="border-t pt-1.5 text-right"><Amount cents={quote.taxableCents} /></dd>
        <dt className="text-muted-foreground">IVA {quote.vatPct}%</dt>
        <dd className="text-right"><Amount cents={quote.vatCents} /></dd>
        {quote.roundingCents !== 0 && (
          <>
            <dt className="text-muted-foreground">Arrotondamento</dt>
            <dd className="text-right"><Amount cents={quote.roundingCents} /></dd>
          </>
        )}
        <dt className="border-t pt-1.5 font-semibold">Totale IVA inclusa</dt>
        <dd className="border-t pt-1.5 text-right font-semibold" data-testid="customer-total"><Amount cents={quote.totalCents} /></dd>
      </dl>
      <p className="text-xs text-muted-foreground">
        Fascia indicativa (±{quote.range.pct}%): <Amount cents={quote.range.minCents} /> – <Amount cents={quote.range.maxCents} />
      </p>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {quote.notes.map((n, i) => (
          <li key={i}>· {n}</li>
        ))}
      </ul>
    </div>
  )
}

/** Totale del preventivo corrente per l'intestazione del pannello. */
export function QuoteTotalBadge() {
  const total = useConfiguratore((s) => s.derived.quote?.totals.totalCents)
  const status = useConfiguratore((s) => s.derived.quote?.status)
  if (total === undefined) return null
  return (
    <Badge variant={status === "incompleto" ? "destructive" : "secondary"} data-testid="quote-total-badge">
      {formatEuro(total)}
    </Badge>
  )
}

export function PricingPanel() {
  const quote = useConfiguratore((s) => s.derived.quote)
  const customerQuote = useConfiguratore((s) => s.derived.customerQuote)
  const quoteError = useConfiguratore((s) => s.derived.quoteError)
  const stale = useConfiguratore((s) => s.derived.stale)
  const [tab, setTab] = React.useState("ufficio")

  return (
    <div className="space-y-3">
      <CatalogInfo />
      {quoteError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Preventivo non calcolabile</AlertTitle>
          <AlertDescription className="text-xs">{quoteError}</AlertDescription>
        </Alert>
      )}
      {quote?.status === "incompleto" && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Preventivo incompleto</AlertTitle>
          <AlertDescription className="text-xs">Mancano prezzi o tariffe: il cliente vedrebbe &quot;prezzo su richiesta&quot;.</AlertDescription>
        </Alert>
      )}
      {stale && quote && <p className="text-xs text-muted-foreground">Preventivo dell&apos;ultimo assieme valido.</p>}
      {!quote ? (
        !quoteError && <p className="text-sm text-muted-foreground">Nessun assieme da prezzare.</p>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ufficio">Vista ufficio</TabsTrigger>
            <TabsTrigger value="cliente">Anteprima cliente</TabsTrigger>
          </TabsList>
          <TabsContent value="ufficio" className="mt-3">
            <OfficeQuote quote={quote} />
          </TabsContent>
          <TabsContent value="cliente" className="mt-3">
            {customerQuote && <CustomerPreview quote={customerQuote} />}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
