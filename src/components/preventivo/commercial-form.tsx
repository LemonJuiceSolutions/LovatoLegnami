"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ACCESS_LEVELS, ANCHORING_KINDS } from "@/domain"
import { cn } from "@/lib/utils"
import { DEFAULT_COMMERCIAL, type CommercialOptions } from "@/stores/config"
import { useConfiguratore } from "@/stores/use-configuratore"
import { ACCESS_LABELS, ANCHORING_LABELS } from "./pricing-helpers"

/**
 * Opzioni commerciali del configuratore interno (10.2): finiture dal listino attivo
 * (specie, qualità, trattamento, copertura) e CAP di consegna; `SiteDeclaredFields`
 * (accesso al cantiere e ancoraggio) sta nel form dell'ingombro (spec `configuratore-ui`,
 * "Pianta e fattori di cantiere"). Tutto finisce in `config.commercial` e ricalcola solo
 * il preventivo.
 */

const NONE = "nessuno"
const AUTO = "dedotto"

function useCommercial(): CommercialOptions {
  return useConfiguratore((s) => s.config.commercial) ?? DEFAULT_COMMERCIAL
}

function Choice({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: readonly { id: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Voce scelta ma assente dal listino (es. configurazione di una richiesta su un listino precedente). */
const withCurrent = (options: readonly { id: string; label: string }[], current: string) =>
  options.some((o) => o.id === current) ? options : [...options, { id: current, label: `${current} (non a listino)` }]

export function CommercialForm() {
  const c = useCommercial()
  const priceList = useConfiguratore((s) => s.catalog.priceList)
  const setCommercial = useConfiguratore((s) => s.setCommercial)
  const [cap, setCap] = React.useState(c.cap ?? "")
  const [capError, setCapError] = React.useState<string | null>(null)
  React.useEffect(() => setCap(c.cap ?? ""), [c.cap])

  const t = priceList.timber
  return (
    <div className="grid grid-cols-2 gap-3">
      <Choice id="com-species" label="Specie" value={c.species} options={withCurrent(t.species, c.species)} onChange={(species) => setCommercial({ species })} />
      <Choice id="com-quality" label="Qualità" value={c.quality} options={withCurrent(t.qualities, c.quality)} onChange={(quality) => setCommercial({ quality })} />
      <Choice
        id="com-treatment"
        label="Trattamento"
        value={c.treatment ?? NONE}
        options={withCurrent([{ id: NONE, label: "Nessuno" }, ...priceList.treatments], c.treatment ?? NONE)}
        onChange={(v) => setCommercial({ treatment: v === NONE ? null : v })}
      />
      <Choice
        id="com-covering"
        label="Copertura"
        value={c.covering ?? NONE}
        options={withCurrent([{ id: NONE, label: "Nessuna" }, ...priceList.coverings], c.covering ?? NONE)}
        onChange={(v) => setCommercial({ covering: v === NONE ? null : v })}
      />
      <div className="col-span-2 space-y-1.5">
        <Label htmlFor="com-cap" className="text-xs font-medium">
          CAP di consegna
        </Label>
        <Input
          id="com-cap"
          inputMode="numeric"
          maxLength={5}
          className={cn("h-9", capError && "border-destructive focus-visible:ring-destructive")}
          placeholder="es. 37026"
          value={cap}
          aria-invalid={capError ? true : undefined}
          aria-describedby="com-cap-help"
          onChange={(e) => {
            const v = e.target.value.trim()
            setCap(v)
            if (v === "") {
              setCapError(null)
              setCommercial({ cap: undefined })
            } else if (/^\d{5}$/.test(v)) {
              setCapError(null)
              setCommercial({ cap: v })
            } else setCapError("CAP non valido (5 cifre)")
          }}
        />
        <p id="com-cap-help" className={cn("text-xs", capError ? "text-destructive" : "text-muted-foreground")}>
          {capError ?? "Zona di trasporto dal listino; vuoto = zona da verificare."}
        </p>
      </div>
    </div>
  )
}

/** Accesso al cantiere e ancoraggio dichiarati (fattori di cantiere non calcolabili). */
export function SiteDeclaredFields() {
  const c = useCommercial()
  const setCommercial = useConfiguratore((s) => s.setCommercial)
  return (
    <div className="grid grid-cols-2 gap-3">
      <Choice
        id="com-access"
        label="Accesso al cantiere"
        value={c.access}
        options={ACCESS_LEVELS.map((id) => ({ id, label: ACCESS_LABELS[id] }))}
        onChange={(v) => setCommercial({ access: v as CommercialOptions["access"] })}
      />
      <Choice
        id="com-anchoring"
        label="Ancoraggio"
        value={c.anchoring ?? AUTO}
        options={[{ id: AUTO, label: "Dedotto dalla tipologia" }, ...ANCHORING_KINDS.map((id) => ({ id, label: ANCHORING_LABELS[id] }))]}
        onChange={(v) => setCommercial({ anchoring: v === AUTO ? undefined : (v as CommercialOptions["anchoring"]) })}
      />
    </div>
  )
}
