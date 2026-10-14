"use client"

import * as React from "react"
import { Html, useBounds } from "@react-three/drei"
import { Box3, Vector3 } from "three"
import type { Assembly, Envelope, Piece } from "@/domain"
import type { PieceResult } from "@/geometry/protocol"
import { cn } from "@/lib/utils"
import { configuratoreStore, useConfiguratore } from "@/stores/use-configuratore"
import { PieceMesh } from "./piece-mesh"
import { pieceCenter, pieceMessages, pieceSummary, piecesBounds, problemPieceIds } from "./piece-info"
import { FAMILY_COLORS, type ViewerPalette } from "./theme-colors"
import { usableKernelMesh } from "./viewer-helpers"

/** Numero massimo di pezzi selezionati che mostrano l'etichetta (oltre, solo al passaggio del puntatore). */
const MAX_SELECTION_LABELS = 3

function PieceLabel({ piece, envelope }: { piece: Piece; envelope: Envelope }) {
  const collisions = useConfiguratore((s) => s.derived.collisions)
  const violations = useConfiguratore((s) => s.derived.violations)
  const messages = React.useMemo(
    () => pieceMessages(piece.id, collisions, violations, envelope),
    [piece.id, collisions, violations, envelope]
  )
  const s = pieceSummary(piece)
  return (
    <Html position={pieceCenter(piece)} zIndexRange={[30, 10]} style={{ pointerEvents: "none" }}>
      <div
        data-piece-label={piece.id}
        className="ml-3 w-max max-w-[280px] -translate-y-1/2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
      >
        <p className="font-semibold">
          {s.id} <span className="font-normal text-muted-foreground">· {s.type}</span>
        </p>
        <p className="mt-0.5 text-muted-foreground">
          Sezione {s.section} · Lunghezza {s.length}
        </p>
        {messages.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 border-t pt-1.5">
            {messages.map((m, i) => (
              <li key={i} className={cn("leading-snug", m.tone === "errore" ? "text-destructive" : "text-muted-foreground")}>
                {m.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Html>
  )
}

/**
 * Inquadra i pezzi selezionati dall'esterno (pannello esiti) con `Bounds`;
 * le selezioni fatte cliccando nella scena non spostano la camera.
 */
function SelectionFramer({ pieces, localSelection }: { pieces: readonly Piece[]; localSelection: React.MutableRefObject<readonly string[] | null> }) {
  const bounds = useBounds()
  const selection = useConfiguratore((s) => s.selection)
  React.useEffect(() => {
    if (selection.length === 0 || selection === localSelection.current) return
    const box = piecesBounds(pieces, selection)
    if (!box || !bounds) return
    bounds
      .refresh(new Box3(new Vector3(box.min.x, box.min.y, box.min.z), new Vector3(box.max.x, box.max.y, box.max.z)))
      .reset()
      .fit()
    // solo al cambio di selezione: un nuovo assieme non deve spostare la camera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])
  return null
}

/** Pezzi della pergola con evidenziazione (problemi, selezione, passaggio del puntatore) ed etichette. */
export function PergolaLayer({
  assembly,
  envelope,
  results,
  palette,
}: {
  assembly: Assembly | null
  envelope: Envelope
  results: Readonly<Record<string, PieceResult>>
  palette: ViewerPalette
}) {
  const collisions = useConfiguratore((s) => s.derived.collisions)
  const violations = useConfiguratore((s) => s.derived.violations)
  const selection = useConfiguratore((s) => s.selection)
  const [hovered, setHovered] = React.useState<string | null>(null)
  const localSelection = React.useRef<readonly string[] | null>(null)

  const problems = React.useMemo(() => problemPieceIds(collisions, violations), [collisions, violations])
  const selected = React.useMemo(() => new Set(selection), [selection])
  const pieces = React.useMemo(() => assembly?.pieces ?? [], [assembly])

  const onHover = React.useCallback((id: string, on: boolean) => setHovered((cur) => (on ? id : cur === id ? null : cur)), [])
  const onSelect = React.useCallback((id: string) => {
    const store = configuratoreStore.getState()
    const cur = store.selection
    store.selectPieces(cur.length === 1 && cur[0] === id ? [] : [id])
    localSelection.current = configuratoreStore.getState().selection
  }, [])

  React.useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : ""
    return () => {
      document.body.style.cursor = ""
    }
  }, [hovered])

  const labelled = React.useMemo(() => {
    const ids = new Set<string>()
    if (hovered) ids.add(hovered)
    if (selection.length <= MAX_SELECTION_LABELS) for (const id of selection) ids.add(id)
    return pieces.filter((p) => ids.has(p.id))
  }, [hovered, selection, pieces])

  return (
    <group name="pergola">
      {pieces.map((p) => {
        const isSelected = selected.has(p.id)
        return (
          <PieceMesh
            key={p.id}
            piece={p}
            color={problems.has(p.id) ? palette.destructive : FAMILY_COLORS[p.family]}
            mesh={usableKernelMesh(p, results[p.id])}
            outline={isSelected ? palette.primary : hovered === p.id ? palette.mutedForeground : undefined}
            dimmed={selection.length > 0 && !isSelected}
            onHover={onHover}
            onSelect={onSelect}
          />
        )
      })}
      {labelled.map((p) => (
        <PieceLabel key={p.id} piece={p} envelope={envelope} />
      ))}
      <SelectionFramer pieces={pieces} localSelection={localSelection} />
    </group>
  )
}
