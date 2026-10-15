"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  OBSTACLE_TYPES,
  SIDES,
  WALL_SIDES,
  type Obstacle,
  type ObstacleType,
  type Side,
  type WallSide,
} from "@/domain"
import type { ActionResult } from "@/stores/configuratore-store"
import { useConfiguratore } from "@/stores/use-configuratore"
import { SiteDeclaredFields } from "@/components/preventivo/commercial-form"
import { NumberField } from "./fields"

/**
 * Form dell'ingombro del cliente (spec `configuratore-ui` e `ingombro-cliente`):
 * box, lato muro, affondamento, ostacoli (aggiungi/modifica/rimuovi) e quote
 * del pavimento ai 4 angoli più punti extra. Le azioni dello store validano
 * l'input: se non è valido lo stato resta invariato e l'errore è mostrato
 * sotto il campo.
 */

export const OBSTACLE_TYPE_LABELS: Record<ObstacleType, string> = {
  sottomuro: "Sottomuro",
  finestra: "Finestra",
  grondaia: "Grondaia",
  sporgenza: "Sporgenza",
  generico: "Generico",
}

export const SIDE_LABELS: Record<Side, string> = {
  posteriore: "Posteriore",
  anteriore: "Anteriore",
  sinistro: "Sinistro",
  destro: "Destro",
  pavimento: "Pavimento",
  soffitto: "Soffitto",
}

const CORNERS = [
  ["frontLeft", "Anteriore sinistro"],
  ["frontRight", "Anteriore destro"],
  ["backLeft", "Posteriore sinistro"],
  ["backRight", "Posteriore destro"],
] as const

/** Errori per campo: `run(key, result)` registra o cancella l'errore dell'azione. */
function useFieldErrors() {
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const run = React.useCallback((key: string, result: ActionResult | void) => {
    setErrors((prev) => {
      if (!result || result.ok) {
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: result.issues[0]?.message ?? result.error }
    })
  }, [])
  return { errors, run }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h4>
}

function SmallSelect<T extends string>({
  id,
  label,
  value,
  options,
  labels,
  onChange,
}: {
  id: string
  label: string
  value: T
  options: readonly T[]
  labels: Record<T, string>
  onChange: (v: T) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {labels[o]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ObstacleEditor({ obstacle }: { obstacle: Obstacle }) {
  const updateObstacle = useConfiguratore((s) => s.updateObstacle)
  const removeObstacle = useConfiguratore((s) => s.removeObstacle)
  const { errors, run } = useFieldErrors()
  const id = `ost-${obstacle.id}`
  const vertical = obstacle.side !== "pavimento" && obstacle.side !== "soffitto"

  return (
    <div className="space-y-3 rounded-md border p-3" data-obstacle={obstacle.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {obstacle.id} · {OBSTACLE_TYPE_LABELS[obstacle.type]}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          aria-label={`Rimuovi ${obstacle.id}`}
          onClick={() => removeObstacle(obstacle.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-label`} className="text-xs font-medium">
          Descrizione
        </Label>
        <Input
          id={`${id}-label`}
          className="h-9"
          value={obstacle.label ?? ""}
          placeholder="es. Grondaia di casa"
          onChange={(e) => run("label", updateObstacle(obstacle.id, { label: e.target.value || undefined }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SmallSelect
          id={`${id}-type`}
          label="Tipo"
          value={obstacle.type}
          options={OBSTACLE_TYPES}
          labels={OBSTACLE_TYPE_LABELS}
          onChange={(type) => run("type", updateObstacle(obstacle.id, { type }))}
        />
        <SmallSelect
          id={`${id}-side`}
          label="Lato"
          value={obstacle.side}
          options={SIDES}
          labels={SIDE_LABELS}
          onChange={(side) => run("side", updateObstacle(obstacle.id, { side }))}
        />
        <NumberField
          id={`${id}-offset`}
          label="Posizione"
          unit="mm"
          value={obstacle.offset}
          hint={vertical && (obstacle.side === "sinistro" || obstacle.side === "destro") ? "Dal fronte" : "Da sinistra"}
          error={errors.offset}
          onValueChange={(offset) => run("offset", updateObstacle(obstacle.id, { offset }))}
        />
        <NumberField
          id={`${id}-width`}
          label="Larghezza"
          unit="mm"
          value={obstacle.width}
          placeholder="tutto il lato"
          error={errors.width}
          onValueChange={(width) => run("width", updateObstacle(obstacle.id, { width }))}
          onClear={() => run("width", updateObstacle(obstacle.id, { width: undefined }))}
        />
        <NumberField
          id={`${id}-elevation`}
          label={vertical ? "Quota" : "Distanza dal fronte"}
          unit="mm"
          value={obstacle.elevation}
          error={errors.elevation}
          onValueChange={(elevation) => run("elevation", updateObstacle(obstacle.id, { elevation }))}
        />
        <NumberField
          id={`${id}-height`}
          label={vertical ? "Altezza" : "Profondità"}
          unit="mm"
          value={obstacle.height}
          error={errors.height}
          onValueChange={(height) => run("height", updateObstacle(obstacle.id, { height }))}
        />
        <NumberField
          id={`${id}-projection`}
          label="Sporgenza"
          unit="mm"
          value={obstacle.projection}
          hint="Verso l'interno"
          error={errors.projection}
          onValueChange={(projection) => run("projection", updateObstacle(obstacle.id, { projection }))}
        />
      </div>
    </div>
  )
}

export function EnvelopeForm() {
  const envelope = useConfiguratore((s) => s.config.envelope)
  const embedment = useConfiguratore((s) => s.config.embedment)
  const setBox = useConfiguratore((s) => s.setBox)
  const setEnvelope = useConfiguratore((s) => s.setEnvelope)
  const setEmbedment = useConfiguratore((s) => s.setEmbedment)
  const addObstacle = useConfiguratore((s) => s.addObstacle)
  const setFloor = useConfiguratore((s) => s.setFloor)
  const { errors, run } = useFieldErrors()
  const { box, floor } = envelope

  const addGutter = () =>
    run(
      "obstacles",
      addObstacle({
        type: "grondaia",
        side: envelope.wallSide,
        elevation: Math.max(0, box.height - 300),
        height: 150,
      })
    )

  const setPoint = (index: number, patch: Partial<{ x: number; y: number; z: number }>) =>
    run(
      `point-${index}`,
      setFloor({ points: floor.points.map((p, i) => (i === index ? { ...p, ...patch } : p)) })
    )

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <SectionTitle>Box d&apos;ingombro</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <NumberField id="env-width" label="Larghezza (fronte)" unit="mm" value={box.width} error={errors.width} onValueChange={(width) => run("width", setBox({ width }))} />
          <NumberField id="env-depth" label="Profondità" unit="mm" value={box.depth} error={errors.depth} onValueChange={(depth) => run("depth", setBox({ depth }))} />
          <NumberField id="env-height" label="Altezza" unit="mm" value={box.height} error={errors.height} onValueChange={(height) => run("height", setBox({ height }))} />
          <SmallSelect<WallSide>
            id="env-wall"
            label="Lato muro"
            value={envelope.wallSide}
            options={WALL_SIDES}
            labels={SIDE_LABELS}
            onChange={(wallSide) => run("wallSide", setEnvelope({ ...envelope, obstacles: [...envelope.obstacles], floor: { corners: envelope.floor.corners, points: [...envelope.floor.points] }, wallSide }))}
          />
          <NumberField
            id="env-embedment"
            label="Affondamento pilastri"
            unit="mm"
            value={embedment}
            error={errors.embedment}
            onValueChange={(mm) => run("embedment", setEmbedment(mm))}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>Ostacoli</SectionTitle>
          <Button variant="outline" size="sm" className="h-8" onClick={addGutter}>
            <Plus className="mr-1 h-4 w-4" />
            Aggiungi ostacolo
          </Button>
        </div>
        {errors.obstacles && <p className="text-xs text-destructive">{errors.obstacles}</p>}
        {envelope.obstacles.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nessun ostacolo: grondaie, finestre, sporgenze del muro…</p>
        ) : (
          envelope.obstacles.map((o) => <ObstacleEditor key={o.id} obstacle={o} />)
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <SectionTitle>Cantiere</SectionTitle>
        <SiteDeclaredFields />
      </div>

      <Separator />

      <div className="space-y-3">
        <SectionTitle>Quote pavimento</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {CORNERS.map(([key, label]) => (
            <NumberField
              key={key}
              id={`floor-${key}`}
              label={label}
              unit="mm"
              value={floor.corners[key]}
              error={errors[key]}
              onValueChange={(z) => run(key, setFloor({ corners: { [key]: z } }))}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Punti extra ({floor.points.length})</span>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => run("points", setFloor({ points: [...floor.points, { x: box.width / 2, y: box.depth / 2, z: 0 }] }))}
          >
            <Plus className="mr-1 h-4 w-4" />
            Aggiungi punto
          </Button>
        </div>
        {floor.points.map((p, i) => (
          <React.Fragment key={i}>
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2" data-floor-point={i}>
            <NumberField id={`floor-p${i}-x`} label="X" unit="mm" value={p.x} onValueChange={(x) => setPoint(i, { x })} />
            <NumberField id={`floor-p${i}-y`} label="Y" unit="mm" value={p.y} onValueChange={(y) => setPoint(i, { y })} />
            <NumberField id={`floor-p${i}-z`} label="Quota" unit="mm" value={p.z} onValueChange={(z) => setPoint(i, { z })} />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive"
              aria-label={`Rimuovi punto ${i + 1}`}
              onClick={() => run("points", setFloor({ points: floor.points.filter((_, j) => j !== i) }))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {errors[`point-${i}`] && <p className="text-xs text-destructive">{errors[`point-${i}`]}</p>}
          </React.Fragment>
        ))}
        {errors.points && <p className="text-xs text-destructive">{errors.points}</p>}
      </div>
    </div>
  )
}
