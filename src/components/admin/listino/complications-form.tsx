"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { ComplicationRule, SiteFactorKey } from "@/domain/pricing/types"
import { useOptionalDraft } from "../draft-context"
import type { SaveOutcome } from "../editable-table"
import {
  draftFromRule,
  EFFECT_OPTIONS,
  effectUnit,
  emptyCondition,
  emptyRule,
  ENUM_OPS,
  enumValues,
  FACTOR_OPTIONS,
  factorUnit,
  isEnumFactor,
  NUMERIC_OPS,
  ruleFromDraft,
  rulesFromDrafts,
  sentence,
  withFactor,
  type ConditionDraft,
  type RuleDraft,
} from "./complication-rules"

/**
 * Regole di complicazione come frasi (spec `back-office-admin`, 9.3): per ogni regola
 * "Se [fattore] [confronto] [soglia] (e …) allora [effetto] [valore]", etichetta mostrata
 * al cliente, spiegazione interna, attiva/disattiva e ordine (le regole sono valutate
 * nell'ordine dell'elenco). Salva l'elenco intero in `complications`.
 */

const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm"

export function ComplicationsForm({ rules, readOnly = false, onSave }: { rules: readonly ComplicationRule[]; readOnly?: boolean; onSave?: (rules: ComplicationRule[]) => Promise<SaveOutcome> }) {
  const draft = useOptionalDraft()
  const save = onSave ?? ((r: ComplicationRule[]) => (draft ? draft.save("complications", r) : Promise.resolve({ ok: false as const, message: "salvataggio non disponibile" })))
  const key = JSON.stringify(rules)
  const [items, setItems] = React.useState(() => rules.map((r) => ({ uid: nextUid++, d: draftFromRule(r) })))
  const [dirty, setDirty] = React.useState(false)
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [saving, start] = React.useTransition()
  const latest = React.useRef(rules)
  latest.current = rules
  React.useEffect(() => {
    if (!dirty) setItems(latest.current.map((r) => ({ uid: nextUid++, d: draftFromRule(r) })))
    // solo quando cambiano le regole del server
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const { rules: parsed, errors } = rulesFromDrafts(items.map((i) => i.d))
  const change = (uid: number, f: (d: RuleDraft) => RuleDraft) => {
    setItems((xs) => xs.map((x) => (x.uid === uid ? { ...x, d: f(x.d) } : x)))
    setDirty(true)
    setMessage(null)
  }
  const move = (index: number, delta: number) => {
    setItems((xs) => {
      const next = [...xs]
      const [it] = next.splice(index, 1)
      next.splice(index + delta, 0, it!)
      return next
    })
    setDirty(true)
  }
  const canSave = !readOnly && dirty && errors.size === 0 && !saving

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Complicazioni di cantiere</h3>
        <p className="text-xs text-muted-foreground">
          Valutate nell&apos;ordine dell&apos;elenco; le percentuali sulle ore valgono sulle ore base di montaggio (non si sommano tra loro). L&apos;etichetta compare al cliente nel preventivo.
        </p>
      </div>
      <ol className="space-y-3">
        {items.map((item, index) => (
          <RuleEditor
            key={item.uid}
            index={index}
            count={items.length}
            draft={item.d}
            errors={errors.get(index) ?? []}
            readOnly={readOnly}
            onChange={(f) => change(item.uid, f)}
            onMove={(delta) => move(index, delta)}
            onRemove={() => {
              setItems((xs) => xs.filter((x) => x.uid !== item.uid))
              setDirty(true)
            }}
          />
        ))}
      </ol>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setItems((xs) => [...xs, { uid: nextUid++, d: emptyRule() }])
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
              start(async () => {
                const out = await save(parsed)
                if (out.ok) setDirty(false)
                setMessage(out.ok ? { kind: "ok", text: "Salvato nella bozza" } : { kind: "error", text: out.message })
              })
            }
          >
            {saving ? "Salvataggio…" : "Salva nella bozza"}
          </Button>
          {errors.size > 0 && <span className="text-xs text-destructive">{errors.size === 1 ? "1 regola da completare" : `${errors.size} regole da completare`}</span>}
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

let nextUid = 1


function RuleEditor({
  index,
  count,
  draft: d,
  errors,
  readOnly,
  onChange,
  onMove,
  onRemove,
}: {
  index: number
  count: number
  draft: RuleDraft
  errors: readonly string[]
  readOnly: boolean
  onChange: (f: (d: RuleDraft) => RuleDraft) => void
  onMove: (delta: number) => void
  onRemove: () => void
}) {
  const n = index + 1
  const baseId = React.useId()
  const preview = ruleFromDraft(d)
  const setCondition = (i: number, c: ConditionDraft) => onChange((r) => ({ ...r, conditions: r.conditions.map((x, j) => (j === i ? c : x)) }))
  return (
    <li className={cn("rounded-md border p-3", !d.enabled && "opacity-70")}>
      <fieldset disabled={readOnly} className="space-y-2">
        <legend className="sr-only">Regola {n}</legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {n}. {d.label || "Nuova regola"}
            {d.id && <span className="ml-2 font-mono text-xs text-muted-foreground">{d.id}</span>}
          </p>
          <div className="flex items-center gap-1">
            <label className="mr-2 flex items-center gap-2 text-xs">
              <Switch checked={d.enabled} aria-label={`Regola ${n} attiva`} onCheckedChange={(v) => onChange((r) => ({ ...r, enabled: v }))} />
              {d.enabled ? "attiva" : "disattivata"}
            </label>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Sposta su la regola ${n}`} disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUp className="h-4 w-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Sposta giù la regola ${n}`} disabled={index === count - 1} onClick={() => onMove(1)}>
              <ArrowDown className="h-4 w-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Rimuovi la regola ${n}`} onClick={onRemove}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>

        {d.conditions.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-12 font-medium">{i === 0 ? "Se" : "e"}</span>
            <select
              aria-label={`Fattore della condizione ${i + 1} della regola ${n}`}
              className={selectClass}
              value={c.factor}
              onChange={(e) => setCondition(i, withFactor(c, e.target.value as SiteFactorKey))}
            >
              {FACTOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              aria-label={`Confronto della condizione ${i + 1} della regola ${n}`}
              className={selectClass}
              value={c.op}
              onChange={(e) => setCondition(i, { ...c, op: e.target.value as ConditionDraft["op"], values: c.values.slice(0, e.target.value === "==" ? 1 : undefined) })}
            >
              {(isEnumFactor(c.factor) ? ENUM_OPS : NUMERIC_OPS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {isEnumFactor(c.factor) ? (
              <span role="group" aria-label={`Valori della condizione ${i + 1} della regola ${n}`} className="flex flex-wrap gap-2">
                {enumValues(c.factor).map((v) => (
                  <label key={v} className="flex items-center gap-1">
                    <input
                      type={c.op === "in" ? "checkbox" : "radio"}
                      name={`${baseId}-c${i}`}
                      checked={c.values.includes(v)}
                      onChange={(e) =>
                        setCondition(i, { ...c, values: c.op === "in" ? (e.target.checked ? [...c.values, v] : c.values.filter((x) => x !== v)) : [v] })
                      }
                    />
                    {v}
                  </label>
                ))}
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Input
                  aria-label={`Soglia della condizione ${i + 1} della regola ${n}`}
                  inputMode="decimal"
                  className="h-9 w-24 text-right"
                  value={c.number}
                  onChange={(e) => setCondition(i, { ...c, number: e.target.value })}
                />
                <span className="text-xs text-muted-foreground">{factorUnit(c.factor)}</span>
              </span>
            )}
            {d.conditions.length > 1 && (
              <Button type="button" variant="ghost" size="sm" aria-label={`Togli la condizione ${i + 1} della regola ${n}`} onClick={() => onChange((r) => ({ ...r, conditions: r.conditions.filter((_, j) => j !== i) }))}>
                togli
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => onChange((r) => ({ ...r, conditions: [...r.conditions, emptyCondition()] }))}>
          + aggiungi una condizione (e)
        </Button>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-12 font-medium">allora</span>
          <select aria-label={`Effetto della regola ${n}`} className={selectClass} value={d.effect} onChange={(e) => onChange((r) => ({ ...r, effect: e.target.value as RuleDraft["effect"] }))}>
            {EFFECT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Input aria-label={`Valore dell'effetto della regola ${n}`} inputMode="decimal" className="h-9 w-24 text-right" value={d.amount} onChange={(e) => onChange((r) => ({ ...r, amount: e.target.value }))} />
          <span className="text-xs text-muted-foreground">{effectUnit(d.effect)}</span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Etichetta per il cliente</span>
            <Input aria-label={`Etichetta per il cliente della regola ${n}`} value={d.label} onChange={(e) => onChange((r) => ({ ...r, label: e.target.value }))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Spiegazione interna</span>
            <Input aria-label={`Spiegazione della regola ${n}`} value={d.explain} onChange={(e) => onChange((r) => ({ ...r, explain: e.target.value }))} />
          </label>
        </div>
        {errors.length > 0 ? (
          <ul role="alert" className="list-disc pl-5 text-xs text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : (
          preview.ok && <p className="text-xs text-muted-foreground">{sentence(preview.rule)}</p>
        )}
      </fieldset>
    </li>
  )
}
