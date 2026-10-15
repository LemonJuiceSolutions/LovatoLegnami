"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { formatCell, parseCell, type CellRules } from "./cells"

/**
 * Tabella modificabile generica dell'area admin (P10, 9.2): colonne tipizzate (testo,
 * numero con unità e virgola decimale, importo in euro salvato in centesimi, scelta,
 * interruttore, sola lettura), aggiungi/rimuovi riga, validazione per cella con messaggi
 * in italiano annunciati, navigazione da tastiera (frecce su/giù e Invio tra le righe),
 * ricerca e intestazione fissa. Non salva da sola: `onSave` riceve le righe valide.
 */

export interface ColumnOption {
  readonly value: string
  readonly label: string
}

export interface Column<R> extends CellRules {
  readonly key: Extract<keyof R, string>
  readonly header: string
  /** Unità mostrata nell'intestazione e accanto al valore (`€/m³`, `mm`, `%`). */
  readonly unit?: string
  readonly options?: readonly ColumnOption[]
  /** Controllo aggiuntivo sul valore letto (messaggio d'errore o `null`). */
  readonly validate?: (value: unknown, row: R) => string | null
  readonly placeholder?: string
  /** Testo della cella in sola lettura (anche per la ricerca). */
  readonly display?: (row: R) => string
  /** Contenuto della cella in sola lettura (es. un collegamento); prevale su `display`. */
  readonly render?: (row: R) => React.ReactNode
  readonly width?: string
}

export type SaveOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string }

export interface EditableTableProps<R> {
  /** Titolo della tabella (didascalia e nome accessibile). */
  readonly label: string
  readonly description?: string
  readonly columns: readonly Column<R>[]
  readonly rows: readonly R[]
  /** Riga nuova; senza, la tabella ha righe fisse (niente aggiungi/rimuovi). */
  readonly newRow?: () => R
  readonly onSave: (rows: R[]) => Promise<SaveOutcome>
  /** Controllo sull'insieme delle righe (es. duplicati): messaggio o `null`. */
  readonly validateRows?: (rows: readonly R[]) => string | null
  /** Sola lettura (utente senza permesso). */
  readonly readOnly?: boolean
  readonly searchable?: boolean
  readonly toolbar?: React.ReactNode
  readonly saveLabel?: string
}

interface RowState<R> {
  readonly id: number
  readonly values: R
}

let nextId = 1
const wrap = <R,>(rows: readonly R[]): RowState<R>[] => rows.map((values) => ({ id: nextId++, values }))
type CellMap = Readonly<Record<string, string>>
type RowMaps = Readonly<Record<number, CellMap>>
const EMPTY: CellMap = {}

/** Mappa per riga con la cella aggiornata (`null` toglie la voce); le altre righe restano identiche. */
function setCell(maps: RowMaps, rowId: number, key: string, value: string | null): RowMaps {
  const row = { ...(maps[rowId] ?? EMPTY) }
  if (value === null) delete row[key]
  else row[key] = value
  const next = { ...maps }
  if (Object.keys(row).length) next[rowId] = row
  else delete next[rowId]
  return next
}

export function EditableTable<R extends Record<string, unknown>>(props: EditableTableProps<R>) {
  const { label, description, columns, newRow, onSave, validateRows, readOnly = false, toolbar } = props
  const [rows, setRows] = React.useState(() => wrap(props.rows))
  const [texts, setTexts] = React.useState<RowMaps>({})
  const [errors, setErrors] = React.useState<RowMaps>({})
  const [dirty, setDirty] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [saving, startSaving] = React.useTransition()
  const tableRef = React.useRef<HTMLTableElement>(null)
  const baseId = React.useId()

  // Righe nuove dal server (dopo il salvataggio o un import): si riparte da lì se non ci sono modifiche locali.
  const rowsKey = JSON.stringify(props.rows)
  const incoming = React.useRef(rowsKey)
  const latestRows = React.useRef(props.rows)
  latestRows.current = props.rows
  React.useEffect(() => {
    if (incoming.current === rowsKey || dirty) return
    incoming.current = rowsKey
    setRows(wrap(latestRows.current))
    setTexts({})
    setErrors({})
  }, [rowsKey, dirty])

  const searchable = props.searchable ?? props.rows.length > 8
  const q = query.trim().toLowerCase()
  const visible = q
    ? rows.filter((r) => columns.some((c) => (c.display ? c.display(r.values) : String(r.values[c.key] ?? "")).toLowerCase().includes(q)))
    : rows

  const touch = React.useCallback(() => {
    setDirty(true)
    setMessage(null)
  }, [])

  const update = React.useCallback(
    (rowId: number, key: string, value: unknown) => {
      setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [key]: value } } : r)))
      touch()
    },
    [touch],
  )

  const onText = React.useCallback(
    (row: RowState<R>, col: Column<R>, text: string) => {
      setTexts((t) => setCell(t, row.id, col.key, text))
      touch()
      const parsed = parseCell(col, text)
      if (!parsed.ok) return setErrors((e) => setCell(e, row.id, col.key, parsed.error))
      const extra = col.validate?.(parsed.value, { ...row.values, [col.key]: parsed.value }) ?? null
      setErrors((e) => setCell(e, row.id, col.key, extra))
      if (!extra) update(row.id, col.key, parsed.value)
    },
    [touch, update],
  )

  const focusCell = React.useCallback((rowIndex: number, colIndex: number) => {
    tableRef.current?.querySelector<HTMLElement>(`[data-cell="${rowIndex}:${colIndex}"]`)?.focus()
  }, [])

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
      if (e.key === "ArrowDown" || (e.key === "Enter" && !(e.target instanceof HTMLSelectElement))) {
        e.preventDefault()
        focusCell(rowIndex + 1, colIndex)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        focusCell(rowIndex - 1, colIndex)
      }
    },
    [focusCell],
  )

  const remove = React.useCallback(
    (rowId: number) => {
      setRows((rs) => rs.filter((r) => r.id !== rowId))
      setErrors((e) => {
        const next = { ...e }
        delete next[rowId]
        return next
      })
      touch()
    },
    [touch],
  )

  const add = () => {
    if (!newRow) return
    const row = { id: nextId++, values: newRow() }
    setRows((rs) => [...rs, row])
    touch()
    setQuery("")
    // le celle obbligatorie vuote della riga nuova sono subito segnalate
    const missing: Record<string, string> = {}
    for (const col of columns) {
      if (col.kind === "readonly" || col.kind === "switch") continue
      const parsed = parseCell(col, formatCell(col, row.values[col.key]))
      if (!parsed.ok) missing[col.key] = parsed.error
    }
    if (Object.keys(missing).length) setErrors((e) => ({ ...e, [row.id]: missing }))
    requestAnimationFrame(() => focusCell(rows.length, 0))
  }

  const rowsError = validateRows?.(rows.map((r) => r.values)) ?? null
  const errorCount = Object.values(errors).reduce((n, m) => n + Object.keys(m).length, 0)
  const canSave = !readOnly && dirty && errorCount === 0 && !rowsError && !saving

  const save = () => {
    if (!canSave) return
    startSaving(async () => {
      const outcome = await onSave(rows.map((r) => r.values))
      if (outcome.ok) {
        setDirty(false)
        setTexts({})
        setMessage({ kind: "ok", text: "Salvato nella bozza" })
      } else setMessage({ kind: "error", text: outcome.message })
    })
  }

  const captionId = `${baseId}-caption`
  const removable = !!newRow && !readOnly
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id={captionId} className="text-sm font-semibold">
            {label}
          </h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <Input
              type="search"
              aria-label={`Cerca in ${label}`}
              placeholder="Cerca…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-44"
            />
          )}
          {toolbar}
        </div>
      </div>
      <div className="max-h-[60vh] overflow-auto rounded border">
        <table ref={tableRef} aria-labelledby={captionId} className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-2 py-1.5 text-left font-medium", c.width)}>
                  {c.header}
                  {c.unit && <span className="ml-1 font-normal text-muted-foreground">({c.unit})</span>}
                </th>
              ))}
              {removable && (
                <th scope="col" className="w-10 px-2 py-1.5">
                  <span className="sr-only">Azioni</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-2 py-3 text-center text-muted-foreground">
                  {rows.length === 0 ? "Nessuna riga" : "Nessuna riga corrisponde alla ricerca"}
                </td>
              </tr>
            )}
            {visible.map((row, rowIndex) => (
              <TableRow<R>
                key={row.id}
                row={row}
                rowIndex={rowIndex}
                n={rows.indexOf(row) + 1}
                columns={columns}
                texts={texts[row.id] ?? EMPTY}
                errors={errors[row.id] ?? EMPTY}
                baseId={baseId}
                readOnly={readOnly}
                removable={removable}
                onText={onText}
                onUpdate={update}
                onKeyDown={onKeyDown}
                onRemove={remove}
              />
            ))}
          </tbody>
        </table>
      </div>
      {rowsError && (
        <p role="alert" className="text-xs text-destructive">
          {rowsError}
        </p>
      )}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          {newRow && (
            <Button type="button" variant="outline" size="sm" onClick={add}>
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              Aggiungi riga
            </Button>
          )}
          <Button type="button" size="sm" onClick={save} disabled={!canSave}>
            {saving ? "Salvataggio…" : (props.saveLabel ?? "Salva nella bozza")}
          </Button>
          {errorCount > 0 && <span className="text-xs text-destructive">{errorCount === 1 ? "1 cella da correggere" : `${errorCount} celle da correggere`}</span>}
          {message && (
            <span role={message.kind === "error" ? "alert" : "status"} className={cn("text-xs", message.kind === "error" ? "text-destructive" : "text-muted-foreground")}>
              {message.text}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

interface TableRowProps<R> {
  readonly row: RowState<R>
  readonly rowIndex: number
  readonly n: number
  readonly columns: readonly Column<R>[]
  readonly texts: CellMap
  readonly errors: CellMap
  readonly baseId: string
  readonly readOnly: boolean
  readonly removable: boolean
  readonly onText: (row: RowState<R>, col: Column<R>, text: string) => void
  readonly onUpdate: (rowId: number, key: string, value: unknown) => void
  readonly onKeyDown: (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => void
  readonly onRemove: (rowId: number) => void
}

/** Riga memorizzata: digitando in una cella si ridisegna solo la sua riga. */
const TableRow = React.memo(function TableRow<R extends Record<string, unknown>>(p: TableRowProps<R>) {
  const { row, rowIndex, n, columns, texts, errors, baseId, readOnly } = p
  return (
    <tr className="border-t align-top">
      {columns.map((col, colIndex) => {
        const error = errors[col.key]
        const errorId = `${baseId}-${row.id}-${col.key}-err`
        const common = {
          "data-cell": `${rowIndex}:${colIndex}`,
          "aria-label": `${col.header} riga ${n}`,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error ? errorId : undefined,
          disabled: readOnly,
          onKeyDown: (e: React.KeyboardEvent) => p.onKeyDown(e, rowIndex, colIndex),
        }
        let control: React.ReactNode
        if (col.kind === "readonly") control = col.render ? col.render(row.values) : <span className="block py-1.5">{col.display ? col.display(row.values) : formatCell(col, row.values[col.key])}</span>
        else if (col.kind === "switch") control = <Switch {...common} checked={row.values[col.key] === true} onCheckedChange={(v) => p.onUpdate(row.id, col.key, v)} />
        else if (col.kind === "select")
          control = (
            <select
              {...common}
              className={cn("h-8 w-full rounded-md border border-input bg-background px-2 text-sm", error && "border-destructive")}
              value={String(row.values[col.key] ?? "")}
              onChange={(e) => p.onText(row, col, e.target.value)}
            >
              {(col.optional || row.values[col.key] === undefined || row.values[col.key] === "") && <option value="">—</option>}
              {(col.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )
        else
          control = (
            <div className="flex items-center gap-1">
              <Input
                {...common}
                type="text"
                inputMode={col.kind === "text" ? undefined : "decimal"}
                placeholder={col.placeholder}
                className={cn("h-8", col.kind !== "text" && "text-right tabular-nums", error && "border-destructive")}
                value={texts[col.key] ?? formatCell(col, row.values[col.key])}
                onChange={(e) => p.onText(row, col, e.target.value)}
              />
              {col.unit && <span className="shrink-0 text-xs text-muted-foreground">{col.unit}</span>}
            </div>
          )
        return (
          <td key={col.key} className={cn("px-2 py-1", col.width)}>
            {control}
            {error && (
              <p id={errorId} role="alert" className="mt-0.5 text-xs text-destructive">
                {error}
              </p>
            )}
          </td>
        )
      })}
      {p.removable && (
        <td className="px-2 py-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Rimuovi riga ${n}`} onClick={() => p.onRemove(row.id)}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </td>
      )}
    </tr>
  )
}) as <R extends Record<string, unknown>>(p: TableRowProps<R>) => React.ReactElement
