"use client"

import * as React from "react"
import { BoxGeometry, BufferAttribute, BufferGeometry } from "three"
import type { Piece } from "@/domain"
import type { PieceMesh as PieceMeshData } from "@/geometry/protocol"
import { poseToTransform } from "./viewer-helpers"

/** Box unitario con X ∈ [0, 1] e sezione centrata (convenzione locale del pezzo), condiviso da tutti i pezzi. */
let unitBox: BoxGeometry | null = null
function getUnitBox(): BoxGeometry {
  if (!unitBox) {
    unitBox = new BoxGeometry(1, 1, 1)
    unitBox.translate(0.5, 0, 0)
  }
  return unitBox
}

/** `BufferGeometry` dalla mesh del kernel (coordinate locali del pezzo). */
export function kernelGeometry(mesh: PieceMeshData): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute("position", new BufferAttribute(mesh.positions, 3))
  if (mesh.normals.length === mesh.positions.length) g.setAttribute("normal", new BufferAttribute(mesh.normals, 3))
  else g.computeVertexNormals()
  g.setIndex(new BufferAttribute(mesh.indices, 1))
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

export interface PieceMeshProps {
  readonly piece: Piece
  readonly color: string
  /** Mesh reale del kernel; assente = box semplificato sezione × lunghezza. */
  readonly mesh?: PieceMeshData
}

/** Pezzo nella sua posa: mesh del kernel se disponibile, altrimenti box sezione × lunghezza. */
export const PieceMesh = React.memo(function PieceMesh({ piece, color, mesh }: PieceMeshProps) {
  const transform = React.useMemo(() => poseToTransform(piece.pose), [piece.pose])
  const geometry = React.useMemo(() => (mesh ? kernelGeometry(mesh) : null), [mesh])
  React.useEffect(() => () => geometry?.dispose(), [geometry])

  return (
    <group position={transform.position} quaternion={transform.quaternion} name={piece.id}>
      {geometry ? (
        <mesh geometry={geometry}>
          <meshStandardMaterial color={color} roughness={0.85} metalness={0} />
        </mesh>
      ) : (
        <mesh geometry={getUnitBox()} scale={[piece.length, piece.section.b, piece.section.h]}>
          <meshStandardMaterial color={color} roughness={0.85} metalness={0} />
        </mesh>
      )}
    </group>
  )
})
