"use client"

import * as React from "react"
import { AlertTriangle, Layers } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { LAYER_LABELS, VIEWER_LAYERS, useViewer } from "@/stores/viewer-store"
import { selectAssembly } from "@/stores/configuratore-store"
import { useConfiguratore } from "@/stores/use-configuratore"
import { Scene } from "./scene"
import { obstacleTypes } from "./layer-helpers"
import { FAMILY_COLORS, FAMILY_LABELS, OBSTACLE_LABELS, obstacleColor, type ViewerPalette } from "./theme-colors"
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
    <div
      data-slot="viewer"
      data-pieces={assembly?.pieces.length ?? 0}
      data-solids={solids}
      className="relative h-full w-full overflow-hidden rounded-lg border bg-background">
      <Scene assembly={assembly} envelope={envelope} palette={palette} results={results} />
      {unavailable && (
        <div className="pointer-events-none absolute right-2 top-2 max-w-xs">
          <Alert className="pointer-events-auto bg-background/95 py-2 shadow-sm">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">Modalità semplificata</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              Kernel geometrico non disponibile: i pezzi sono mostrati come box sezione × lunghezza, senza lavorazioni.
            </AlertDescription>
          </Alert>
        </div>
      )}
      <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-2">
        <div className="pointer-events-auto">
          <LayersMenu />
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 max-w-[45%]">
        <Legend palette={palette} />
      </div>
    </div>
  )
}
