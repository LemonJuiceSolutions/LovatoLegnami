"use client"

import * as React from "react"
import { AlertCircle, AlertTriangle, CheckCircle2, Maximize2, Ruler, Wand2, Wrench } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { selectErrors, selectHardwareRows, selectWarnings } from "@/stores/configuratore-store"
import { configuratoreStore, useConfiguratore } from "@/stores/use-configuratore"
import { reviewAutoSize, reviewFit, type Review } from "./results-helpers"

/**
 * Pannello esiti (spec `configuratore-ui`, "Pannello esiti"): violazioni per
 * severità e collisioni con i pezzi coinvolti (clic = selezione nello store),
 * "Auto-dimensiona" e "Adatta all'ingombro" con riepilogo delle modifiche da
 * confermare; se non c'è soluzione mostra la causa e non modifica il form.
 * Sezione "Ferramenta" (tipologie estese): codice, descrizione, quantità; il
 * clic su una riga seleziona i pezzi collegati.
 */

function sameIds(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

function IssueItem({
  pieceIds,
  message,
  tone,
}: {
  pieceIds: readonly string[]
  message: string
  tone: "error" | "warning"
}) {
  const selection = useConfiguratore((s) => s.selection)
  const selectPieces = useConfiguratore((s) => s.selectPieces)
  const active = pieceIds.length > 0 && sameIds(selection, pieceIds)
  const Icon = tone === "error" ? AlertCircle : AlertTriangle

  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        disabled={pieceIds.length === 0}
        onClick={() => selectPieces(active ? [] : pieceIds)}
        className={cn(
          "flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent",
          active && "border-primary bg-accent"
        )}
      >
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "error" ? "text-destructive" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1">
          <span className="block">{message}</span>
          {pieceIds.length > 0 && (
            <span className="mt-1 block text-xs text-muted-foreground">Pezzi: {pieceIds.join(", ")}</span>
          )}
        </span>
      </button>
    </li>
  )
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {count}
        </Badge>
      </h4>
      <ul className="space-y-2">{children}</ul>
    </section>
  )
}

const quantityFormat = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 })

/** Sezione "Ferramenta": righe raggruppate per codice; clic = selezione dei pezzi collegati. */
export function HardwareTable() {
  const rows = useConfiguratore(selectHardwareRows)
  const selection = useConfiguratore((s) => s.selection)
  const selectPieces = useConfiguratore((s) => s.selectPieces)
  if (rows.length === 0) return null
  return (
    <section className="space-y-2" aria-label="Ferramenta">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Wrench className="h-3.5 w-3.5" />
        Ferramenta
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {rows.length}
        </Badge>
      </h4>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Codice</th>
              <th className="px-3 py-2 text-left font-medium">Descrizione</th>
              <th className="px-3 py-2 text-right font-medium">Q.tà</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const active = r.pieceIds.length > 0 && sameIds(selection, r.pieceIds)
              const toggle = () => selectPieces(active ? [] : r.pieceIds)
              return (
                <tr
                  key={r.code}
                  data-hardware={r.code}
                  title={r.pieceIds.length > 0 ? `Pezzi: ${r.pieceIds.join(", ")}` : undefined}
                  onClick={r.pieceIds.length > 0 ? toggle : undefined}
                  className={cn(
                    "border-t align-top transition-colors",
                    r.pieceIds.length > 0 && "cursor-pointer hover:bg-accent",
                    active && "bg-accent"
                  )}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      aria-pressed={active}
                      disabled={r.pieceIds.length === 0}
                      aria-label={`Seleziona i pezzi di ${r.code}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle()
                      }}
                      className="break-all text-left font-mono text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:no-underline"
                    >
                      {r.code}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.description}
                    {r.pieceIds.length > 0 && <span className="mt-0.5 block text-muted-foreground">{r.pieceIds.length} pezzi collegati</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{quantityFormat.format(r.quantity)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function ReviewDialog({
  review,
  onOpenChange,
  onApply,
}: {
  review: Review | null
  onOpenChange: (open: boolean) => void
  onApply: (patch: Readonly<Record<string, string | number | boolean>>) => void
}) {
  const hasChanges = review?.kind === "changes" && review.changes.length > 0
  return (
    <Dialog open={review !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        {review && (
          <>
            <DialogHeader>
              <DialogTitle>{review.title}</DialogTitle>
              <DialogDescription>
                {review.kind === "none"
                  ? review.message
                  : hasChanges
                    ? "Verifica le modifiche proposte prima di applicarle al form."
                    : "Nessuna modifica necessaria: i parametri sono già quelli proposti."}
              </DialogDescription>
            </DialogHeader>

            {review.kind === "changes" && hasChanges && (
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Parametro</th>
                      <th className="px-3 py-2 text-left font-medium">Attuale</th>
                      <th className="px-3 py-2 text-left font-medium">Proposto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.changes.map((c) => (
                      <tr key={c.param} className="border-t" data-change={c.param}>
                        <td className="px-3 py-2">{c.label}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.from}</td>
                        <td className="px-3 py-2 font-medium">{c.to}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(review.kind === "changes" ? review.notes : review.causes).length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {(review.kind === "changes" ? review.notes : review.causes).map((n, i) => (
                  <li key={i}>• {n}</li>
                ))}
              </ul>
            )}

            <DialogFooter>
              {review.kind === "changes" && hasChanges ? (
                <>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Annulla
                  </Button>
                  <Button
                    onClick={() => {
                      onApply(review.patch)
                      onOpenChange(false)
                    }}
                  >
                    Applica modifiche
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Chiudi
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function ResultsPanel() {
  const errors = useConfiguratore(selectErrors)
  const warnings = useConfiguratore(selectWarnings)
  const collisions = useConfiguratore((s) => s.derived.collisions)
  const stale = useConfiguratore((s) => s.derived.stale)
  const generationError = useConfiguratore((s) => s.derived.error)
  const obstacles = useConfiguratore((s) => s.config.envelope.obstacles)
  const setParams = useConfiguratore((s) => s.setParams)
  const [review, setReview] = React.useState<Review | null>(null)

  const obstacleLabel = (id: string) => obstacles.find((x) => x.id === id)?.label

  const total = errors.length + warnings.length + collisions.length
  // Le proposte sono calcolate al clic sullo stato corrente (fitToEnvelope rigenera più assiemi).
  const open = (fn: () => Review) => setReview(fn())

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={stale}
          onClick={() =>
            open(() => {
              const s = configuratoreStore.getState()
              return reviewAutoSize(s.config, s.derived.assembly)
            })
          }
        >
          <Wand2 className="mr-1.5 h-4 w-4 shrink-0" />
          Auto-dimensiona
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={stale}
          onClick={() => open(() => reviewFit(configuratoreStore.getState().config))}
        >
          <Maximize2 className="mr-1.5 h-4 w-4 shrink-0" />
          Adatta all&apos;ingombro
        </Button>
      </div>

      {generationError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Generazione non riuscita</AlertTitle>
          <AlertDescription className="text-xs">{generationError}</AlertDescription>
        </Alert>
      )}

      {stale && !generationError && (
        <p className="text-xs text-muted-foreground">
          Esiti dell&apos;ultimo assieme valido: correggi i parametri evidenziati per aggiornarli.
        </p>
      )}

      {total === 0 && !generationError ? (
        <div className="flex items-center gap-2 rounded-md border px-3 py-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          Nessuna violazione né collisione.
        </div>
      ) : (
        <div className="space-y-4">
          <Group title="Errori" count={errors.length}>
            {errors.map((v, i) => (
              <IssueItem key={`${v.ruleId}-${i}`} pieceIds={v.pieceIds} message={v.message} tone="error" />
            ))}
          </Group>
          <Group title="Collisioni" count={collisions.length}>
            {collisions.map((c, i) => (
              <IssueItem
                key={`${c.pieceId}-${c.obstacleId}-${i}`}
                pieceIds={[c.pieceId]}
                message={obstacleLabel(c.obstacleId) ? `${c.message} — ${obstacleLabel(c.obstacleId)}` : c.message}
                tone="error"
              />
            ))}
          </Group>
          <Group title="Avvisi" count={warnings.length}>
            {warnings.map((v, i) => (
              <IssueItem key={`${v.ruleId}-${i}`} pieceIds={v.pieceIds} message={v.message} tone="warning" />
            ))}
          </Group>
        </div>
      )}

      <HardwareTable />

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Ruler className="h-3.5 w-3.5" />
        Clic su una voce per selezionare i pezzi coinvolti.
      </p>

      <ReviewDialog review={review} onOpenChange={(o) => !o && setReview(null)} onApply={(patch) => setParams(patch)} />
    </div>
  )
}
