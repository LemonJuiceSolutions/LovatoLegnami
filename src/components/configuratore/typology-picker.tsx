"use client"

import * as React from "react"
import { Check, LayoutGrid, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { listTypologies, type TypologyInfo } from "@/domain"
import { cn } from "@/lib/utils"
import { useConfiguratore } from "@/stores/use-configuratore"
import { thumbnailFor } from "./thumbnails/isometric"
import { CATEGORY_LABELS, filterTypologies, presentCategories, type CategoryFilter } from "./typology-helpers"

/**
 * Selettore delle tipologie (spec `configuratore-ui`, "Selettore di tipologia
 * con miniature"): griglia di schede con miniatura assonometrica generata dal
 * modello, nome, categoria, descrizione e tag; filtro per categoria e ricerca.
 */

/** Miniatura SVG della tipologia (stringa generata e memorizzata da `thumbnailFor`). */
export function TypologyThumbnail({ slug, name, className }: { slug: string; name: string; className?: string }) {
  const svg = React.useMemo(() => thumbnailFor(slug, name), [slug, name])
  return (
    <span
      data-thumbnail={slug}
      className={cn("block text-foreground [&>svg]:h-full [&>svg]:w-full", className)}
      // SVG generato dal codice (nessun dato dell'utente)
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function TypologyCard({ info, selected, onSelect }: { info: TypologyInfo; selected: boolean; onSelect: (slug: string) => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={info.name}
      data-typology={info.slug}
      onClick={() => onSelect(info.slug)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect(info.slug)
        }
      }}
      className={cn(
        "flex cursor-pointer flex-col overflow-hidden transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary ring-1 ring-primary"
      )}
    >
      <div className="relative border-b bg-muted/40 px-3 py-2">
        <TypologyThumbnail slug={info.slug} name={info.name} className="mx-auto h-28 w-full" />
        {selected && (
          <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-tight">{info.name}</p>
          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
            {CATEGORY_LABELS[info.category]}
          </Badge>
        </div>
        <p className="line-clamp-3 text-xs text-muted-foreground">{info.description}</p>
        {info.tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {info.tags.slice(0, 5).map((tag) => (
              <Badge key={tag} variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

export interface TypologyPickerProps {
  /** Slug della tipologia corrente (evidenziata). */
  readonly value: string
  readonly onSelect: (slug: string) => void
}

/** Griglia filtrabile delle tipologie registrate. */
export function TypologyPicker({ value, onSelect }: TypologyPickerProps) {
  const typologies = React.useMemo(() => listTypologies(), [])
  const categories = React.useMemo(() => presentCategories(typologies), [typologies])
  const [category, setCategory] = React.useState<CategoryFilter>("tutte")
  const [query, setQuery] = React.useState("")
  const shown = React.useMemo(() => filterTypologies(typologies, category, query), [typologies, category, query])

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Tabs value={category} onValueChange={(v) => setCategory(v as CategoryFilter)} className="min-w-0">
          <TabsList aria-label="Filtra per categoria" className="h-auto flex-wrap justify-start">
            <TabsTrigger value="tutte" className="text-xs">
              Tutte
            </TabsTrigger>
            {categories.map((c) => (
              <TabsTrigger key={c} value={c} className="text-xs">
                {CATEGORY_LABELS[c]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative sm:ml-auto sm:w-56">
          <Label htmlFor="typology-search" className="sr-only">
            Cerca tipologia
          </Label>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="typology-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per nome o tag…"
            className="h-9 pl-8"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          Nessuna tipologia corrisponde ai filtri.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="typology-grid">
          {shown.map((t) => (
            <TypologyCard key={t.slug} info={t} selected={t.slug === value} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Tipologia corrente (miniatura, nome, categoria, descrizione) con il pulsante
 * che apre il selettore in un dialogo; la scelta chiama `setTypology`.
 */
export function TypologyChooser() {
  const typology = useConfiguratore((s) => s.config.typology)
  const setTypology = useConfiguratore((s) => s.setTypology)
  const [open, setOpen] = React.useState(false)
  const info = React.useMemo(() => listTypologies().find((t) => t.slug === typology), [typology])

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">Tipologia</p>
      <div className="overflow-hidden rounded-md border" data-current-typology={typology}>
        {info && (
          <div className="flex gap-3 p-2">
            <TypologyThumbnail slug={info.slug} name={info.name} className="h-16 w-20 shrink-0 rounded bg-muted/40 p-1" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold leading-tight">{info.name}</p>
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {CATEGORY_LABELS[info.category]}
              </Badge>
            </div>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full rounded-none border-t text-xs"
          onClick={() => setOpen(true)}
        >
          <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
          {info ? "Cambia tipologia" : "Scegli la tipologia"}
        </Button>
      </div>
      {info && <p className="text-xs text-muted-foreground">{info.description}</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Scegli la tipologia</DialogTitle>
            <DialogDescription>
              Le miniature sono generate dall&apos;assieme di default. I parametri comuni compatibili (es. larghezza) restano invariati.
            </DialogDescription>
          </DialogHeader>
          <TypologyPicker
            value={typology}
            onSelect={(slug) => {
              if (slug !== typology) setTypology(slug)
              setOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
