"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DATASET_LABELS, type DatasetStatusInfo } from "./types"

/** "Bozza v4 – modificata da Lucia Bianchi il 15/10/2026, 10:32". */
export function draftLabel(draft: NonNullable<DatasetStatusInfo["draft"]>): string {
  return `Bozza v${draft.version} – modificata da ${draft.by ?? "utente sconosciuto"} il ${draft.at}`
}

/** "Attiva v3 – in vigore dal 2026-01-01". */
export function activeLabel(active: NonNullable<DatasetStatusInfo["active"]>): string {
  return `Attiva v${active.version} – in vigore dal ${active.effectiveFrom}`
}

/**
 * Stato di un insieme di dati (spec `back-office-admin`: ogni sezione indica versione
 * attiva e bozza in corso con autore e data) con il pulsante "Pubblica" se c'è una bozza
 * e l'utente può pubblicarla.
 */
export function DatasetStatusBar({
  status,
  canPublish,
  onPublish,
  title,
}: {
  status: DatasetStatusInfo
  canPublish: boolean
  onPublish?: () => void
  title?: string
}) {
  const { active, draft } = status
  return (
    <section aria-label={`Stato ${title ?? DATASET_LABELS[status.dataset]}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-4 py-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title ?? DATASET_LABELS[status.dataset]}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {active ? (
            <span>
              <Badge variant="secondary" className="mr-2">attiva</Badge>
              {activeLabel(active)}
            </span>
          ) : (
            <span className="text-muted-foreground">Nessuna versione attiva</span>
          )}
        </div>
        {draft ? (
          <div className="text-sm">
            <Badge variant="outline" className="mr-2 border-amber-500 text-amber-700 dark:text-amber-400">bozza</Badge>
            {draftLabel(draft)}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nessuna bozza in corso: la prima modifica salvata crea la bozza.</p>
        )}
      </div>
      {draft && canPublish && (
        <Button type="button" onClick={onPublish}>
          Pubblica
        </Button>
      )}
    </section>
  )
}
