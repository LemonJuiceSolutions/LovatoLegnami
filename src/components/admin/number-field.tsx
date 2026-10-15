"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatCell, parseCell, type CellRules } from "./cells"

/**
 * Campo numerico con unità e virgola decimale fuori dalle tabelle (regole costruttive,
 * tipologie): tiene il testo digitato, segnala l'errore annunciato e comunica il valore
 * solo quando è valido (`onValidity` per bloccare il salvataggio).
 */
export function NumberField({
  label,
  value,
  unit,
  rules,
  onValue,
  onValidity,
  disabled,
  className,
  hideLabel = false,
}: {
  label: string
  value: number | undefined
  unit?: string
  rules: CellRules
  onValue: (value: number | undefined) => void
  onValidity?: (valid: boolean) => void
  disabled?: boolean
  className?: string
  hideLabel?: boolean
}) {
  const id = React.useId()
  const [text, setText] = React.useState(() => formatCell(rules, value))
  const [error, setError] = React.useState<string | null>(null)
  const shown = React.useRef(value)
  // valore cambiato dall'esterno (ricarica): si riparte da lì
  React.useEffect(() => {
    if (shown.current === value) return
    shown.current = value
    setText(formatCell(rules, value))
    setError(null)
  }, [value, rules])
  return (
    <span className={cn("inline-flex flex-col gap-0.5", className)}>
      <span className="flex items-center gap-1">
        <label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm"}>
          {label}
        </label>
        <Input
          id={id}
          inputMode="decimal"
          disabled={disabled}
          className={cn("h-8 w-28 text-right tabular-nums", error && "border-destructive")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const r = parseCell(rules, e.target.value)
            setError(r.ok ? null : r.error)
            onValidity?.(r.ok)
            if (r.ok) {
              shown.current = r.value as number | undefined
              onValue(r.value as number | undefined)
            }
          }}
        />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </span>
      {error && (
        <span id={`${id}-err`} role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  )
}
