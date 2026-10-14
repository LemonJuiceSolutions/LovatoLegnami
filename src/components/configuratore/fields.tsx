"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { formatNumberInput, parseNumberInput } from "./form-helpers"

export interface NumberFieldProps {
  id: string
  label: string
  value: number | undefined
  /** Unità mostrata a destra del campo (`mm`, `°`). */
  unit?: string
  /** Testo d'aiuto sotto il campo (es. intervallo ammesso). */
  hint?: string
  /** Errore inline (ha la precedenza sull'aiuto). */
  error?: string
  /** Chiamato a ogni modifica con un numero valido (anche fuori limite: decide il chiamante). */
  onValueChange: (value: number) => void
  /** Campo facoltativo: svuotarlo chiama `onClear` invece di segnalare un errore. */
  onClear?: () => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

/**
 * Campo numerico controllato: accetta la virgola decimale e mantiene il testo
 * digitato finché corrisponde al valore dello store (così "12," non diventa
 * "12" mentre si scrive). Testo non numerico → errore locale, nessun aggiornamento.
 */
export function NumberField({ id, label, value, unit, hint, error, onValueChange, onClear, placeholder, className, disabled }: NumberFieldProps) {
  const [text, setText] = React.useState(value === undefined ? "" : formatNumberInput(value))
  const [localError, setLocalError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setText((prev) => {
      const parsed = parseNumberInput(prev)
      if (value === undefined) return parsed === undefined ? prev : ""
      return parsed === value ? prev : formatNumberInput(value)
    })
    setLocalError(null)
  }, [value])

  const shownError = localError ?? error
  const describedBy = shownError || hint ? `${id}-help` : undefined

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={describedBy}
          className={cn("h-9", unit && "pr-10", shownError && "border-destructive focus-visible:ring-destructive")}
          onChange={(e) => {
            const next = e.target.value
            setText(next)
            const n = parseNumberInput(next)
            if (n === undefined && onClear && next.trim() === "") {
              setLocalError(null)
              onClear()
              return
            }
            if (n === undefined) {
              setLocalError("Inserire un numero")
              return
            }
            setLocalError(null)
            onValueChange(n)
          }}
        />
        {unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      {(shownError || hint) && (
        <p id={describedBy} className={cn("text-xs", shownError ? "text-destructive" : "text-muted-foreground")}>
          {shownError ?? hint}
        </p>
      )}
    </div>
  )
}
