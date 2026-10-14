"use client"

import * as React from "react"
import { BoxGeometry } from "three"
import type { Piece } from "@/domain"
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

export interface PieceMeshProps {
  readonly piece: Piece
  readonly color: string
}

/** Pezzo come box sezione × lunghezza nella sua posa. */
export const PieceMesh = React.memo(function PieceMesh({ piece, color }: PieceMeshProps) {
  const transform = React.useMemo(() => poseToTransform(piece.pose), [piece.pose])
  return (
    <group position={transform.position} quaternion={transform.quaternion} name={piece.id}>
      <mesh geometry={getUnitBox()} scale={[piece.length, piece.section.b, piece.section.h]}>
        <meshStandardMaterial color={color} roughness={0.85} metalness={0} />
      </mesh>
    </group>
  )
})
