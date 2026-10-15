"use client"

import * as React from "react"
import Link from "next/link"
import { getTypology } from "@/domain/typologies/registry"
import { clampMeasure, measureFields, type MeasureField } from "./answers"
import { cm, metres } from "./format"
import { Notice, RangeSlider, StepHeading } from "./ui"
import { useWizard, useWizardContext } from "./wizard-context"

/**
 * Passo 2 (12.4, spec "Misure con limiti comprensibili"): larghezza, profondità (o sbalzo)
 * e altezza sotto trave con cursore e campo in centimetri entro i limiti del modello.
 * Oltre il massimo il valore si ferma con "Per misure maggiori contattaci"; sotto il
 * minimo si ferma al minimo. Si vedono subito pilastri e distanza tra i pilastri; sezioni
 * e opzioni costruttive sono scelte in automatico e non compaiono.
 */
export function StepMeasures() {
  const { data } = useWizardContext()
  const slug = useWizard((s) => s.answers.tipologia.slug)
  const misure = useWizard((s) => s.answers.misure)
  const posts = useWizard((s) => s.derived.posts)
  const error = useWizard((s) => s.derived.error)
  const setMeasure = useWizard((s) => s.setMeasure)
  const fields = React.useMemo(() => (slug ? measureFields(getTypology(slug)) : []), [slug])
  const [limited, setLimited] = React.useState<Record<string, "max" | "min" | null>>({})
  const title = data.typologies.find((t) => t.slug === slug)?.title

  const onValue = (f: MeasureField, raw: number) => {
    const r = clampMeasure(f, raw)
    setLimited((l) => ({ ...l, [f.key]: r.limited }))
    setMeasure(f.key, r.value)
  }

  return (
    <section aria-labelledby="passo-titolo">
      <StepHeading
        id="passo-titolo"
        eyebrow={title ? `Passo 2 · ${title}` : "Passo 2"}
        title="Quanto la vuoi grande?"
        intro="Partiamo dalle misure del modello: spostale con il cursore o scrivile in centimetri. Le sezioni del legno le calcoliamo noi."
      />
      <div className="space-y-10">
        {fields.map((f) => (
          <MeasureControl key={f.key} field={f} value={misure[f.key] ?? f.minCm} limited={limited[f.key] ?? null} onValue={(v) => onValue(f, v)} />
        ))}
      </div>
      {posts && (
        <div className="mt-10 rounded-xl border border-border bg-card p-5" aria-live="polite">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--site-gold-ink))]">Come sarà fatta</p>
          <p className="mt-2 text-lg">
            <strong>{posts.count} pilastri</strong>
            {posts.spacingCm !== null && <> · un pilastro ogni {cm(posts.spacingCm)} circa</>}
          </p>
          {posts.nextPostAboveMm !== null && posts.axis && (
            <p className="mt-1 text-muted-foreground">
              Oltre {metres(posts.nextPostAboveMm)} di {posts.axis === "larghezza" ? "larghezza" : "profondità"} serve {posts.extraPosts > 1 ? `una fila di pilastri in più (${posts.extraPosts})` : "un pilastro in più"}.
            </p>
          )}
        </div>
      )}
      {error && (
        <Notice tone="warning" className="mt-6" role="alert">
          {error}
        </Notice>
      )}
    </section>
  )
}

function MeasureControl({ field: f, value, limited, onValue }: { field: MeasureField; value: number; limited: "max" | "min" | null; onValue: (v: number) => void }) {
  const inputId = React.useId()
  const hintId = React.useId()
  const msgId = React.useId()
  const step = f.maxCm - f.minCm > 400 ? 10 : 5
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <label htmlFor={inputId} className="site-display block text-[1.45rem] leading-tight">
            {f.label}
          </label>
          <p id={hintId} className="mt-1 text-muted-foreground">
            {f.hint} Da {cm(f.minCm)} a {cm(f.maxCm)}.
          </p>
        </div>
        <div className="w-40 shrink-0">
          <CmField id={inputId} value={value} min={f.minCm} onValue={onValue} describedBy={`${hintId}${limited ? ` ${msgId}` : ""}`} invalid={limited !== null} />
        </div>
      </div>
      <RangeSlider className="mt-5" min={f.minCm} max={f.maxCm} step={step} value={value} onValue={onValue} label={`${f.label} in centimetri`} />
      <div className="mt-1 flex justify-between text-sm text-muted-foreground" aria-hidden="true">
        <span>{cm(f.minCm)}</span>
        <span>{cm(f.maxCm)}</span>
      </div>
      {limited === "max" && (
        <p id={msgId} role="status" className="mt-2 font-medium text-[hsl(var(--site-gold-ink))]">
          Per misure maggiori <Link href="/contatti" className="underline underline-offset-4">contattaci</Link>: questo modello arriva fino a {cm(f.maxCm)}.
        </p>
      )}
      {limited === "min" && (
        <p id={msgId} role="status" className="mt-2 font-medium text-[hsl(var(--site-gold-ink))]">
          La misura minima per questo modello è {cm(f.minCm)}.
        </p>
      )}
    </div>
  )
}

/** Campo in cm: il testo digitato resta finché si scrive, poi mostra il valore accettato. */
function CmField({ id, value, min, onValue, describedBy, invalid }: { id: string; value: number; min: number; onValue: (v: number) => void; describedBy: string; invalid: boolean }) {
  const [text, setText] = React.useState(String(value))
  const editing = React.useRef(false)
  React.useEffect(() => {
    if (!editing.current) setText(String(value))
  }, [value])
  const commit = () => {
    editing.current = false
    const n = Number(text.replace(",", "."))
    if (text.trim() !== "" && Number.isFinite(n)) onValue(n)
    setText(String(value))
  }
  return (
    <span className="relative flex items-center">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onFocus={() => (editing.current = true)}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value.replace(",", "."))
          // mentre si scrive si applica un numero nell'intervallo o oltre il massimo (che si ferma
          // subito al massimo); sotto il minimo si aspetta la fine ("4" di "450" non è un errore)
          if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= min) onValue(n)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
        }}
        className="h-14 w-full rounded-lg border-2 border-input bg-background pl-4 pr-12 text-right text-xl font-semibold tabular-nums outline-none focus-visible:border-primary aria-[invalid=true]:border-[hsl(var(--site-gold))]"
      />
      <span aria-hidden="true" className="pointer-events-none absolute right-4 text-muted-foreground">
        cm
      </span>
    </span>
  )
}
