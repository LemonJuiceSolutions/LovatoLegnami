"use client"

import * as React from "react"
import { DatasetStatusBar } from "./dataset-status"
import { DraftProvider, useDraft } from "./draft-context"
import { PublishDialog } from "./publish-dialog"
import type { DatasetStatusInfo } from "./types"

/**
 * Guscio comune degli editor dei dataset: bozza condivisa (`DraftProvider`), barra di
 * stato con "Pubblica" (dialogo con differenze e prove, 9.4) e il contenuto della sezione.
 */
export function DatasetEditorShell({
  status,
  title,
  canPublish,
  children,
}: {
  status: DatasetStatusInfo
  title?: string
  canPublish: boolean
  children: React.ReactNode
}) {
  return (
    <DraftProvider status={status}>
      <StatusWithPublish title={title} canPublish={canPublish} />
      <div className="space-y-4">{children}</div>
    </DraftProvider>
  )
}

function StatusWithPublish({ title, canPublish }: { title?: string; canPublish: boolean }) {
  const { status } = useDraft()
  const [open, setOpen] = React.useState(false)
  // stato al momento dell'apertura: il dialogo resta visibile con l'esito anche dopo il refresh
  const [snapshot, setSnapshot] = React.useState<DatasetStatusInfo | null>(null)
  const openDialog = () => {
    setSnapshot(status)
    setOpen(true)
  }
  React.useEffect(() => {
    // "Pubblica" dal riepilogo: `?pubblica=1` apre il dialogo
    if (new URLSearchParams(window.location.search).get("pubblica") === "1" && status.draft && canPublish) openDialog()
    // solo all'apertura della pagina
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <>
      <DatasetStatusBar status={status} title={title} canPublish={canPublish} onPublish={openDialog} />
      {canPublish && snapshot?.draft && <PublishDialog status={snapshot} open={open} onOpenChange={setOpen} />}
    </>
  )
}
