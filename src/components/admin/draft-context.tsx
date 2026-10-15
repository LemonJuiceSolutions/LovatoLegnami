"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import type { ActionResult } from "@/server/actions/result"
import type { SaveOutcome } from "./editable-table"
import type { DatasetName, DatasetStatusInfo } from "./types"

/**
 * Bozza condivisa dai form di una pagina admin (9.2): tiene lo stato della versione (e
 * quindi l'`updatedAt` del lock ottimistico) e salva le porzioni con
 * `saveDraftSection`. Dopo ogni salvataggio riuscito aggiorna il lock e ricarica i dati del
 * server (`router.refresh()`), così le altre tabelle della pagina ripartono dalla bozza.
 */

export type SaveSectionFn = (input: { dataset: DatasetName; path: string; value: unknown; expectedUpdatedAt: string | null }) => Promise<ActionResult<DatasetStatusInfo>>

interface DraftContextValue {
  readonly status: DatasetStatusInfo
  readonly save: (path: string, value: unknown) => Promise<SaveOutcome>
  readonly setStatus: (status: DatasetStatusInfo) => void
}

const DraftContext = React.createContext<DraftContextValue | null>(null)

const defaultSave: SaveSectionFn = async (input) => (await import("@/server/actions/datasets")).saveDraftSection(input)

export function DraftProvider({ status: initial, saveAction, children }: { status: DatasetStatusInfo; saveAction?: SaveSectionFn; children: React.ReactNode }) {
  const router = useRouter()
  const [status, setStatus] = React.useState(initial)
  // lo stato del server più recente prevale (navigazione, refresh dopo la pubblicazione)
  React.useEffect(() => setStatus(initial), [initial])
  const ref = React.useRef(status)
  ref.current = status

  const save = React.useCallback(
    async (path: string, value: unknown): Promise<SaveOutcome> => {
      const current = ref.current
      const res = await (saveAction ?? defaultSave)({ dataset: current.dataset, path, value, expectedUpdatedAt: current.draft?.updatedAt ?? null })
      if (!res.ok) return { ok: false, message: res.message }
      ref.current = res.data
      setStatus(res.data)
      router.refresh()
      return { ok: true }
    },
    [saveAction, router],
  )

  const value = React.useMemo(() => ({ status, save, setStatus }), [status, save])
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
}

export function useDraft(): DraftContextValue {
  const ctx = React.useContext(DraftContext)
  if (!ctx) throw new Error("useDraft fuori da DraftProvider")
  return ctx
}
