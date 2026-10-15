"use client"

import * as React from "react"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, ExternalLink, FileSignature, Plus, Trash2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatEuro } from "@/domain"
import type { ActionResult } from "@/server/actions/result"
import type { FinalQuoteInput, FinalQuoteResult } from "@/server/quotes/final-quote"
import { serializeConfig } from "@/stores/config-file"
import { commercialOf } from "@/stores/config"
import { configuratoreStore, useConfiguratore } from "@/stores/use-configuratore"
import { finalQuotePreview, manualLinesOf, parseEuroInput, statusLabel, type FinalDiscount, type ManualLineDraft } from "./final-quote-helpers"
import { CustomerPreview } from "./pricing-panel"

/**
 * Intestazione della richiesta aperta nel configuratore (10.4, `/configuratore?richiesta=<id>`):
 * codice, cliente, stato, ultimo preventivo e collegamento all'area admin, con il pulsante
 * "Salva preventivo definitivo" (righe manuali, sconto, IVA, anteprima della vista cliente,
 * stato "preventivo inviato" ed email facoltativi).
 */

export interface RequestHeaderData {
  readonly id: string
  readonly code: string
  readonly customer: { readonly name: string; readonly email: string | null; readonly phone: string | null; readonly comune: string | null }
  readonly status: string
  readonly adminUrl: string
  readonly latestQuote: { readonly kind: "indicativo" | "definitivo"; readonly totalCents: number; readonly createdAt: string } | null
}

export type SaveFinalQuote = (input: FinalQuoteInput) => Promise<ActionResult<FinalQuoteResult>>

const defaultSave: SaveFinalQuote = async (input) => (await import("@/server/actions/final-quote")).saveFinalQuote(input)

const NO_DISCOUNT = "nessuno"

export function FinalQuoteDialog({
  request,
  open,
  onOpenChange,
  onSaved,
  save = defaultSave,
}: {
  request: RequestHeaderData
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (result: FinalQuoteResult) => void
  save?: SaveFinalQuote
}) {
  const catalog = useConfiguratore((s) => s.catalog)
  const assembly = useConfiguratore((s) => s.derived.assembly)
  const envelope = useConfiguratore((s) => s.config.envelope)
  const commercial = useConfiguratore((s) => s.config.commercial)
  const stale = useConfiguratore((s) => s.derived.stale)
  const [drafts, setDrafts] = React.useState<ManualLineDraft[]>([])
  const [discountKind, setDiscountKind] = React.useState<string>(NO_DISCOUNT)
  const [discountText, setDiscountText] = React.useState("")
  const [vat, setVat] = React.useState(catalog.priceList.defaultVat)
  const [markSent, setMarkSent] = React.useState(false)
  const [sendEmail, setSendEmail] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const manualLines = manualLinesOf(drafts)
  const discountValue = discountKind === "fisso" ? parseEuroInput(discountText) : Number(discountText.replace(",", "."))
  const discount: FinalDiscount | null =
    discountKind === NO_DISCOUNT || !discountValue || !Number.isFinite(discountValue) || discountValue <= 0
      ? null
      : { kind: discountKind as FinalDiscount["kind"], value: discountValue }
  const preview = React.useMemo(
    () => finalQuotePreview({ assembly, envelope, commercial: commercialOf({ commercial }), catalog, manualLines, discount, vat }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assembly, envelope, commercial, catalog, JSON.stringify(manualLines), discount?.kind, discount?.value, vat]
  )

  const setDraft = (i: number, patch: Partial<ManualLineDraft>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)))

  const submit = () => {
    setError(null)
    const config = JSON.parse(serializeConfig(configuratoreStore.getState().config))
    startTransition(async () => {
      const res = await save({ leadId: request.id, config, manualLines, discount, vat, markSent, sendEmail })
      if (res.ok) {
        onSaved(res.data)
        onOpenChange(false)
        setDrafts([])
      } else setError(res.message)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Preventivo definitivo {request.code}</DialogTitle>
          <DialogDescription>
            Configurazione corrente del configuratore, listino attivo, voci manuali, sconto e IVA. Il server ricalcola tutto al salvataggio.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Voci manuali</h4>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setDrafts((ds) => [...ds, { description: "", amount: "" }])}>
              <Plus className="mr-1 h-4 w-4" />
              Aggiungi voce
            </Button>
          </div>
          {drafts.length === 0 && <p className="text-xs text-muted-foreground">Nessuna voce manuale (es. smontaggio, opere murarie, extra concordati).</p>}
          {drafts.map((d, i) => {
            const amountInvalid = d.amount.trim() !== "" && parseEuroInput(d.amount) === undefined
            return (
              <div key={i} className="grid grid-cols-[1fr_140px_auto] items-end gap-2" data-manual-line={i}>
                <div className="space-y-1">
                  <Label htmlFor={`manual-${i}-desc`} className="text-xs">
                    Descrizione
                  </Label>
                  <Input id={`manual-${i}-desc`} className="h-9" value={d.description} maxLength={200} onChange={(e) => setDraft(i, { description: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`manual-${i}-amount`} className="text-xs">
                    Importo (€, IVA esclusa)
                  </Label>
                  <Input
                    id={`manual-${i}-amount`}
                    className="h-9"
                    inputMode="decimal"
                    value={d.amount}
                    aria-invalid={amountInvalid || undefined}
                    onChange={(e) => setDraft(i, { amount: e.target.value })}
                  />
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Rimuovi voce ${i + 1}`} onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )
          })}
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="final-discount-kind" className="text-xs">
              Sconto
            </Label>
            <Select value={discountKind} onValueChange={setDiscountKind}>
              <SelectTrigger id="final-discount-kind" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DISCOUNT}>Nessuno</SelectItem>
                <SelectItem value="percento">Percentuale</SelectItem>
                <SelectItem value="fisso">Importo fisso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="final-discount-value" className="text-xs">
              {discountKind === "fisso" ? "Sconto (€)" : "Sconto (%)"}
            </Label>
            <Input id="final-discount-value" className="h-9" inputMode="decimal" disabled={discountKind === NO_DISCOUNT} value={discountText} onChange={(e) => setDiscountText(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="final-vat" className="text-xs">
              IVA
            </Label>
            <Select value={vat} onValueChange={setVat}>
              <SelectTrigger id="final-vat" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catalog.priceList.vatRates.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="space-y-2 rounded-md border p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anteprima vista cliente</h4>
          {stale && <p className="text-xs text-destructive">La configurazione ha parametri non validi: l&apos;anteprima è dell&apos;ultimo assieme valido.</p>}
          {catalog.source !== "archivio" && <p className="text-xs text-muted-foreground">Anteprima con i dati di default: il salvataggio usa il listino attivo dell&apos;archivio.</p>}
          {preview ? <CustomerPreview quote={preview} /> : <p className="text-sm text-muted-foreground">Anteprima non disponibile.</p>}
        </section>

        <section className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={markSent} onCheckedChange={(v) => setMarkSent(v === true)} aria-label="Segna la richiesta come preventivo inviato" />
            Segna la richiesta come &quot;preventivo inviato&quot;
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={sendEmail} disabled={!request.customer.email} onCheckedChange={(v) => setSendEmail(v === true)} aria-label="Invia il preventivo al cliente" />
            Invia il preventivo al cliente con il PDF{request.customer.email ? ` (${request.customer.email})` : " (email assente)"}
          </label>
        </section>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={submit} disabled={pending || !assembly}>
            {pending ? "Salvataggio…" : "Salva preventivo definitivo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RequestHeader({ request, canSave, save }: { request: RequestHeaderData; canSave: boolean; save?: SaveFinalQuote }) {
  const [status, setStatus] = React.useState(request.status)
  const [latest, setLatest] = React.useState(request.latestQuote)
  const [open, setOpen] = React.useState(false)
  const [saved, setSaved] = React.useState<FinalQuoteResult | null>(null)

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="request-header">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{request.code}</span>
          <Badge variant="secondary" data-testid="request-status">
            {statusLabel(status)}
          </Badge>
          <span className="text-sm">{request.customer.name}</span>
          {request.customer.comune && <span className="text-xs text-muted-foreground">· {request.customer.comune}</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          {latest ? `Ultimo preventivo ${latest.kind}: ${formatEuro(latest.totalCents)}` : "Nessun preventivo salvato"}
          {saved && (
            <span className="ml-2 inline-flex items-center gap-1 text-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" /> Definitivo salvato{saved.emailQueued ? " e inviato al cliente" : ""}
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={request.adminUrl}>
            <ExternalLink className="mr-1.5 h-4 w-4" />
            Richiesta nell&apos;admin
          </Link>
        </Button>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!canSave} title={canSave ? undefined : "Operazione riservata al commerciale"}>
          <FileSignature className="mr-1.5 h-4 w-4" />
          Salva preventivo definitivo
        </Button>
      </div>
      <FinalQuoteDialog
        request={request}
        open={open}
        onOpenChange={setOpen}
        save={save}
        onSaved={(r) => {
          setSaved(r)
          setStatus(r.status)
          setLatest({ kind: "definitivo", totalCents: r.totalCents, createdAt: new Date().toISOString() })
        }}
      />
    </Card>
  )
}

/** Avviso per `?richiesta=` inesistente: il configuratore parte dalla configurazione predefinita. */
export function RequestNotice({ message }: { message: string }) {
  return (
    <Alert data-testid="request-missing">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Richiesta non trovata</AlertTitle>
      <AlertDescription className="text-xs">{message}</AlertDescription>
    </Alert>
  )
}
