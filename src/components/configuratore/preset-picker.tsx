"use client"

import * as React from "react"
import { BookOpen, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { listTypologies } from "@/domain"
import { cn } from "@/lib/utils"
import { EXAMPLES, type ConfiguratoreExample } from "@/stores/examples"
import { useConfiguratore } from "@/stores/use-configuratore"
import { TypologyThumbnail } from "./typology-picker"
import { normalizeSearch } from "./typology-helpers"

/**
 * "Esempi dal catalogo" (spec `configuratore-ui`, "Selettore dei preset
 * commerciali"): i preset del dominio raggruppati per tipologia, con nome,
 * fonte e note; il clic carica tipologia, parametri e ingombro (`loadPreset`).
 */

export interface PresetGroup {
  readonly slug: string
  readonly name: string
  readonly presets: readonly ConfiguratoreExample[]
}

/** Preset raggruppati per tipologia nell'ordine del registro, filtrati per parole (nome, fonte, note). */
export function groupPresets(examples: readonly ConfiguratoreExample[], query = ""): PresetGroup[] {
  const words = normalizeSearch(query).split(" ").filter(Boolean)
  const match = (e: ConfiguratoreExample, typologyName: string) => {
    if (words.length === 0) return true
    const text = normalizeSearch([e.name, e.source, typologyName, ...e.notes].join(" "))
    return words.every((w) => text.includes(w))
  }
  return listTypologies().flatMap((t) => {
    const presets = examples.filter((e) => e.typologySlug === t.slug && match(e, t.name))
    return presets.length > 0 ? [{ slug: t.slug, name: t.name, presets }] : []
  })
}

function PresetItem({ example, onLoad }: { example: ConfiguratoreExample; onLoad: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        data-preset={example.id}
        onClick={() => onLoad(example.id)}
        className="w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{example.name}</span>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
            {example.source}
          </Badge>
        </span>
        {example.notes.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {example.notes.map((n, i) => (
              <li key={i} className="leading-snug">
                {n}
              </li>
            ))}
          </ul>
        )}
      </button>
    </li>
  )
}

/** Elenco dei preset raggruppato per tipologia; `onLoaded` dopo un caricamento riuscito. */
export function PresetPicker({ onLoaded }: { onLoaded?: (id: string) => void }) {
  const loadPreset = useConfiguratore((s) => s.loadPreset)
  const [query, setQuery] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const groups = React.useMemo(() => groupPresets(EXAMPLES, query), [query])

  const load = (id: string) => {
    const result = loadPreset(id)
    if (result.ok) {
      setError(null)
      onLoaded?.(id)
    } else setError(result.error)
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Label htmlFor="preset-search" className="sr-only">
          Cerca esempio
        </Label>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="preset-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome, misure o fonte…"
          className="h-9 pl-8"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {groups.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Nessun esempio corrisponde alla ricerca.</p>
      ) : (
        groups.map((g) => (
          <section key={g.slug} className="space-y-2" data-preset-group={g.slug}>
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <TypologyThumbnail slug={g.slug} name={g.name} className="h-7 w-9 shrink-0" />
              {g.name}
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {g.presets.length}
              </Badge>
            </h4>
            <ul className={cn("grid gap-2", g.presets.length > 1 && "sm:grid-cols-2")}>
              {g.presets.map((e) => (
                <PresetItem key={e.id} example={e} onLoad={load} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

/** Pulsante della barra che apre "Esempi dal catalogo" in un dialogo. */
export function PresetPickerButton() {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <BookOpen className="mr-1.5 h-4 w-4 shrink-0" />
        Esempi dal catalogo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Esempi dal catalogo</DialogTitle>
            <DialogDescription>
              Modelli commerciali di riferimento: il caricamento sostituisce tipologia, parametri e ingombro (le opzioni di export restano).
            </DialogDescription>
          </DialogHeader>
          <PresetPicker onLoaded={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}
