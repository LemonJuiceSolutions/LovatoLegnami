"use client"

import * as React from "react"
import { AlertTriangle, Box, Layers, Maximize, Ruler, Square, SquareDashed, StretchHorizontal } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { LAYER_LABELS, VIEWER_LAYERS, VIEWS, useViewer, viewerStore, type ViewName } from "@/stores/viewer-store"
import { VIEW_LABELS } from "./camera-views"
import { selectAssembly } from "@/stores/configuratore-store"
import { useConfiguratore } from "@/stores/use-configuratore"
import { Scene } from "./scene"
import { obstacleTypes } from "./layer-helpers"
import { FAMILY_COLORS, FAMILY_LABELS } from "./piece-colors"
import { OBSTACLE_LABELS, obstacleColor, type ViewerPalette } from "./theme-colors"
import { familyLegend, usableKernelMesh } from "./viewer-helpers"
import { useViewerPalette } from "./use-viewer-palette"

/** Riquadro sovrapposto alla scena con lo stile delle card del tema. */
export function Overlay({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={
        "pointer-events-auto rounded-md border bg-background/90 text-foreground shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75 " +
        (className ?? "")
      }
    >
      {children}
    </div>
  )
}

const VIEW_ICONS: Readonly<Record<ViewName, React.ElementType>> = {
  prospettica: Box,
  fronte: Square,
  lato: StretchHorizontal,
  pianta: SquareDashed,
}

const VIEW_HINTS: Readonly<Record<ViewName, string>> = {
  prospettica: "Vista prospettica libera",
  fronte: "Vista dal fronte (ortografica)",
  lato: "Vista dal lato sinistro (ortografica)",
  pianta: "Vista dall'alto (ortografica)",
}

function IconAction({
  label,
  hint,
  active,
  onClick,
  icon: Icon,
  showLabel = false,
}: {
  label: string
  hint: string
  active?: boolean
  onClick: () => void
  icon: React.ElementType
  showLabel?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "default" : "ghost"}
          size="sm"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn("h-8 gap-1.5 px-2", showLabel && "px-2.5")}
        >
          <Icon className="h-4 w-4" />
          <span className={cn(!showLabel && "sr-only", showLabel && "hidden sm:inline")}>{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{hint}</TooltipContent>
    </Tooltip>
  )
}

function ViewToolbar() {
  const view = useViewer((s) => s.view)
  const quote = useViewer((s) => s.layers.quote)
  const { setView, frameAll, toggleLayer } = viewerStore.getState()
  return (
    <Overlay className="flex flex-wrap items-center gap-0.5 p-0.5">
      {VIEWS.map((v) => (
        <IconAction key={v} label={VIEW_LABELS[v]} hint={VIEW_HINTS[v]} icon={VIEW_ICONS[v]} active={view === v} onClick={() => setView(v)} />
      ))}
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      <IconAction label="Inquadra tutto" hint="Inquadra pergola e ingombro" icon={Maximize} onClick={frameAll} showLabel />
      <IconAction label="Quote" hint="Mostra o nascondi le quote principali" icon={Ruler} active={quote} onClick={() => toggleLayer("quote")} />
    </Overlay>
  )
}

function LayersMenu() {
  const layers = useViewer((s) => s.layers)
  const setLayer = useViewer((s) => s.setLayer)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-background/90">
          <Layers className="h-4 w-4" />
          Livelli
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 space-y-2 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Livelli visibili</p>
        {VIEWER_LAYERS.map((layer) => (
          <div key={layer} className="flex items-center gap-2">
            <Checkbox
              id={`livello-${layer}`}
              checked={layers[layer]}
              onCheckedChange={(v) => setLayer(layer, v === true)}
            />
            <Label htmlFor={`livello-${layer}`} className="cursor-pointer text-sm font-normal">
              {LAYER_LABELS[layer]}
            </Label>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function Legend({ palette }: { palette: ViewerPalette }) {
  const assembly = useConfiguratore(selectAssembly)
  const envelope = useConfiguratore((s) => s.config.envelope)
  const showObstacles = useViewer((s) => s.layers.ostacoli)
  const entries = React.useMemo(() => familyLegend(assembly), [assembly])
  const obstacles = React.useMemo(() => (showObstacles ? obstacleTypes(envelope) : []), [envelope, showObstacles])
  if (entries.length === 0 && obstacles.length === 0) return null
  return (
    <Overlay className="px-3 py-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Legenda</p>
      <ul className="space-y-0.5 text-xs" aria-label="Legenda famiglie">
        {entries.map((e) => (
          <li key={e.family} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm border" style={{ backgroundColor: FAMILY_COLORS[e.family] }} />
            <span className="flex-1">{FAMILY_LABELS[e.family]}</span>
            <span className="tabular-nums text-muted-foreground">{e.count}</span>
          </li>
        ))}
        {obstacles.map((t) => (
          <li key={t} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-sm border"
              style={{ backgroundColor: obstacleColor(t, palette), opacity: 0.7 }}
            />
            <span className="flex-1">{OBSTACLE_LABELS[t]}</span>
          </li>
        ))}
      </ul>
    </Overlay>
  )
}

/** Visualizzatore 3D completo: scena r3f e controlli sovrapposti (componenti shadcn). */
export default function Viewer() {
  const assembly = useConfiguratore(selectAssembly)
  const envelope = useConfiguratore((s) => s.config.envelope)
  const results = useConfiguratore((s) => s.kernel.results)
  const unavailable = useConfiguratore((s) => s.kernel.status === "unavailable")
  const palette = useViewerPalette()
  const solids = React.useMemo(
    () => assembly?.pieces.filter((p) => usableKernelMesh(p, results[p.id])).length ?? 0,
    [assembly, results]
  )

  return (
    <TooltipProvider delayDuration={300}>
      <div
        data-slot="viewer"
        data-pieces={assembly?.pieces.length ?? 0}
        data-solids={solids}
        className="relative h-full w-full overflow-hidden rounded-lg border bg-background"
      >
        <Scene assembly={assembly} envelope={envelope} palette={palette} results={results} />
        <div className="pointer-events-none absolute left-2 right-2 top-2 flex flex-col items-start gap-2">
          <div className="flex flex-wrap gap-2">
            <div className="pointer-events-auto">
              <LayersMenu />
            </div>
            <ViewToolbar />
          </div>
          {unavailable && (
            <Alert className="pointer-events-auto max-w-sm bg-background/95 py-2 shadow-sm">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-sm">Modalità semplificata</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                Kernel geometrico non disponibile: i pezzi sono mostrati come box sezione × lunghezza, senza lavorazioni.
              </AlertDescription>
            </Alert>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-2 left-2 max-w-[45%]">
          <Legend palette={palette} />
        </div>
      </div>
    </TooltipProvider>
  )
}
