"use client"

import * as React from "react"
import { AlertCircle, CheckCircle2, Download, FileCheck2, FileSearch, Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { CSV_MIME_TYPE, buildDistinta } from "@/export/csv/distinta"
import { downloadFile } from "@/export/download"
import { exportFileName } from "@/export/filename"
import { SAT_FILE_MODES, SAT_VERSIONS, compareWithSample, type SatComparison, type SatFileMode } from "@/export/sat"
import { selectNeedsExportConfirmation, selectSolidsReady } from "@/stores/configuratore-store"
import { configuratoreStore, useConfiguratore } from "@/stores/use-configuratore"
import { readFileText } from "./form-helpers"
import { exportProblems, satFromState, verifySatExport, type SatVerification } from "./export-helpers"

/**
 * Pannello esportazioni (spec `configuratore-ui` "Pannello esportazioni" e
 * `export-cnc`): opzioni SAT persistite nella configurazione, avanzamento
 * della costruzione dei solidi, export SAT/STEP (abilitati solo con i solidi
 * pronti, "Esporta comunque" se ci sono errori o collisioni), distinta CSV,
 * verifica strutturale del SAT e confronto con un SAT campione della CNC.
 */

const FILE_MODE_LABELS: Record<SatFileMode, string> = {
  "assieme-unico": "Assieme unico (.sat)",
  "un-file-per-pezzo": "Un file per pezzo (.zip)",
}

type CadFormat = "sat" | "step"

type Feedback =
  | { kind: "ok"; title: string; lines?: readonly string[] }
  | { kind: "error"; title: string; lines?: readonly string[] }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function KernelProgress() {
  const status = useConfiguratore((s) => s.kernel.status)
  const building = useConfiguratore((s) => s.kernel.building)
  const progress = useConfiguratore((s) => s.kernel.progress)
  const error = useConfiguratore((s) => s.kernel.error)
  const ready = useConfiguratore(selectSolidsReady)

  let label: string
  let value = 0
  if (status === "unavailable") label = "Kernel geometrico non disponibile: export CAD disattivati."
  else if (status === "idle" || status === "init") label = "Avvio del kernel geometrico..."
  else if (building) {
    const done = progress?.done ?? 0
    const total = progress?.total ?? 0
    value = total > 0 ? (done / total) * 100 : 0
    label = `Costruzione solidi ${done}/${total}`
  } else if (ready) {
    value = 100
    label = "Solidi pronti"
  } else label = error ? `Errore di costruzione: ${error}` : "Solidi non aggiornati"

  return (
    <div className="space-y-1.5" data-testid="kernel-progress">
      <div className="flex items-center justify-between text-xs">
        <span className={status === "unavailable" || (!building && error) ? "text-destructive" : "text-muted-foreground"}>
          {label}
        </span>
        {building && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <Progress value={value} className="h-2" aria-label="Avanzamento costruzione solidi" />
    </div>
  )
}

function SatOptions() {
  const sat = useConfiguratore((s) => s.config.exportOptions.sat)
  const setExportOption = useConfiguratore((s) => s.setExportOption)

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="sat-version" className="text-xs font-medium">
          Versione SAT
        </Label>
        <Select value={sat.version} onValueChange={(v) => setExportOption("version", v as (typeof SAT_VERSIONS)[number])}>
          <SelectTrigger id="sat-version" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SAT_VERSIONS.map((v) => (
              <SelectItem key={v} value={v}>
                ACIS {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sat-mode" className="text-xs font-medium">
          Modalità file
        </Label>
        <Select value={sat.fileMode} onValueChange={(v) => setExportOption("fileMode", v as SatFileMode)}>
          <SelectTrigger id="sat-mode" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SAT_FILE_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {FILE_MODE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label htmlFor="sat-producer" className="text-xs font-medium">
          Produttore / CAM (header)
        </Label>
        <Input
          id="sat-producer"
          className="h-9"
          value={sat.producer}
          maxLength={200}
          onChange={(e) => setExportOption("producer", e.target.value)}
        />
      </div>
      <div className="col-span-2 flex items-center justify-between gap-3">
        <Label htmlFor="sat-name" className="text-xs font-medium">
          Nome del body = id del pezzo
        </Label>
        <Switch id="sat-name" checked={sat.includeName} onCheckedChange={(v) => setExportOption("includeName", v)} />
      </div>
      <p className="col-span-2 text-xs text-muted-foreground">Unità: millimetri (dichiarate nell&apos;header).</p>
    </div>
  )
}

export function ExportPanel() {
  const ready = useConfiguratore(selectSolidsReady)
  const needsConfirmation = useConfiguratore(selectNeedsExportConfirmation)
  const hasAssembly = useConfiguratore((s) => s.derived.assembly !== null)
  const [pending, setPending] = React.useState<CadFormat | null>(null)
  const [busy, setBusy] = React.useState<CadFormat | null>(null)
  const [feedback, setFeedback] = React.useState<Feedback | null>(null)
  const [verification, setVerification] = React.useState<SatVerification | null>(null)
  const [comparison, setComparison] = React.useState<SatComparison | null>(null)
  const sampleInput = React.useRef<HTMLInputElement>(null)

  const runSat = () => {
    const state = configuratoreStore.getState()
    try {
      const result = satFromState(state)
      const name = exportFileName(state.config.typology, result.extension)
      downloadFile(result.data, name, result.mimeType)
      setFeedback({
        kind: result.errors.length > 0 ? "error" : "ok",
        title: `Scaricato ${name} (${result.written.length} body)`,
        lines: result.errors.map((e) => e.message),
      })
    } catch (e) {
      setFeedback({ kind: "error", title: "Export SAT non riuscito", lines: [errorText(e)] })
    }
  }

  const runStep = async () => {
    const state = configuratoreStore.getState()
    setBusy("step")
    try {
      const result = await state.exportStep()
      const name = exportFileName(state.config.typology, "step")
      downloadFile(result.data, name, "model/step")
      setFeedback({
        kind: result.errors.length > 0 ? "error" : "ok",
        title: `Scaricato ${name} (${result.written.length} solidi)`,
        lines: result.errors.map((e) => `${e.pieceId}: ${e.message}`),
      })
    } catch (e) {
      setFeedback({ kind: "error", title: "Export STEP non riuscito", lines: [errorText(e)] })
    } finally {
      setBusy(null)
    }
  }

  const runCad = (format: CadFormat) => (format === "sat" ? runSat() : void runStep())

  const requestCad = (format: CadFormat) => {
    if (selectNeedsExportConfirmation(configuratoreStore.getState())) setPending(format)
    else runCad(format)
  }

  const runCsv = () => {
    const state = configuratoreStore.getState()
    const assembly = state.derived.assembly
    if (!assembly) return
    const { csv, rows } = buildDistinta(assembly)
    const name = exportFileName(state.config.typology, "csv")
    downloadFile(csv, name, CSV_MIME_TYPE)
    setFeedback({ kind: "ok", title: `Scaricato ${name} (${rows.length} righe, ${assembly.pieces.length} pezzi)` })
  }

  const runVerify = () => {
    try {
      setVerification(verifySatExport(satFromState(configuratoreStore.getState())))
    } catch (e) {
      setVerification({ ok: false, summary: "Verifica non riuscita", errors: [errorText(e)], warnings: [] })
    }
  }

  const runCompare = async (file: File) => {
    try {
      const sample = await readFileText(file)
      const ours = satFromState(configuratoreStore.getState())
      setComparison(compareWithSample(ours.files[0]?.text ?? "", sample))
    } catch (e) {
      setFeedback({ kind: "error", title: "Confronto non riuscito", lines: [errorText(e)] })
    }
  }

  const problems = pending ? exportProblems(configuratoreStore.getState()) : []
  const cancelCad = () => {
    setFeedback({ kind: "error", title: "Export annullato: l'assieme ha errori o collisioni", lines: problems })
    setPending(null)
  }

  return (
    <div className="space-y-4">
      <SatOptions />
      <KernelProgress />

      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" disabled={!ready || busy !== null} onClick={() => requestCad("sat")}>
          <Download className="mr-1.5 h-4 w-4 shrink-0" />
          Esporta SAT
        </Button>
        <Button size="sm" variant="secondary" disabled={!ready || busy !== null} onClick={() => requestCad("step")}>
          {busy === "step" ? <Loader2 className="mr-1.5 h-4 w-4 shrink-0 animate-spin" /> : <Download className="mr-1.5 h-4 w-4 shrink-0" />}
          Esporta STEP
        </Button>
        <Button size="sm" variant="outline" className="col-span-2" disabled={!hasAssembly} onClick={runCsv}>
          <Download className="mr-1.5 h-4 w-4 shrink-0" />
          Esporta distinta CSV
        </Button>
        <Button size="sm" variant="ghost" disabled={!ready} onClick={runVerify}>
          <FileCheck2 className="mr-1.5 h-4 w-4 shrink-0" />
          Verifica file
        </Button>
        <Button size="sm" variant="ghost" disabled={!ready} onClick={() => sampleInput.current?.click()}>
          <FileSearch className="mr-1.5 h-4 w-4 shrink-0" />
          Confronta campione
        </Button>
        <input
          ref={sampleInput}
          type="file"
          accept=".sat,text/plain"
          className="hidden"
          aria-label="SAT campione della CNC"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (file) void runCompare(file)
          }}
        />
      </div>

      {!ready && (
        <p className="text-xs text-muted-foreground">SAT e STEP si abilitano quando i solidi dell&apos;assieme corrente sono pronti.</p>
      )}
      {ready && needsConfirmation && (
        <p className="text-xs text-muted-foreground">Ci sono errori o collisioni: l&apos;export CAD chiederà conferma.</p>
      )}

      {feedback && (
        <Alert variant={feedback.kind === "error" ? "destructive" : "default"}>
          {feedback.kind === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          <AlertTitle className="text-sm">{feedback.title}</AlertTitle>
          {feedback.lines && feedback.lines.length > 0 && (
            <AlertDescription className="text-xs">
              {feedback.lines.slice(0, 6).map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </AlertDescription>
          )}
        </Alert>
      )}

      {verification && (
        <Alert variant={verification.ok ? "default" : "destructive"} data-testid="sat-verification">
          {verification.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertTitle className="text-sm">{verification.ok ? "Struttura SAT valida" : "Problemi nel file SAT"}</AlertTitle>
          <AlertDescription className="text-xs">
            <p>{verification.summary}</p>
            {[...verification.errors, ...verification.warnings].slice(0, 8).map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {comparison && (
        <Alert variant={comparison.compatible ? "default" : "destructive"}>
          {comparison.compatible ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertTitle className="text-sm">
            {comparison.compatible ? "Compatibile con il campione" : "Differenze rispetto al campione"}
          </AlertTitle>
          <AlertDescription className="text-xs">
            {comparison.differences.length === 0 && <p>Nessuna differenza rilevata.</p>}
            {comparison.differences.map((d, i) => (
              <p key={i}>
                [{d.severity}] {d.message}
                {d.suggestion ? ` → imposta ${d.suggestion.option} = ${String(d.suggestion.value)}` : ""}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <Dialog open={pending !== null} onOpenChange={(o) => !o && cancelCad()}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Esportare comunque?</DialogTitle>
            <DialogDescription>
              L&apos;assieme ha errori o collisioni: il file {pending === "step" ? "STEP" : "SAT"} potrebbe non essere producibile.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {problems.map((p, i) => (
              <li key={i} className="flex gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                {p}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={cancelCad}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const format = pending
                setPending(null)
                if (format) runCad(format)
              }}
            >
              Esporta comunque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
