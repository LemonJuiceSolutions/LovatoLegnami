"use client"

import * as React from "react"
import { Line } from "@react-three/drei"
import type { Assembly } from "@/domain"
import { useConfiguratore } from "@/stores/use-configuratore"
import { computeDimensions } from "./camera-views"
import { SceneLabel } from "./scene-label"
import type { ViewerPalette } from "./theme-colors"

/** Livello "quote": larghezza, profondità, altezza sotto trave, altezza massima e pendenza. */
export function DimensionsLayer({ assembly, palette }: { assembly: Assembly | null; palette: ViewerPalette }) {
  const measures = useConfiguratore((s) => s.derived.measures)
  const dims = React.useMemo(() => computeDimensions(assembly, measures), [assembly, measures])
  return (
    <group name="quote">
      {dims.map((d) => (
        <React.Fragment key={d.key}>
          {d.from.some((v, i) => v !== d.to[i]) && (
            <Line points={[d.from, d.to]} color={palette.foreground} lineWidth={1.5} dashed={d.key === "sottoTrave"} dashSize={60} gapSize={40} raycast={() => null} />
          )}
          <SceneLabel position={d.labelAt} className="border-primary/40">
            <span data-dimension={d.key}>{d.text}</span>
          </SceneLabel>
        </React.Fragment>
      ))}
    </group>
  )
}
