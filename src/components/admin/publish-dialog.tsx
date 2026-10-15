"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { ActionResult } from "@/server/actions/result"
import type { PublishOutcome, PublishPreview } from "@/server/actions/publish"
import { DiffList } from "./diff-list"
import { DATASET_LABELS, type DatasetStatusInfo } from "./types"

/**
 * Dialogo "Pubblica" (9.4): differenze tra bozza e versione in vigore (campo, prima,
 * dopo), esito delle prove, data di validità e note; la pubblicazione è confermata qui.
 */

export type LoadPreviewFn = (dataset: DatasetStatusInfo["dataset"]) => Promise<ActionResult<PublishPreview>>
export type PublishFn = (input: { dataset: DatasetStatusInfo["dataset"]; effectiveFrom: string; notes: string | null; expectedUpdatedAt: string }) => Promise<ActionResult<PublishOutcome>>

const defaultLoad: LoadPreviewFn = async (d) => (await import("@/server/actions/publish")).getPublishPreview(d)
const defaultPublish: PublishFn = async (input) => (await import("@/server/actions/publish")).publishDataset(input)

export function PublishDialog({
  status,
  open,
  onOpenChange,
  loadPreview = defaultLoad,
  publish = defaultPublish,
  onPublished,
}: {
  status: DatasetStatusInfo
  open: boolean
  onOpenChange: (open: boolean) => void
  loadPreview?: LoadPreviewFn
  publish?: PublishFn
  onPublished?: (outcome: PublishOutcome) => void
}) {
  const router = useRouter()
  const [preview, setPreview] = React.useState<PublishPreview | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [effectiveFrom, setEffectiveFrom] = React.useState(status.draft?.effectiveFrom ?? "")
  const [notes, setNotes] = React.useState(status.draft?.notes ?? "")
  const [done, setDone] = React.useState<PublishOutcome | null>(null)
  const [pending, start] = React.useTransition()
  const label = DATASET_LABELS[status.dataset]

  React.useEffect(() => {
    if (!open) return
    let alive = true
    setPreview(null)
    setError(null)
    setDone(null)
    setEffectiveFrom(status.draft?.effectiveFrom ?? "")
    setNotes(status.draft?.notes ?? "")
    loadPreview(status.dataset).then((r) => {
      if (!alive) return
      if (r.ok) setPreview(r.data)
      else setError(r.message)
    })
    return () => {
      alive = false
    }
    // si ricarica a ogni apertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const lock = preview?.status.draft?.updatedAt ?? status.draft?.updatedAt
  const blocked = !preview || preview.blocking.length > 0
  const confirm = () => {
    if (!lock || blocked) return
    start(async () => {
      const r = await publish({ dataset: status.dataset, effectiveFrom, notes: notes.trim() || null, expectedUpdatedAt: lock })
      if (!r.ok) return setError(r.message)
      setDone(r.data)
      onPublished?.(r.data)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Pubblica {label} v{status.draft?.version}
          </DialogTitle>
          <DialogDescription>La bozza diventa la versione in vigore dalla data indicata; la versione attiva con la stessa data passa in archivio.</DialogDescription>
        </DialogHeader>
        {done ? (
          <div role="status" className="space-y-2 text-sm">
            <p>
              Pubblicata la v{done.version}
              {done.archivedVersion ? `; la v${done.archivedVersion} è archiviata.` : "."}
            </p>
            {done.warnings.map((w) => (
              <p key={w} className="text-muted-foreground">
                {w}
              </p>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {!preview && !error && <p className="text-sm text-muted-foreground">Calcolo delle differenze e prove in corso…</p>}
            {preview && (
              <section aria-label="Differenze" className="space-y-2">
                <h3 className="text-sm font-semibold">
                  {preview.totalDiff === 0 ? "Nessuna differenza rispetto alla versione in vigore" : preview.totalDiff === 1 ? "1 differenza" : `${preview.totalDiff} differenze`}
                  {preview.totalDiff > preview.diff.length && ` (mostrate le prime ${preview.diff.length})`}
                </h3>
                <DiffList diff={preview.diff} />
              </section>
            )}
            {preview && preview.blocking.length > 0 && (
              <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
                <p className="font-medium">La bozza non può essere pubblicata:</p>
                <ul className="list-disc pl-5">
                  {preview.blocking.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview && preview.warnings.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">In vigore dal</span>
                <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} required />
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="font-medium">Note</span>
                <textarea
                  className="min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {done ? "Chiudi" : "Annulla"}
          </Button>
          {!done && (
            <Button type="button" onClick={confirm} disabled={blocked || pending || !effectiveFrom}>
              {pending ? "Pubblicazione…" : `Pubblica v${status.draft?.version}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
