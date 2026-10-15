"use client"

import * as React from "react"
import { BufferAttribute, BufferGeometry, DoubleSide } from "three"
import type { Envelope } from "@/domain"
import { envelopeOutline } from "./layer-helpers"
import type { ViewerPalette } from "./theme-colors"

/**
 * Ingombro come wireframe del prisma della pianta reale (box se in squadra, quadrilatero
 * fuori squadra se `envelope.plan`) e piano del muro semitrasparente sul lato muro.
 */
export function EnvelopeLayer({ envelope, palette }: { envelope: Envelope; palette: ViewerPalette }) {
  const outline = React.useMemo(() => envelopeOutline(envelope), [envelope])
  const edges = React.useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute("position", new BufferAttribute(outline.edges, 3))
    return g
  }, [outline])
  const wall = React.useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute("position", new BufferAttribute(outline.wall, 3))
    g.setIndex([0, 1, 2, 0, 2, 3])
    return g
  }, [outline])
  React.useEffect(
    () => () => {
      edges.dispose()
      wall.dispose()
    },
    [edges, wall]
  )
  return (
    <group name="ingombro">
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial color={palette.foreground} transparent opacity={0.55} />
      </lineSegments>
      <mesh name="piano-muro" geometry={wall} raycast={() => null} renderOrder={1}>
        <meshBasicMaterial color={palette.mutedForeground} transparent opacity={outline.planned ? 0.18 : 0.1} side={DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}
