"use client"

import * as React from "react"
import { AlertTriangle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { getTypology, type ParamSpec, type ParamValue, type TypologyTemplate } from "@/domain"
import { useConfiguratore } from "@/stores/use-configuratore"
import { NumberField } from "./fields"
import { TypologyChooser } from "./typology-picker"
import { formatRange, groupParams, numberParamError, sectionOptions, unitLabel } from "./form-helpers"

/**
 * Form parametrico (spec `configuratore-ui`, "Form parametrico per tipologia"):
 * selettore della tipologia con miniature (`typology-picker.tsx`) e campi generati dai `ParamSpec` del
 * template (unità, min/max/step/default). Un valore fuori limite è scritto
 * nello store (`derived.paramErrors`), mostrato inline e non rigenera l'assieme.
 */

function useTemplate(slug: string): TypologyTemplate | null {
  return React.useMemo(() => {
    try {
      return getTypology(slug)
    } catch {
      return null
    }
  }, [slug])
}

function ParamField({ spec, value, storeError }: { spec: ParamSpec; value: ParamValue | undefined; storeError?: string }) {
  const setParam = useConfiguratore((s) => s.setParam)
  const id = `param-${spec.name}`

  switch (spec.kind) {
    case "number": {
      const n = typeof value === "number" ? value : undefined
      const error = n !== undefined ? numberParamError(spec, n) ?? storeError : storeError
      return (
        <div className="space-y-2" data-param={spec.name}>
          <NumberField
            id={id}
            label={spec.label}
            value={n}
            unit={unitLabel(spec.unit) || undefined}
            hint={`${spec.description ? `${spec.description} ` : ""}Ammesso ${formatRange(spec.min, spec.max, spec.unit)}.`}
            error={error}
            onValueChange={(v) => setParam(spec.name, v)}
          />
          {spec.unit === "°" && (
            <Slider
              aria-label={spec.label}
              min={spec.min}
              max={spec.max}
              step={spec.step ?? 1}
              value={[Math.min(spec.max, Math.max(spec.min, n ?? spec.default))]}
              onValueChange={([v]) => setParam(spec.name, v)}
            />
          )}
        </div>
      )
    }
    case "boolean":
      return (
        <div className="flex items-center justify-between gap-3" data-param={spec.name}>
          <Label htmlFor={id} className="text-xs font-medium">
            {spec.label}
          </Label>
          <Switch id={id} checked={value === true} onCheckedChange={(v) => setParam(spec.name, v)} />
        </div>
      )
    case "section": {
      const current = typeof value === "string" ? value : spec.default
      return (
        <div className="space-y-1.5" data-param={spec.name}>
          <Label htmlFor={id} className="text-xs font-medium">
            {spec.label}
          </Label>
          <Select value={current} onValueChange={(v) => setParam(spec.name, v)}>
            <SelectTrigger id={id} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sectionOptions(current).map((s) => (
                <SelectItem key={s} value={s}>
                  {s} mm
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {storeError && <p className="text-xs text-destructive">{storeError}</p>}
        </div>
      )
    }
  }
}

/** Campi della tipologia corrente: `part` sceglie geometria/struttura o le sezioni per famiglia. */
export function ParamFields({ part }: { part: "main" | "sections" }) {
  const typology = useConfiguratore((s) => s.config.typology)
  const params = useConfiguratore((s) => s.config.params)
  const paramErrors = useConfiguratore((s) => s.derived.paramErrors)
  const template = useTemplate(typology)
  if (!template) return null
  const specs = groupParams(template.params)[part]

  return (
    <div className="space-y-4">
      {specs.map((spec) => (
        <ParamField key={`${typology}-${spec.name}`} spec={spec} value={params[spec.name]} storeError={paramErrors[spec.name]} />
      ))}
    </div>
  )
}

/** Avviso globale: assieme non aggiornato (parametri non validi o errore di generazione). */
export function StaleNotice() {
  const stale = useConfiguratore((s) => s.derived.stale)
  const error = useConfiguratore((s) => s.derived.error)
  const hasParamErrors = useConfiguratore((s) => Object.keys(s.derived.paramErrors).length > 0)
  if (!stale || (!error && !hasParamErrors)) return null
  return (
    <Alert variant="destructive" className="py-3">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="text-xs">
        {error ?? "Correggi i valori evidenziati: l'assieme non è stato rigenerato."}
      </AlertDescription>
    </Alert>
  )
}

/** Form parametrico completo (tipologia + parametri + sezioni), senza contenitore. */
export function ParamForm() {
  return (
    <div className="space-y-6">
      <StaleNotice />
      <TypologyChooser />
      <ParamFields part="main" />
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Sezioni per famiglia</h3>
        <ParamFields part="sections" />
      </div>
    </div>
  )
}
