"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { formatEuro } from "@/domain/pricing/money"
import type { ActionResult } from "@/server/actions/result"
import { LEAD_STATUS_LABELS, LEAD_STATUS_VALUES, type LeadDetailView, type LeadStatusValue } from "./types"

/**
 * Dettaglio di una richiesta (9.9): cliente, foto, configurazione, vista ufficio del
 * prezzo, cronologia ed email; azioni prendi in carico, cambia stato, apri nel
 * configuratore, reinvia email, scarica PDF e anonimizza (con conferma). I comandi non
 * permessi sono nascosti; il server ricontrolla ogni azione.
 */

export interface LeadActions {
  readonly take: (id: string) => Promise<ActionResult<unknown>>
  readonly changeStatus: (input: { leadId: string; to: LeadStatusValue; note?: string }) => Promise<ActionResult<unknown>>
  readonly resend: (id: string) => Promise<ActionResult<{ sent: number; failed: number }>>
  readonly anonymize: (id: string) => Promise<ActionResult<{ removedPhotos: number }>>
}

const serverActions: LeadActions = {
  take: async (id) => (await import("@/server/actions/leads")).takeLead(id),
  changeStatus: async (input) => (await import("@/server/actions/leads")).changeLeadStatus(input),
  resend: async (id) => (await import("@/server/actions/leads")).resendLeadEmails(id),
  anonymize: async (id) => (await import("@/server/actions/leads")).anonymizeLead(id),
}

export function LeadDetail({
  lead,
  canManage,
  canErase,
  currentUserId,
  actions = serverActions,
}: {
  lead: LeadDetailView
  canManage: boolean
  canErase: boolean
  currentUserId: string
  actions?: LeadActions
}) {
  const router = useRouter()
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [pending, start] = React.useTransition()
  const [to, setTo] = React.useState<LeadStatusValue>(lead.status)
  const [note, setNote] = React.useState("")
  const [confirmErase, setConfirmErase] = React.useState(false)

  const run = (fn: () => Promise<ActionResult<unknown>>, ok: (data: never) => string) =>
    start(async () => {
      const r = await fn()
      if (r.ok) {
        setMessage({ kind: "ok", text: ok(r.data as never) })
        router.refresh()
      } else setMessage({ kind: "error", text: r.message })
    })

  const o = lead.office
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold">{lead.code}</h1>
        <Badge>{LEAD_STATUS_LABELS[lead.status]}</Badge>
        <span className="text-sm text-muted-foreground">ricevuta il {lead.createdAt}</span>
        <span className="text-sm text-muted-foreground">assegnata a {lead.assignee ?? "nessuno"}</span>
        <Link className="ml-auto text-sm text-primary underline-offset-4 hover:underline" href="/admin/richieste">
          ← Tutte le richieste
        </Link>
      </div>

      <section aria-label="Azioni" className="flex flex-wrap items-end gap-2 rounded-md border p-3">
        {canManage && lead.assigneeId !== currentUserId && (
          <Button type="button" size="sm" disabled={pending} onClick={() => run(() => actions.take(lead.id), () => "Presa in carico")}>
            Prendi in carico
          </Button>
        )}
        {canManage && (
          <>
            <label className="space-y-1 text-xs">
              <span className="block">Nuovo stato</span>
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={to} onChange={(e) => setTo(e.target.value as LeadStatusValue)}>
                {LEAD_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="block">Nota</span>
              <Input className="h-9 w-56" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || to === lead.status}
              onClick={() => run(() => actions.changeStatus({ leadId: lead.id, to, ...(note.trim() ? { note: note.trim() } : {}) }), () => `Stato cambiato in «${LEAD_STATUS_LABELS[to]}»`)}
            >
              Cambia stato
            </Button>
          </>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href={`/configuratore?richiesta=${encodeURIComponent(lead.id)}`}>Apri nel configuratore</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={`/api/admin/richieste/${encodeURIComponent(lead.id)}/pdf`}>Scarica PDF</a>
        </Button>
        {canManage && !lead.anonymized && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => actions.resend(lead.id), (d: { sent: number; failed: number }) => `Email reinviate: ${d.sent} inviate, ${d.failed} da reinviare`)}
          >
            Reinvia email
          </Button>
        )}
        {canErase && !lead.anonymized && (
          <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => setConfirmErase(true)}>
            Anonimizza
          </Button>
        )}
        {message && (
          <span role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {message.text}
          </span>
        )}
      </section>
      <ConfirmDialog
        open={confirmErase}
        onOpenChange={setConfirmErase}
        title={`Anonimizzare ${lead.code}?`}
        description="Nome, contatti, note e foto del cliente vengono cancellati in modo definitivo. Configurazione, preventivi e cronologia restano."
        confirmLabel="Anonimizza"
        destructive
        loading={pending}
        onConfirm={() => {
          setConfirmErase(false)
          run(() => actions.anonymize(lead.id), (d: { removedPhotos: number }) => `Dati anonimizzati (${d.removedPhotos} file cancellati)`)
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lead.anonymized ? (
              <p className="text-muted-foreground">Dati personali anonimizzati.</p>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {lead.customer.map((f) => (
                  <React.Fragment key={f.label}>
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="break-all">{f.value}</dd>
                  </React.Fragment>
                ))}
              </dl>
            )}
            {lead.consent && <p className="text-xs text-muted-foreground">Consenso: {lead.consent}</p>}
            {lead.notes && <p className="whitespace-pre-wrap rounded bg-muted p-2">{lead.notes}</p>}
            {lead.photos.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Foto">
                {lead.photos.map((p, i) => (
                  <li key={p.id}>
                    <a href={`/api/uploads/${p.id}`} target="_blank" rel="noreferrer">
                      {/* file privati serviti con autorizzazione da /api/uploads */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/uploads/${p.id}`} alt={p.kind === "scena" ? "Immagine della configurazione" : `Foto del cliente ${i + 1}`} className="h-24 w-32 rounded object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Configurazione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lead.config ? (
              <>
                <p className="font-medium">{lead.config.typology}</p>
                {lead.config.envelope && <p className="text-muted-foreground">Spazio disponibile: {lead.config.envelope}</p>}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3">
                  {lead.config.params.map((p) => (
                    <div key={p.name} className="flex justify-between gap-2 border-b py-0.5">
                      <dt className="text-muted-foreground">{p.name}</dt>
                      <dd>{p.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="text-muted-foreground">Nessuna configurazione salvata.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Prezzo – vista ufficio {lead.quoteKind && <span className="text-sm font-normal text-muted-foreground">(preventivo {lead.quoteKind})</span>}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {o ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{o.versionLabel}</p>
              <table className="w-full text-xs">
                <tbody>
                  {o.groups.map((g) => (
                    <React.Fragment key={g.category}>
                      <tr className="bg-muted/60">
                        <th scope="rowgroup" colSpan={2} className="px-2 py-1 text-left font-medium">
                          {g.label}
                        </th>
                        <td className="px-2 py-1 text-right font-medium tabular-nums">{formatEuro(g.amountCents)}</td>
                      </tr>
                      {g.lines.map((l) => (
                        <tr key={l.code} className="border-t" title={l.explain.join("\n")}>
                          <td className="px-2 py-1">{l.label}</td>
                          <td className="px-2 py-1 text-right text-muted-foreground tabular-nums">
                            {String(l.quantity).replace(".", ",")} {l.unit}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">{formatEuro(l.amountCents)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                  <tr className="border-t font-semibold">
                    <td className="px-2 py-1" colSpan={2}>
                      Totale IVA inclusa
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatEuro(o.totals.totalCents)}</td>
                  </tr>
                </tbody>
              </table>
              {o.warnings.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-amber-700 dark:text-amber-400">
                  {o.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : lead.customerQuote ? (
            <p>Totale indicativo per il cliente: {formatEuro(lead.customerQuote.totalCents)}</p>
          ) : (
            <p className="text-muted-foreground">Nessun preventivo leggibile.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cronologia</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1 text-sm" aria-label="Cronologia degli stati">
              {lead.events.map((e, i) => (
                <li key={i} className="flex flex-wrap gap-x-2">
                  <span className="text-muted-foreground">{e.at}</span>
                  <span>
                    {e.from !== e.to ? `${e.from ? LEAD_STATUS_LABELS[e.from as LeadStatusValue] ?? e.from : "—"} → ${LEAD_STATUS_LABELS[e.to as LeadStatusValue] ?? e.to}` : ""}
                    {e.note ? `${e.from !== e.to ? " · " : ""}${e.note}` : ""}
                  </span>
                  {e.by && <span className="text-muted-foreground">({e.by})</span>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Email</CardTitle>
          </CardHeader>
          <CardContent>
            {lead.emails.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna email.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {lead.emails.map((m, i) => (
                  <li key={i}>
                    {m.template === "conferma-cliente" ? "Conferma al cliente" : "Notifica all'ufficio"}: <strong>{m.status}</strong> ({m.attempts} tentativi)
                    {m.lastError && <span className="block text-xs text-destructive">{m.lastError}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
