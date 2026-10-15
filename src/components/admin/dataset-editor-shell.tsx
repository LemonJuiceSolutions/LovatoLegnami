"use client"

import * as React from "react"
import { DatasetStatusBar } from "./dataset-status"
import { DraftProvider, useDraft } from "./draft-context"
import type { DatasetStatusInfo } from "./types"

/**
 * Guscio comune degli editor dei dataset: bozza condivisa (`DraftProvider`), barra di
 * stato con "Pubblica" e il contenuto della sezione. `publish` riceve lo stato corrente e
 * restituisce il dialogo di pubblicazione (9.4).
 */
export function DatasetEditorShell({
  status,
  title,
  canPublish,
  publish,
  children,
}: {
  status: DatasetStatusInfo
  title?: string
  canPublish: boolean
  publish?: (props: { status: DatasetStatusInfo; open: boolean; onOpenChange: (open: boolean) => void }) => React.ReactNode
  children: React.ReactNode
}) {
  return (
    <DraftProvider status={status}>
      <StatusWithPublish title={title} canPublish={canPublish} publish={publish} />
      <div className="space-y-4">{children}</div>
    </DraftProvider>
  )
}

function StatusWithPublish({ title, canPublish, publish }: { title?: string; canPublish: boolean; publish?: Parameters<typeof DatasetEditorShell>[0]["publish"] }) {
  const { status } = useDraft()
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    // "Pubblica" dal riepilogo: `?pubblica=1` apre il dialogo
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pubblica") === "1" && status.draft) setOpen(true)
    // solo all'apertura della pagina
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <>
      <DatasetStatusBar status={status} title={title} canPublish={canPublish && !!publish} onPublish={() => setOpen(true)} />
      {publish && status.draft && publish({ status, open, onOpenChange: setOpen })}
    </>
  )
}
