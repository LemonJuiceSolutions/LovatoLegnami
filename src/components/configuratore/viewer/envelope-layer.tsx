"use client"

import * as React from "react"
import { BoxGeometry, EdgesGeometry } from "three"
import type { Envelope } from "@/domain"
import type { ViewerPalette } from "./theme-colors"

/** Box base dell'ingombro come wireframe (spigoli). */
export function EnvelopeLayer({ envelope, palette }: { envelope: Envelope; palette: ViewerPalette }) {
  const { width, depth, height } = envelope.box
  const edges = React.useMemo(() => new EdgesGeometry(new BoxGeometry(width, depth, height)), [width, depth, height])
  React.useEffect(() => () => edges.dispose(), [edges])
  return (
    <lineSegments name="ingombro" geometry={edges} position={[width / 2, depth / 2, height / 2]} raycast={() => null}>
      <lineBasicMaterial color={palette.foreground} transparent opacity={0.55} />
    </lineSegments>
  )
}
