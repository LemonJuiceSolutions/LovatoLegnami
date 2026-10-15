"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Actor } from "@/server/auth/permissions"
import { canPublishDataset, DATASET_HREF } from "./admin-nav"
import { DatasetStatusBar } from "./dataset-status"
import { PublishDialog } from "./publish-dialog"
import type { DatasetStatusInfo } from "./types"

/**
 * Riepilogo dell'area admin (9.1): stato di ogni insieme di dati (attiva, bozza con autore e
 * data, "Pubblica" con il dialogo delle differenze) e richieste nuove.
 */
export function AdminOverview({
  user,
  datasets,
  newLeads,
  onPublish,
}: {
  user: Actor
  datasets: readonly DatasetStatusInfo[]
  /** `null` se l'utente non legge le richieste. */
  newLeads: number | null
  /** Iniettabile nei test; default: dialogo di pubblicazione. */
  onPublish?: (dataset: DatasetStatusInfo["dataset"]) => void
}) {
  const [publishing, setPublishing] = React.useState<DatasetStatusInfo | null>(null)
  const [open, setOpen] = React.useState(false)
  const publish =
    onPublish ??
    ((d: DatasetStatusInfo["dataset"]) => {
      setPublishing(datasets.find((s) => s.dataset === d) ?? null)
      setOpen(true)
    })
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Area admin</h1>
      {newLeads !== null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Richieste</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-2 text-sm">
            <span>
              {newLeads === 0 ? "Nessuna richiesta nuova" : newLeads === 1 ? "1 richiesta nuova da prendere in carico" : `${newLeads} richieste nuove da prendere in carico`}
            </span>
            <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/admin/richieste?status=nuovo">
              Apri le richieste
            </Link>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {datasets.map((s) => (
          <div key={s.dataset} className="space-y-1">
            <DatasetStatusBar status={s} canPublish={canPublishDataset(user, s.dataset)} onPublish={() => publish(s.dataset)} />
            {canPublishDataset(user, s.dataset) && (
              <Link className="ml-1 text-xs text-primary underline-offset-4 hover:underline" href={DATASET_HREF[s.dataset]}>
                Modifica
              </Link>
            )}
          </div>
        ))}
      </div>
      {publishing?.draft && <PublishDialog status={publishing} open={open} onOpenChange={setOpen} />}
    </div>
  )
}
