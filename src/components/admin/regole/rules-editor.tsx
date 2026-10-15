"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { PieceType } from "@/domain/components/types"
import type { RuleKind, RuleSet, Severity } from "@/domain/rules/types"
import { useOptionalDraft } from "../draft-context"
import type { SaveOutcome } from "../editable-table"
import { NumberField } from "../number-field"
import {
  CATALOG_SECTIONS,
  formFromRule,
  KIND_LABELS,
  KIND_OPTIONS,
  newRuleForm,
  PIECE_TYPE_OPTIONS,
  ruleFromForm,
  ruleSetFromForms,
  SEVERITY_OPTIONS,
  type RuleForm,
  type SpanRow,
} from "./rule-forms"

/**
 * Regole costruttive (spec `regole-costruttive`, 9.6): una sezione per tipo di vincolo
 * (luci per tipo e sezione, interasse, sbalzo, altezza libera, pendenza con copertura
 * piana ammessa, sezioni minime), severità per regola, aggiunta solo dei tipi noti.
 * Salva l'elenco intero in `rules` dopo la validazione del dominio.
 */

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-sm"
const MM = { kind: "number", min: 1 } as const
const MM0 = { kind: "number", min: 0 } as const
const DEG = { kind: "number", min: 0, max: 90 } as const

export function RulesEditor({ ruleSet, readOnly = false, onSave }: { ruleSet: RuleSet; readOnly?: boolean; onSave?: (rules: unknown[]) => Promise<SaveOutcome> }) {
  const draft = useOptionalDraft()
  const save = onSave ?? ((rules: unknown[]) => (draft ? draft.save("rules", rules) : Promise.resolve({ ok: false as const, message: "salvataggio non disponibile" })))
  const key = JSON.stringify(ruleSet)
  const [forms, setForms] = React.useState(() => ruleSet.rules.map(formFromRule))
  const [dirty, setDirty] = React.useState(false)
  const [invalid, setInvalid] = React.useState<ReadonlySet<string>>(new Set())
  const [newKind, setNewKind] = React.useState<RuleKind>("max-joist-spacing")
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [saving, start] = React.useTransition()
  const latest = React.useRef(ruleSet)
  latest.current = ruleSet
  React.useEffect(() => {
    if (!dirty) setForms(latest.current.rules.map(formFromRule))
    // solo quando cambia il set del server
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const change = (uid: number, patch: Partial<RuleForm>) => {
    setForms((fs) => fs.map((f) => (f.uid === uid ? { ...f, ...patch } : f)))
    setDirty(true)
    setMessage(null)
  }
  const validity = (field: string) => (ok: boolean) =>
    setInvalid((s) => {
      const next = new Set(s)
      if (ok) next.delete(field)
      else next.add(field)
      return next
    })

  const parsed = ruleSetFromForms(ruleSet.id, ruleSet.name, forms)
  const canSave = !readOnly && dirty && invalid.size === 0 && parsed.ok && !saving

  return (
    <div className="space-y-4">
      <SectionsDatalist />
      {KIND_OPTIONS.map(({ value: kind, label }) => {
        const ofKind = forms.filter((f) => f.kind === kind)
        return (
          <section key={kind} aria-label={label} className="space-y-2 rounded-md border p-3">
            <h3 className="text-sm font-semibold">{label}</h3>
            {ofKind.length === 0 && <p className="text-xs text-muted-foreground">Nessuna regola di questo tipo.</p>}
            {ofKind.map((f) => (
              <RuleCard
                key={f.uid}
                form={f}
                readOnly={readOnly}
                onChange={(patch) => change(f.uid, patch)}
                onValidity={(field) => validity(`${f.uid}:${field}`)}
                onRemove={() => {
                  setForms((fs) => fs.filter((x) => x.uid !== f.uid))
                  setInvalid((s) => new Set([...s].filter((k) => !k.startsWith(`${f.uid}:`))))
                  setDirty(true)
                }}
              />
            ))}
          </section>
        )
      })}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            Nuova regola
            <select aria-label="Tipo della nuova regola" className={selectClass} value={newKind} onChange={(e) => setNewKind(e.target.value as RuleKind)}>
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setForms((fs) => [...fs, newRuleForm(newKind, new Set(fs.map((f) => f.id)))])
              setDirty(true)
            }}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Aggiungi regola
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            onClick={() =>
              parsed.ok &&
              start(async () => {
                const out = await save(forms.map(ruleFromForm))
                if (out.ok) setDirty(false)
                setMessage(out.ok ? { kind: "ok", text: "Salvato nella bozza" } : { kind: "error", text: out.message })
              })
            }
          >
            {saving ? "Salvataggio…" : "Salva nella bozza"}
          </Button>
          {!parsed.ok && (
            <span role="alert" className="text-xs text-destructive">
              {parsed.errors.join("; ")}
            </span>
          )}
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

function RuleCard({
  form: f,
  readOnly,
  onChange,
  onValidity,
  onRemove,
}: {
  form: RuleForm
  readOnly: boolean
  onChange: (patch: Partial<RuleForm>) => void
  onValidity: (field: string) => (ok: boolean) => void
  onRemove: () => void
}) {
  const who = f.name || f.id
  return (
    <fieldset disabled={readOnly} className="space-y-2 rounded border bg-muted/30 p-2">
      <legend className="sr-only">{`${KIND_LABELS[f.kind]}: ${who}`}</legend>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          Id
          <Input aria-label={`Id della regola ${who}`} className="h-8 w-44 font-mono" value={f.id} onChange={(e) => onChange({ id: e.target.value })} />
        </label>
        <label className="flex items-center gap-1">
          Nome
          <Input aria-label={`Nome della regola ${who}`} className="h-8 w-64" value={f.name} onChange={(e) => onChange({ name: e.target.value })} />
        </label>
        <label className="flex items-center gap-1">
          Severità
          <select aria-label={`Severità della regola ${who}`} className={selectClass} value={f.severity} onChange={(e) => onChange({ severity: e.target.value as Severity })}>
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="ghost" size="icon" className="ml-auto h-8 w-8" aria-label={`Rimuovi la regola ${who}`} onClick={onRemove}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        {f.kind === "max-joist-spacing" && <NumberField label="Interasse massimo" unit="mm" rules={MM} value={f.max} onValue={(max) => onChange({ max })} onValidity={onValidity("max")} />}
        {f.kind === "max-overhang" && (
          <>
            <NumberField label="Sbalzo massimo" unit="mm" rules={MM0} value={f.max} onValue={(max) => onChange({ max })} onValidity={onValidity("max")} />
            <details className="text-sm">
              <summary className="cursor-pointer">Si applica a: {f.pieceTypes.length ? f.pieceTypes.join(", ") : "tutti i pezzi con appoggi"}</summary>
              <div role="group" aria-label={`Tipi di pezzo della regola ${who}`} className="mt-1 flex max-w-xl flex-wrap gap-2">
                {PIECE_TYPE_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={f.pieceTypes.includes(o.value)}
                      onChange={(e) => onChange({ pieceTypes: e.target.checked ? [...f.pieceTypes, o.value] : f.pieceTypes.filter((t) => t !== o.value) })}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </details>
          </>
        )}
        {f.kind === "min-clear-height" && <NumberField label="Altezza libera minima" unit="mm" rules={MM} value={f.min} onValue={(min) => onChange({ min })} onValidity={onValidity("min")} />}
        {f.kind === "slope-range" && (
          <>
            <NumberField label="Pendenza minima" unit="°" rules={DEG} value={f.min} onValue={(min) => onChange({ min })} onValidity={onValidity("min")} />
            <NumberField label="Pendenza massima" unit="°" rules={{ ...DEG, min: 0.1 }} value={f.max} onValue={(max) => onChange({ max })} onValidity={onValidity("max")} />
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.allowFlat} aria-label={`Copertura piana ammessa nella regola ${who}`} onCheckedChange={(allowFlat) => onChange({ allowFlat })} />
              copertura piana ammessa
            </label>
          </>
        )}
        {f.kind === "min-section" && (
          <>
            <label className="flex items-center gap-1 text-sm">
              Tipo di pezzo
              <select aria-label={`Tipo di pezzo della regola ${who}`} className={selectClass} value={f.pieceType} onChange={(e) => onChange({ pieceType: e.target.value as PieceType })}>
                {PIECE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <SectionInput label={`Sezione minima della regola ${who}`} value={f.section} onChange={(section) => onChange({ section })} />
          </>
        )}
        {f.kind === "max-span-by-section" && <SpanTable who={who} rows={f.spans} onChange={(spans) => onChange({ spans })} onValidity={onValidity} />}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Descrizione
        <Input aria-label={`Descrizione della regola ${who}`} className="h-8" value={f.description} onChange={(e) => onChange({ description: e.target.value })} />
      </label>
    </fieldset>
  )
}

/** Suggerimenti delle sezioni del catalogo: un solo `datalist` per pagina. */
const SECTIONS_LIST_ID = "admin-rule-sections"

function SectionsDatalist() {
  return (
    <datalist id={SECTIONS_LIST_ID}>
      {CATALOG_SECTIONS.map((s) => (
        <option key={s} value={s} />
      ))}
    </datalist>
  )
}

function SectionInput({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return <Input aria-label={label} list={SECTIONS_LIST_ID} className="h-8 w-28" placeholder="b×h" value={value} onChange={(e) => onChange(e.target.value)} />
}

function SpanTable({ who, rows, onChange, onValidity }: { who: string; rows: readonly SpanRow[]; onChange: (rows: SpanRow[]) => void; onValidity: (field: string) => (ok: boolean) => void }) {
  // una tabella per tipo di pezzo alla volta (le luci sono centinaia): parte dal primo tipo
  const [filter, setFilter] = React.useState<string>(() => rows[0]?.pieceType ?? "")
  const set = (i: number, patch: Partial<SpanRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const shown = rows.map((r, i) => ({ r, i })).filter(({ r }) => !filter || r.pieceType === filter)
  return (
    <div className="w-full space-y-1">
      <div className="flex items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          Mostra
          <select aria-label={`Filtro per tipo della regola ${who}`} className={selectClass} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">tutti i tipi</option>
            {[...new Set(rows.map((r) => r.pieceType))].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-muted-foreground">{rows.length} luci tabellate</span>
      </div>
      <div className="max-h-80 overflow-auto rounded border">
        <table aria-label={`Luci della regola ${who}`} className="w-full text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th scope="col" className="px-2 py-1 text-left font-medium">
                Tipo di pezzo
              </th>
              <th scope="col" className="px-2 py-1 text-left font-medium">
                Sezione
              </th>
              <th scope="col" className="px-2 py-1 text-left font-medium">
                Luce massima (mm)
              </th>
              <th scope="col" className="w-10">
                <span className="sr-only">Azioni</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ r, i }) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1">
                  <select aria-label={`Tipo di pezzo riga ${i + 1}`} className={selectClass} value={r.pieceType} onChange={(e) => set(i, { pieceType: e.target.value as PieceType })}>
                    {PIECE_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <SectionInput label={`Sezione riga ${i + 1}`} value={r.section} onChange={(section) => set(i, { section })} />
                </td>
                <td className="px-2 py-1">
                  <NumberField label={`Luce massima riga ${i + 1}`} hideLabel rules={MM} value={r.max} onValue={(max) => set(i, { max })} onValidity={onValidity(`span${i}`)} />
                </td>
                <td>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Rimuovi la luce riga ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { pieceType: (filter || "travetto") as PieceType, section: "80×160", max: 3000 }])}>
        <Plus className="mr-1 h-4 w-4" aria-hidden />
        Aggiungi luce
      </Button>
    </div>
  )
}
