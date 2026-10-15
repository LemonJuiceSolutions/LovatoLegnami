"use client"

import * as React from "react"
import { BoxGeometry, EdgesGeometry } from "three"
import type { Envelope } from "@/domain"
import { obstacleBoxes } from "./layer-helpers"
import { SceneLabel } from "./scene-label"
import { OBSTACLE_LABELS, obstacleColor, type ViewerPalette } from "./theme-colors"

let unit: { box: BoxGeometry; edges: EdgesGeometry } | null = null
function unitGeometry() {
  if (!unit) {
    const box = new BoxGeometry(1, 1, 1)
    unit = { box, edges: new EdgesGeometry(box) }
  }
  return unit
}

/** Ostacoli come volumi semitrasparenti colorati per tipo, con etichetta. */
export function ObstaclesLayer({ envelope, palette }: { envelope: Envelope; palette: ViewerPalette }) {
  const boxes = React.useMemo(() => obstacleBoxes(envelope), [envelope])
  const g = unitGeometry()
  return (
    <group name="ostacoli">
      {boxes.map((o) => {
        const color = obstacleColor(o.type, palette)
        return (
          <group key={o.id} position={o.center} rotation={[0, 0, o.rotationZ]} scale={o.size}>
            <mesh geometry={g.box} raycast={() => null} renderOrder={2}>
              <meshStandardMaterial color={color} transparent opacity={o.ignored ? 0.12 : 0.35} depthWrite={false} />
            </mesh>
            <lineSegments geometry={g.edges} raycast={() => null}>
              <lineBasicMaterial color={color} transparent opacity={o.ignored ? 0.4 : 0.9} />
            </lineSegments>
          </group>
        )
      })}
      {boxes.map((o) => (
        <SceneLabel key={o.id} position={[o.center[0], o.center[1], o.center[2] + o.size[2] / 2]} muted>
          {OBSTACLE_LABELS[o.type]} {o.id}
          {o.ignored ? " (fuori ingombro)" : ""}
        </SceneLabel>
      ))}
    </group>
  )
}
