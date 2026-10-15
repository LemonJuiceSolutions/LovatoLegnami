"use client"

import * as React from "react"
import { Html } from "@react-three/drei"
import type { ThreeEvent } from "@react-three/fiber"
import { BoxGeometry, CylinderGeometry } from "three"
import type { Assembly } from "@/domain"
import { configuratoreStore } from "@/stores/use-configuratore"
import { hardwareSymbols, type HardwareSymbol } from "./hardware-symbols"
import type { ViewerPalette } from "./theme-colors"

/**
 * Livello "ferramenta" (spec `visualizzatore-3d`): cilindri per i bulloni,
 * box per staffe/giunti/cuspidi; al passaggio del puntatore un'etichetta con
 * codice e pezzi collegati, al clic la selezione dei pezzi collegati.
 * Colori dal tema (metallo = `muted-foreground`, evidenziato = `primary`).
 */

let unitCylinder: CylinderGeometry | null = null
let unitBox: BoxGeometry | null = null
const cylinder = () => (unitCylinder ??= new CylinderGeometry(1, 1, 1, 16))
const box = () => (unitBox ??= new BoxGeometry(1, 1, 1))

/** Spostamento massimo del puntatore (px) perché un rilascio valga come clic. */
const CLICK_TOLERANCE = 4

function SymbolLabel({ symbol }: { symbol: HardwareSymbol }) {
  return (
    <Html position={symbol.position} zIndexRange={[30, 10]} style={{ pointerEvents: "none" }}>
      <div
        data-hardware-label={symbol.id}
        className="ml-3 w-max max-w-[260px] -translate-y-1/2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
      >
        <p className="font-semibold">
          {symbol.code} <span className="font-normal text-muted-foreground">· {symbol.id}</span>
        </p>
        <p className="mt-0.5 text-muted-foreground">{symbol.description}</p>
        {symbol.pieceIds.length > 0 && <p className="mt-1 border-t pt-1">Pezzi: {symbol.pieceIds.join(", ")}</p>}
      </div>
    </Html>
  )
}

const SymbolMesh = React.memo(function SymbolMesh({
  symbol,
  color,
  onHover,
}: {
  symbol: HardwareSymbol
  color: string
  onHover: (id: string, on: boolean) => void
}) {
  const scale: [number, number, number] =
    symbol.shape === "cylinder" ? [symbol.radius, symbol.length, symbol.radius] : symbol.size
  return (
    <mesh
      name={symbol.id}
      geometry={symbol.shape === "cylinder" ? cylinder() : box()}
      position={symbol.position}
      quaternion={symbol.quaternion}
      scale={scale}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        onHover(symbol.id, true)
      }}
      onPointerOut={() => onHover(symbol.id, false)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        if (e.delta <= CLICK_TOLERANCE && symbol.pieceIds.length > 0) configuratoreStore.getState().selectPieces(symbol.pieceIds)
      }}
    >
      <meshStandardMaterial color={color} roughness={0.35} metalness={0.6} />
    </mesh>
  )
})

/** Simboli della ferramenta dell'assieme (montato solo con il livello attivo). */
export function HardwareLayer({ assembly, palette }: { assembly: Assembly | null; palette: ViewerPalette }) {
  const symbols = React.useMemo(() => hardwareSymbols(assembly?.hardware ?? []), [assembly])
  const [hovered, setHovered] = React.useState<string | null>(null)
  const onHover = React.useCallback((id: string, on: boolean) => setHovered((cur) => (on ? id : cur === id ? null : cur)), [])
  const hoveredSymbol = hovered ? symbols.find((s) => s.id === hovered) : undefined

  return (
    <group name="ferramenta">
      {symbols.map((s) => (
        <SymbolMesh key={s.id} symbol={s} color={s.id === hovered ? palette.primary : palette.mutedForeground} onHover={onHover} />
      ))}
      {hoveredSymbol && <SymbolLabel symbol={hoveredSymbol} />}
    </group>
  )
}
