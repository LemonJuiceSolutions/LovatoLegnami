"use client"

import * as React from "react"
import { FolderOpen, RotateCcw, Save } from "lucide-react"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ValidationIssue } from "@/domain"
import { downloadFile } from "@/export/download"
import { exportFileName } from "@/export/filename"
import { ConfigFileError, parseConfigFile, serializeConfig } from "@/stores/config-file"
import type { ConfiguratoreStore } from "@/stores/configuratore-store"
import { EXAMPLES, exampleConfig } from "@/stores/examples"
import { configuratoreStore, useConfiguratore } from "@/stores/use-configuratore"
import { readFileText } from "./form-helpers"

/**
 * Barra della configurazione (spec `configuratore-ui`, "Stato e persistenza"
 * ed "Esempi precaricati"): salva/carica il file JSON versionato, esempi
 * precaricati, ripristino dei default. Un file non valido mostra il dettaglio
 * degli errori e lascia lo stato invariato.
 */

export type LoadOutcome = { ok: true } | { ok: false; issues: readonly ValidationIssue[] }

/** Carica una configurazione da testo JSON nello store; se non è valida lo store non cambia. */
export function loadConfigText(text: string, store: ConfiguratoreStore = configuratoreStore): LoadOutcome {
  try {
    const config = parseConfigFile(text)
    store.getState().loadConfig(config)
    return { ok: true }
  } catch (e) {
    if (e instanceof ConfigFileError) return { ok: false, issues: e.issues }
    return { ok: false, issues: [{ path: "(radice)", message: e instanceof Error ? e.message : String(e) }] }
  }
}

export function ConfigToolbar() {
  const typology = useConfiguratore((s) => s.config.typology)
  const loadConfig = useConfiguratore((s) => s.loadConfig)
  const resetConfig = useConfiguratore((s) => s.resetConfig)
  const fileInput = React.useRef<HTMLInputElement>(null)
  const [loadError, setLoadError] = React.useState<{ file: string; issues: readonly ValidationIssue[] } | null>(null)
  const [confirmReset, setConfirmReset] = React.useState(false)
  const [example, setExample] = React.useState("")

  const save = () => {
    const { config } = configuratoreStore.getState()
    downloadFile(serializeConfig(config), exportFileName(config.typology, "json"), "application/json")
  }

  const load = async (file: File) => {
    let text: string
    try {
      text = await readFileText(file)
    } catch (e) {
      setLoadError({ file: file.name, issues: [{ path: "(radice)", message: e instanceof Error ? e.message : String(e) }] })
      return
    }
    const outcome = loadConfigText(text)
    if (!outcome.ok) setLoadError({ file: file.name, issues: outcome.issues })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={example}
        onValueChange={(id) => {
          loadConfig(exampleConfig(id))
          setExample("")
        }}
      >
        <SelectTrigger className="h-9 w-[200px]" aria-label="Carica esempio">
          <SelectValue placeholder="Carica esempio..." />
        </SelectTrigger>
        <SelectContent>
          {EXAMPLES.map((e) => (
            <SelectItem key={e.id} value={e.id} title={e.description}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={save}>
        <Save className="mr-1.5 h-4 w-4 shrink-0" />
        Salva configurazione
      </Button>
      <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
        <FolderOpen className="mr-1.5 h-4 w-4 shrink-0" />
        Carica
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
        <RotateCcw className="mr-1.5 h-4 w-4 shrink-0" />
        Ripristina
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="File di configurazione"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) void load(file)
        }}
      />

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Ripristinare i valori di default?"
        description="Parametri, ingombro e opzioni di export tornano ai valori di default della tipologia corrente. Salva prima la configurazione se vuoi conservarla."
        confirmLabel="Ripristina"
        destructive
        onConfirm={() => resetConfig(typology)}
      />

      <Dialog open={loadError !== null} onOpenChange={(o) => !o && setLoadError(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Configurazione non caricata</DialogTitle>
            <DialogDescription>
              Il file {loadError?.file} non è valido: la configurazione corrente non è stata modificata.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-60 space-y-1 overflow-y-auto text-sm" data-testid="load-errors">
            {loadError?.issues.map((i, k) => (
              <li key={k}>
                <span className="font-mono text-xs text-muted-foreground">{i.path}</span>: {i.message}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoadError(null)}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
