"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Download, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { exportTable, importTable, type ImportResult, type PriceTable } from "@/domain/pricing/csv"
import type { PriceList } from "@/domain/pricing/types"
import type { ActionResult } from "@/server/actions/result"
import { DiffList } from "../diff-list"
import { useDraft } from "../draft-context"
import type { DatasetStatusInfo } from "../types"
import { csvLimitError, MAX_CSV_BYTES } from "./csv-limits"

/**
 * Esporta/Importa CSV di una tabella del listino (9.5): stesso dialetto della distinta
 * (`;`, BOM, virgola decimale). L'import mostra l'anteprima (righe aggiunte, modificate,
 * rimosse, errori) calcolata con `importTable` del dominio e si applica alla bozza solo
 * dopo conferma; il server rianalizza il CSV.
 */

export type ImportCsvFn = (input: { table: PriceTable; csv: string; expectedUpdatedAt: string | null }) => Promise<ActionResult<DatasetStatusInfo>>
const defaultImport: ImportCsvFn = async (input) => (await import("@/server/actions/price-list-csv")).importPriceListCsv(input)

export const TABLE_LABELS: Readonly<Record<PriceTable, string>> = {
  legno: "prezzi del legno",
  lunghezze: "lunghezze commerciali",
  lavorazioni: "lavorazioni",
  ferramenta: "ferramenta",
  trattamenti: "trattamenti",
  coperture: "coperture",
  manodopera: "tempi di montaggio",
  zone: "zone di trasporto",
}

/** Conteggio delle differenze: voci aggiunte (solo dopo), rimosse (solo prima), modificate. */
export function summarize(diff: ImportResult["diff"]): { added: number; changed: number; removed: number } {
  let added = 0
  let changed = 0
  let removed = 0
  for (const d of diff) {
    if (!("before" in d)) added++
    else if (!("after" in d)) removed++
    else changed++
  }
  return { added, changed, removed }
}

/** Testo del file (UTF-8; `FileReader` dove `Blob.text` manca). */
function readText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, "utf-8")
  })
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function CsvTools({ table, priceList, readOnly = false, importCsv = defaultImport }: { table: PriceTable; priceList: PriceList; readOnly?: boolean; importCsv?: ImportCsvFn }) {
  const router = useRouter()
  const { status, setStatus } = useDraft()
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [preview, setPreview] = React.useState<{ name: string; csv: string; result: ImportResult } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()
  const label = TABLE_LABELS[table]

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (file.size > MAX_CSV_BYTES) {
      setPreview({ name: file.name, csv: "", result: { next: null, diff: [], errors: ["file troppo grande (massimo 256 KB)"] } })
      return
    }
    const text = await readText(file)
    const limit = csvLimitError(text)
    const result: ImportResult = limit ? { next: null, diff: [], errors: [limit] } : importTable(priceList, table, text)
    setPreview({ name: file.name, csv: text, result })
    if (fileRef.current) fileRef.current.value = ""
  }

  const confirm = () => {
    if (!preview?.result.next) return
    start(async () => {
      const res = await importCsv({ table, csv: preview.csv, expectedUpdatedAt: status.draft?.updatedAt ?? null })
      if (!res.ok) return setError(res.message)
      setStatus(res.data)
      setPreview(null)
      router.refresh()
    })
  }

  const counts = preview ? summarize(preview.result.diff) : null
  const canConfirm = !!preview?.result.next && preview.result.errors.length === 0 && preview.result.diff.length > 0 && !pending
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => download(`listino-${table}.csv`, exportTable(priceList, table))}>
        <Download className="mr-1 h-4 w-4" aria-hidden />
        Esporta CSV
      </Button>
      {!readOnly && (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" aria-hidden />
            Importa CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label={`File CSV delle ${label}`}
            tabIndex={-1}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </>
      )}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importa {label}</DialogTitle>
            <DialogDescription>
              {preview?.name}: la tabella della bozza sarà sostituita da quella del file (le righe assenti dal file vengono rimosse).
            </DialogDescription>
          </DialogHeader>
          {preview && counts && (
            <div className="space-y-3 text-sm">
              {preview.result.errors.length > 0 ? (
                <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-destructive">
                  <p className="font-medium">Il file contiene errori e non può essere importato:</p>
                  <ul className="list-disc pl-5">
                    {preview.result.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              ) : preview.result.diff.length === 0 ? (
                <p role="status">Nessuna differenza rispetto alla bozza.</p>
              ) : null}
              <p aria-label="Riepilogo dell'import">
                {counts.added} aggiunte · {counts.changed} modificate · {counts.removed} rimosse
              </p>
              <DiffList diff={preview.result.diff} />
              {error && (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreview(null)}>
              Annulla
            </Button>
            <Button type="button" onClick={confirm} disabled={!canConfirm}>
              {pending ? "Importazione…" : "Conferma import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
