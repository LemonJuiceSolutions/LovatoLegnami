"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatCell, parseCell, type CellRules } from "./cells"
import { useDraft } from "./draft-context"
import type { ColumnOption } from "./editable-table"

/**
 * Parametri scalari di una sezione (es. lama e rifili, tariffa oraria, margini): un campo
 * per percorso del documento, con unità e la stessa validazione delle celle; salva solo i
 * campi cambiati in un unico salvataggio della bozza.
 */

export interface FieldDef extends CellRules {
  readonly path: string
  readonly label: string
  readonly unit?: string
  readonly help?: string
  readonly options?: readonly ColumnOption[]
}

export function FieldsForm({ title, fields, values, readOnly = false }: { title: string; fields: readonly FieldDef[]; values: Readonly<Record<string, unknown>>; readOnly?: boolean }) {
  const { saveMany } = useDraft()
  const initialKey = JSON.stringify(fields.map((f) => [f.path, formatCell(f, values[f.path])]))
  const [texts, setTexts] = React.useState<Record<string, string>>(() => Object.fromEntries(JSON.parse(initialKey)))
  React.useEffect(() => setTexts(Object.fromEntries(JSON.parse(initialKey))), [initialKey])
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [saving, start] = React.useTransition()
  const baseId = React.useId()

  const parsed = fields.map((f) => ({ f, r: parseCell(f, texts[f.path] ?? "") }))
  const errors = parsed.filter((p) => !p.r.ok)
  const changed = parsed.filter((p) => p.r.ok && JSON.stringify(p.r.value ?? null) !== JSON.stringify(values[p.f.path] ?? null))
  const canSave = !readOnly && !saving && errors.length === 0 && changed.length > 0

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    start(async () => {
      const out = await saveMany(changed.map(({ f, r }) => ({ path: f.path, value: r.ok ? (r.value ?? null) : null })))
      setMessage(out.ok ? { kind: "ok", text: "Salvato nella bozza" } : { kind: "error", text: out.message })
    })
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-md border p-3" aria-label={title}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {parsed.map(({ f, r }) => {
          const id = `${baseId}-${f.path}`
          const errorId = `${id}-err`
          const error = r.ok ? null : r.error
          return (
            <div key={f.path} className="space-y-1">
              <label htmlFor={id} className="text-sm font-medium">
                {f.label}
                {f.unit && <span className="ml-1 font-normal text-muted-foreground">({f.unit})</span>}
              </label>
              {f.kind === "select" ? (
                <select
                  id={id}
                  disabled={readOnly}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={texts[f.path] ?? ""}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(e) => {
                    setTexts((t) => ({ ...t, [f.path]: e.target.value }))
                    setMessage(null)
                  }}
                >
                  {f.optional && <option value="">—</option>}
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={id}
                  disabled={readOnly}
                  inputMode={f.kind === "text" ? undefined : "decimal"}
                  className={cn("h-9", f.kind !== "text" && "text-right tabular-nums", error && "border-destructive")}
                  value={texts[f.path] ?? ""}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : f.help ? `${id}-help` : undefined}
                  onChange={(e) => {
                    setTexts((t) => ({ ...t, [f.path]: e.target.value }))
                    setMessage(null)
                  }}
                />
              )}
              {error ? (
                <p id={errorId} role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              ) : (
                f.help && (
                  <p id={`${id}-help`} className="text-xs text-muted-foreground">
                    {f.help}
                  </p>
                )
              )}
            </div>
          )
        })}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={!canSave}>
            {saving ? "Salvataggio…" : "Salva nella bozza"}
          </Button>
          {message && (
            <span role={message.kind === "error" ? "alert" : "status"} className={cn("text-xs", message.kind === "error" ? "text-destructive" : "text-muted-foreground")}>
              {message.text}
            </span>
          )}
        </div>
      )}
    </form>
  )
}
