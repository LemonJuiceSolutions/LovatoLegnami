"use client"

import * as React from "react"
import { BufferAttribute, BufferGeometry, DoubleSide } from "three"
import type { Envelope } from "@/domain"
import { floorGrid, formatMm } from "./layer-helpers"
import { SceneLabel } from "./scene-label"
import type { ViewerPalette } from "./theme-colors"

/** Pavimento interpolato: superficie a griglia con le quote ai quattro angoli. */
export function FloorLayer({ envelope, palette, labels = true }: { envelope: Envelope; palette: ViewerPalette; /** Etichette tecniche (false nel wizard pubblico). */ labels?: boolean }) {
  const { box, floor } = envelope
  const grid = React.useMemo(() => floorGrid({ box, floor }), [box, floor])
  const surface = React.useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute("position", new BufferAttribute(grid.positions, 3))
    g.setIndex(new BufferAttribute(grid.indices, 1))
    g.computeVertexNormals()
    return g
  }, [grid])
  const lines = React.useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute("position", new BufferAttribute(grid.lines, 3))
    return g
  }, [grid])
  React.useEffect(
    () => () => {
      surface.dispose()
      lines.dispose()
    },
    [surface, lines]
  )

  return (
    <group name="pavimento">
      <mesh geometry={surface} raycast={() => null} renderOrder={1}>
        <meshStandardMaterial
          color={palette.muted}
          transparent
          opacity={0.7}
          side={DoubleSide}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <lineSegments geometry={lines} raycast={() => null}>
        <lineBasicMaterial color={palette.mutedForeground} transparent opacity={0.45} />
      </lineSegments>
      {labels && grid.corners.map((c) => (
        <SceneLabel key={c.name} position={[c.x, c.y, c.z]} muted>
          <span title={c.name}>{formatMm(c.z, true)}</span>
        </SceneLabel>
      ))}
    </group>
  )
}
