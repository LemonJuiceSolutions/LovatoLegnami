"use client"

import * as React from "react"
import { Canvas, useThree } from "@react-three/fiber"
import { Bounds, OrbitControls } from "@react-three/drei"
import { Object3D } from "three"
import type { Assembly } from "@/domain/components/types"
import type { Envelope } from "@/domain/envelope/types"
import type { PieceResult } from "@/geometry/protocol"
import { EnvelopeLayer } from "@/components/configuratore/viewer/envelope-layer"
import { FloorLayer } from "@/components/configuratore/viewer/floor-layer"
import { ObstaclesLayer } from "@/components/configuratore/viewer/obstacles-layer"
import { PieceMesh } from "@/components/configuratore/viewer/piece-mesh"
import type { ViewerPalette } from "@/components/configuratore/viewer/theme-colors"
import { usableKernelMesh } from "@/components/configuratore/viewer/viewer-helpers"
import { registerSceneCapture } from "./scene-capture"

/**
 * Visualizzatore 3D del wizard (12.6, P9): caricato a richiesta (`React.lazy`) solo nel
 * riepilogo, così `three`/r3f non entrano nel JS iniziale. Mostra i pezzi come box
 * sezione × lunghezza (modalità box, nessun kernel) o con le mesh del kernel quando il
 * cliente chiede i dettagli; muro, pavimento e ostacoli dell'ingombro.
 */

Object3D.DEFAULT_UP.set(0, 0, 1)

export interface WizardViewerProps {
  readonly assembly: Assembly
  readonly envelope: Envelope
  readonly results: Readonly<Record<string, PieceResult>>
  readonly woodColor: string
  readonly dark: boolean
  readonly label: string
}

const LIGHT: ViewerPalette = { background: "#F4F6F2", foreground: "#231F20", primary: "#1B5A41", destructive: "#B42318", muted: "#E4E9E1", mutedForeground: "#55615A", border: "#CBD2C7", dark: false }
const DARK: ViewerPalette = { background: "#0F1A15", foreground: "#ECEBE3", primary: "#9EC2AF", destructive: "#F07167", muted: "#1C2A23", mutedForeground: "#A9B4AC", border: "#2E3D35", dark: true }

function CaptureRegistration() {
  const { gl, scene, camera } = useThree()
  React.useEffect(() => {
    registerSceneCapture(() => {
      try {
        gl.render(scene, camera)
        return gl.domElement.toDataURL("image/png")
      } catch {
        return null
      }
    })
    return () => registerSceneCapture(null)
  }, [gl, scene, camera])
  return null
}

export default function WizardViewer({ assembly, envelope, results, woodColor, dark, label }: WizardViewerProps) {
  const palette = dark ? DARK : LIGHT
  const { width, depth, height } = envelope.box
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: [-width * 0.55, -depth * 1.9, height * 1.3], fov: 40, near: 50, far: 200_000 }}
      className="h-full w-full touch-none"
      aria-label={label}
      role="img"
    >
      <color attach="background" args={[palette.background]} />
      <OrbitControls makeDefault enableDamping={false} minDistance={1500} maxDistance={60_000} maxPolarAngle={Math.PI * 0.49} />
      <hemisphereLight args={["#ffffff", "#7a6a55", 0.8]} position={[0, 0, 1]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[-4000, -6000, 9000]} intensity={1.7} />
      <directionalLight position={[6000, 8000, 4000]} intensity={0.45} />
      <Bounds fit clip observe margin={1.2}>
        <FloorLayer envelope={envelope} palette={palette} labels={false} />
        <EnvelopeLayer envelope={envelope} palette={palette} />
        <ObstaclesLayer envelope={envelope} palette={palette} labels={false} />
        <group name="pergola">
          {assembly.pieces.map((p) => (
            <PieceMesh key={p.id} piece={p} color={woodColor} mesh={usableKernelMesh(p, results[p.id])} />
          ))}
        </group>
      </Bounds>
      <CaptureRegistration />
    </Canvas>
  )
}
