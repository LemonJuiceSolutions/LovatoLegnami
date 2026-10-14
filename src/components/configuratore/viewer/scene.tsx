"use client"

import * as React from "react"
import { Canvas } from "@react-three/fiber"
import { Bounds, GizmoHelper, GizmoViewport, Grid, OrbitControls, PerspectiveCamera } from "@react-three/drei"
import { Object3D } from "three"
import type { Assembly, Envelope } from "@/domain"
import type { PieceResult } from "@/geometry/protocol"
import { configuratoreStore } from "@/stores/use-configuratore"
import { useViewer } from "@/stores/viewer-store"
import { EnvelopeLayer } from "./envelope-layer"
import { FloorLayer } from "./floor-layer"
import { ObstaclesLayer } from "./obstacles-layer"
import { PergolaLayer } from "./pergola-layer"
import type { ViewerPalette } from "./theme-colors"

// Z verso l'alto in tutta la scena (camere, controlli, luci).
Object3D.DEFAULT_UP.set(0, 0, 1)

export interface SceneProps {
  readonly assembly: Assembly | null
  readonly envelope: Envelope
  readonly palette: ViewerPalette
  /** Risultati del kernel per id pezzo (mesh reali); vuoto = solo box. */
  readonly results: Readonly<Record<string, PieceResult>>
}

/** Posizione iniziale della camera: da davanti a sinistra, in alto, a distanza proporzionale all'ingombro. */
function initialCamera(envelope: Envelope) {
  const { width, depth, height } = envelope.box
  const size = Math.max(width, depth, height)
  const target: [number, number, number] = [width / 2, depth / 2, height / 3]
  const position: [number, number, number] = [target[0] - size * 0.9, target[1] - size * 1.6, target[2] + size * 1.0]
  return { target, position }
}

function SceneContent({ assembly, envelope, palette, results }: SceneProps) {
  const [cam] = React.useState(() => initialCamera(envelope))
  const layers = useViewer((s) => s.layers)
  const c = envelope.floor.corners
  const floorMin = Math.min(0, c.frontLeft, c.frontRight, c.backLeft, c.backRight, ...envelope.floor.points.map((p) => p.z))
  return (
    <>
      <color attach="background" args={[palette.background]} />
      <PerspectiveCamera makeDefault fov={40} near={10} far={200_000} position={cam.position} up={[0, 0, 1]} />
      <OrbitControls makeDefault target={cam.target} enableDamping={false} minDistance={200} maxDistance={80_000} />

      <hemisphereLight args={[palette.background, palette.mutedForeground, 0.7]} position={[0, 0, 1]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[-4000, -6000, 9000]} intensity={1.6} />
      <directionalLight position={[6000, 8000, 4000]} intensity={0.5} />

      <Grid
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, floorMin - 2]}
        cellSize={100}
        cellThickness={0.6}
        cellColor={palette.border}
        sectionSize={1000}
        sectionThickness={1}
        sectionColor={palette.mutedForeground}
        fadeDistance={40_000}
        fadeStrength={1.5}
        infiniteGrid
        followCamera={false}
      />
      <axesHelper args={[1000]} />

      <Bounds margin={1.25} maxDuration={0.6}>
        {layers.pavimento && <FloorLayer envelope={envelope} palette={palette} />}
        {layers.ingombro && <EnvelopeLayer envelope={envelope} palette={palette} />}
        {layers.ostacoli && <ObstaclesLayer envelope={envelope} palette={palette} />}
        <PergolaLayer assembly={assembly} envelope={envelope} results={results} palette={palette} />
      </Bounds>

      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport labelColor={palette.background} axisHeadScale={0.9} />
      </GizmoHelper>
    </>
  )
}

/** Canvas r3f della scena (mm, Z in alto); caricato solo lato client. */
export function Scene(props: SceneProps) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true }}
      className="h-full w-full touch-none"
      onPointerMissed={() => configuratoreStore.getState().selectPieces([])}
    >
      <SceneContent {...props} />
    </Canvas>
  )
}
