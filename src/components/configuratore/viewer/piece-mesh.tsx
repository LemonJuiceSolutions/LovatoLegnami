"use client"

import * as React from "react"
import { Edges } from "@react-three/drei"
import type { ThreeEvent } from "@react-three/fiber"
import { BoxGeometry, BufferAttribute, BufferGeometry } from "three"
import type { Piece } from "@/domain"
import type { PieceMesh as PieceMeshData } from "@/geometry/protocol"
import { curvedFallbackBoxes, poseToTransform } from "./viewer-helpers"

/** Box unitario con X ∈ [0, 1] e sezione centrata (convenzione locale del pezzo), condiviso da tutti i pezzi. */
let unitBox: BoxGeometry | null = null
function getUnitBox(): BoxGeometry {
  if (!unitBox) {
    unitBox = new BoxGeometry(1, 1, 1)
    unitBox.translate(0.5, 0, 0)
  }
  return unitBox
}

/** Box unitario centrato, condiviso dai tratti dei pezzi curvi in modalità semplificata. */
let centeredBox: BoxGeometry | null = null
function getCenteredBox(): BoxGeometry {
  if (!centeredBox) centeredBox = new BoxGeometry(1, 1, 1)
  return centeredBox
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
  /** Colore base (famiglia) o colore di evidenziazione (collisione/errore). */
  readonly color: string
  /** Mesh reale del kernel; assente = box semplificato sezione × lunghezza. */
  readonly mesh?: PieceMeshData
  /** Contorno (selezione o passaggio del puntatore); `undefined` = nessuno. */
  readonly outline?: string
  /** Pezzo attenuato (c'è una selezione che non lo comprende). */
  readonly dimmed?: boolean
  readonly onHover?: (id: string, hovering: boolean) => void
  readonly onSelect?: (id: string) => void
}

/** Spostamento massimo del puntatore (px) perché un rilascio valga come clic e non come orbita. */
const CLICK_TOLERANCE = 4

/**
 * Pezzo nella sua posa: mesh del kernel se disponibile (prioritaria anche per
 * i pezzi curvi), altrimenti box sezione × lunghezza; i pezzi curvi senza mesh
 * sono una catena di box di tratto (`pieceObbs`, nel sistema assieme).
 */
export const PieceMesh = React.memo(function PieceMesh({ piece, color, mesh, outline, dimmed, onHover, onSelect }: PieceMeshProps) {
  const transform = React.useMemo(() => poseToTransform(piece.pose), [piece.pose])
  const geometry = React.useMemo(() => (mesh ? kernelGeometry(mesh) : null), [mesh])
  const segments = React.useMemo(() => (mesh ? [] : curvedFallbackBoxes(piece)), [mesh, piece])
  React.useEffect(() => () => geometry?.dispose(), [geometry])

  const handlers = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      onHover?.(piece.id, true)
    },
    onPointerOut: () => onHover?.(piece.id, false),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      if (e.delta <= CLICK_TOLERANCE) onSelect?.(piece.id)
    },
  }
  const material = (
    <meshStandardMaterial
      key={dimmed ? "attenuato" : "pieno"}
      color={color}
      roughness={0.85}
      metalness={0}
      transparent={dimmed}
      opacity={dimmed ? 0.3 : 1}
      depthWrite={!dimmed}
    />
  )

  if (!geometry && segments.length > 0)
    return (
      <group name={piece.id} userData={{ curvedFallback: true }}>
        {segments.map((t, i) => (
          <mesh key={i} geometry={getCenteredBox()} position={t.position} quaternion={t.quaternion} scale={t.scale} {...handlers}>
            {material}
            {outline && <Edges color={outline} />}
          </mesh>
        ))}
      </group>
    )

  return (
    <group position={transform.position} quaternion={transform.quaternion} name={piece.id}>
      {geometry ? (
        <mesh geometry={geometry} {...handlers}>
          {material}
          {outline && <Edges color={outline} threshold={25} />}
        </mesh>
      ) : (
        <mesh geometry={getUnitBox()} scale={[piece.length, piece.section.b, piece.section.h]} {...handlers}>
          {material}
          {outline && <Edges color={outline} />}
        </mesh>
      )}
    </group>
  )
})
