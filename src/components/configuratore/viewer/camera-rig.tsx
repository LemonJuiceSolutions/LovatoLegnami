"use client"

import * as React from "react"
import { useThree } from "@react-three/fiber"
import { OrthographicCamera, PerspectiveCamera } from "@react-three/drei"
import type { OrthographicCamera as OrthoCam, PerspectiveCamera as PerspCam } from "three"
import type { Assembly, Envelope } from "@/domain"
import { useViewer } from "@/stores/viewer-store"
import { isOrthographicView, orthoZoom, sceneBounds, viewPose } from "./camera-views"

const FOV = 40

interface ControlsLike {
  target: { set(x: number, y: number, z: number): unknown }
  update(): unknown
}

/**
 * Applica la vista corrente e le richieste "inquadra tutto" (store del
 * visualizzatore): posiziona la camera sulla direzione della vista e la
 * inquadra sull'unione dei bounding box di pergola e ingombro. Un nuovo
 * assieme non sposta la camera: si inquadra solo su richiesta.
 */
function Framer({ assembly, envelope }: { assembly: Assembly | null; envelope: Envelope }) {
  const view = useViewer((s) => s.view)
  const frameRequest = useViewer((s) => s.frameRequest)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const invalidate = useThree((s) => s.invalidate)
  const data = React.useRef({ assembly, envelope, width, height })
  data.current = { assembly, envelope, width, height }
  const ready = width > 0 && height > 0

  React.useEffect(() => {
    if (!controls || !ready) return
    const d = data.current
    const box = sceneBounds(d.assembly, d.envelope)
    const pose = viewPose(view, box, FOV, d.width / d.height)
    camera.up.set(0, 0, 1)
    camera.position.set(...pose.position)
    if ((camera as OrthoCam).isOrthographicCamera) {
      ;(camera as OrthoCam).zoom = orthoZoom(view, box, d.width, d.height)
    }
    ;(camera as PerspCam | OrthoCam).updateProjectionMatrix()
    controls.target.set(...pose.target)
    controls.update()
    invalidate()
  }, [frameRequest, view, camera, controls, ready, invalidate])

  return null
}

/** Camera prospettica o ortografica secondo la vista, più l'inquadratura. */
export function CameraRig({ assembly, envelope }: { assembly: Assembly | null; envelope: Envelope }) {
  const ortho = useViewer((s) => isOrthographicView(s.view))
  return (
    <>
      {ortho ? (
        <OrthographicCamera makeDefault near={1} far={1_000_000} up={[0, 0, 1]} />
      ) : (
        <PerspectiveCamera makeDefault fov={FOV} near={10} far={300_000} up={[0, 0, 1]} />
      )}
      <Framer assembly={assembly} envelope={envelope} />
    </>
  )
}
