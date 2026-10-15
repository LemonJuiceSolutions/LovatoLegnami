"use client"

import * as React from "react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlanMeasuresError, getTypology, measuresFromPlan, planFromDiagonals, planOf, type Plan, type PlanMeasures } from "@/domain"
import { configuratoreStore, useConfiguratore } from "@/stores/use-configuratore"
import { NumberField } from "./fields"
import {
  PLAN_MODES,
  PLAN_MODE_LABELS,
  anglesFromPlan,
  envelopeWithPlan,
  planFromAngles,
  planSummary,
  type AngleMeasures,
  type PlanMode,
} from "./plan-helpers"
import { formatDeg } from "./viewer/layer-helpers"

/**
 * Pianta dell'ingombro (spec `configuratore-ui`, "Pianta e fattori di cantiere"):
 * rettangolare, fuori squadra dagli angoli o dalle diagonali. Le misure sono stato del
 * form; la pianta risultante va nello store (`envelope.plan`, box = rettangolo
 * contenitore). Misure incoerenti ⇒ "misure non coerenti" e store invariato.
 */

const DIAGONAL_FIELDS: readonly [keyof PlanMeasures, string, string?][] = [
  ["front", "Fronte"],
  ["back", "Lato al muro"],
  ["left", "Fianco sinistro"],
  ["right", "Fianco destro"],
  ["d1", "Diagonale 1", "Ant. sinistro → post. destro"],
  ["d2", "Diagonale 2", "Ant. destro → post. sinistro"],
]

const ANGLE_FIELDS: readonly [keyof AngleMeasures, string, string][] = [
  ["front", "Fronte", "mm"],
  ["left", "Fianco sinistro", "mm"],
  ["right", "Fianco destro", "mm"],
  ["angleLeft", "Angolo ant. sinistro", "°"],
  ["angleRight", "Angolo ant. destro", "°"],
]

const roundMeasures = (m: PlanMeasures): PlanMeasures =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v)])) as unknown as PlanMeasures

const planKey = (p: Plan | undefined) => (p ? p.corners.map((c) => `${c.x.toFixed(3)},${c.y.toFixed(3)}`).join(";") : "")

export function PlanSection() {
  const envelope = useConfiguratore((s) => s.config.envelope)
  const typology = useConfiguratore((s) => s.config.typology)
  const setEnvelope = useConfiguratore((s) => s.setEnvelope)
  const [mode, setMode] = React.useState<PlanMode>(envelope.plan ? "diagonali" : "rettangolare")
  const [diag, setDiag] = React.useState<PlanMeasures>(() => roundMeasures(measuresFromPlan(planOf(envelope))))
  const [angles, setAngles] = React.useState<AngleMeasures>(() => anglesFromPlan(planOf(envelope)))
  const [error, setError] = React.useState<string | null>(null)
  // ultima pianta scritta dal form: un cambio diverso (file, preset, richiesta) riallinea le misure
  const produced = React.useRef(planKey(envelope.plan))

  const key = planKey(envelope.plan)
  React.useEffect(() => {
    if (key === produced.current) return
    produced.current = key
    const current = configuratoreStore.getState().config.envelope
    setDiag(roundMeasures(measuresFromPlan(planOf(current))))
    setAngles(anglesFromPlan(planOf(current)))
    setError(null)
    setMode((m) => (!current.plan ? "rettangolare" : m === "rettangolare" ? "diagonali" : m))
  }, [key])

  const apply = (plan: Plan | null) => {
    const current = configuratoreStore.getState().config.envelope
    const r = setEnvelope(envelopeWithPlan(current, plan))
    if (!r.ok) {
      setError(r.issues[0]?.message ?? r.error)
      return
    }
    produced.current = planKey(configuratoreStore.getState().config.envelope.plan)
    setError(null)
  }

  const tryPlan = (build: () => Plan) => {
    try {
      apply(build())
    } catch (e) {
      if (e instanceof PlanMeasuresError) setError(e.message)
      else throw e
    }
  }

  const changeMode = (next: PlanMode) => {
    const current = configuratoreStore.getState().config.envelope
    setMode(next)
    setDiag(roundMeasures(measuresFromPlan(planOf(current))))
    setAngles(anglesFromPlan(planOf(current)))
    if (next === "rettangolare") apply(null)
    else if (!current.plan) apply(planOf(current))
    else setError(null)
  }

  const summary = planSummary(envelope)
  const followsWall = React.useMemo(() => {
    try {
      return Boolean(getTypology(typology).wallPlanes)
    } catch {
      return false
    }
  }, [typology])

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="plan-mode" className="text-xs font-medium">
          Pianta
        </Label>
        <Select value={mode} onValueChange={(v) => changeMode(v as PlanMode)}>
          <SelectTrigger id="plan-mode" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAN_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {PLAN_MODE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {mode === "diagonali" && (
        <div className="grid grid-cols-2 gap-3">
          {DIAGONAL_FIELDS.map(([k, label, hint]) => (
            <NumberField
              key={k}
              id={`plan-${k}`}
              label={label}
              unit="mm"
              hint={hint}
              value={diag[k]}
              onValueChange={(v) => {
                const next = { ...diag, [k]: v }
                setDiag(next)
                tryPlan(() => planFromDiagonals(next))
              }}
            />
          ))}
        </div>
      )}

      {mode === "angoli" && (
        <div className="grid grid-cols-2 gap-3">
          {ANGLE_FIELDS.map(([k, label, unit]) => (
            <NumberField
              key={k}
              id={`plan-${k}`}
              label={label}
              unit={unit}
              value={angles[k]}
              onValueChange={(v) => {
                const next = { ...angles, [k]: v }
                setAngles(next)
                tryPlan(() => planFromAngles(next))
              }}
            />
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive" data-testid="plan-error">
          {error}
        </p>
      )}

      {summary && (
        <p className="text-xs text-muted-foreground" data-testid="plan-deviation">
          Deviazione dallo squadro {formatDeg(summary.maxDeg)} · muro ruotato di {formatDeg(summary.wallDeg)}
          {followsWall && summary.wallDeg > 0.05 ? ": banchina e teste dei travetti seguono il muro reale." : "."}
        </p>
      )}
    </div>
  )
}
