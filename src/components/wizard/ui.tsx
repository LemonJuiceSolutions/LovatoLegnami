"use client"

import * as React from "react"
import { Check, Info, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Mattoni dell'interfaccia del wizard (tema `.theme-site`): titoli dei passi, scelte a
 * schede su radio native (tastiera e lettori di schermo gratis), campi numerici grandi,
 * avvisi in linea. Bersagli di almeno 48 px, testo ≥ 16 px.
 */

export function StepHeading({ eyebrow, title, intro, id }: { eyebrow?: string; title: string; intro?: React.ReactNode; id?: string }) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[hsl(var(--site-gold-ink))]">{eyebrow}</p>}
      <h1 id={id} tabIndex={-1} className="site-display mt-2 text-[clamp(2rem,1.5rem+2vw,3rem)] outline-none">
        {title}
      </h1>
      {intro && <p className="mt-3 max-w-[60ch] text-lg text-foreground/80">{intro}</p>}
    </header>
  )
}

export function Question({ title, hint, children, id }: { title: string; hint?: React.ReactNode; children: React.ReactNode; id?: string }) {
  const hintId = React.useId()
  return (
    <fieldset className="mb-10 min-w-0" aria-describedby={hint ? hintId : undefined} id={id}>
      <legend className="site-display text-[1.45rem] leading-tight">{title}</legend>
      {hint && (
        <p id={hintId} className="mt-1.5 max-w-[60ch] text-muted-foreground">
          {hint}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </fieldset>
  )
}

export interface ChoiceOption<V extends string> {
  readonly value: V
  readonly label: string
  readonly description?: React.ReactNode
  readonly visual?: React.ReactNode
}

/** Scelta singola a schede (radio native). */
export function ChoiceCards<V extends string>({
  name,
  value,
  options,
  onChange,
  columns = 2,
  size = "md",
}: {
  name: string
  value: V | null
  options: readonly ChoiceOption<V>[]
  onChange: (v: V) => void
  columns?: 1 | 2 | 3 | 4
  size?: "sm" | "md"
}) {
  const grid = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "grid-cols-2 lg:grid-cols-4" }[columns]
  return (
    <div className={cn("grid gap-3", grid)}>
      {options.map((o) => {
        const checked = value === o.value
        return (
          <label
            key={o.value}
            className={cn(
              "relative flex cursor-pointer gap-3 rounded-xl border-2 bg-card text-left transition-colors",
              size === "sm" ? "min-h-12 items-center px-4 py-3" : "min-h-[4.5rem] items-start p-4",
              checked ? "border-primary bg-secondary/40" : "border-border hover:border-foreground/40",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[hsl(var(--site-gold))]",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} className="sr-only" />
            {o.visual && <span className="shrink-0">{o.visual}</span>}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-snug">{o.label}</span>
              {o.description && <span className="mt-1 block text-[0.95rem] leading-snug text-muted-foreground">{o.description}</span>}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
              )}
            >
              {checked && <Check className="h-4 w-4" strokeWidth={3} />}
            </span>
          </label>
        )
      })}
    </div>
  )
}

/** Campo numerico in centimetri, grande e con l'unità a vista. */
export const CmInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: number | null; onValue: (v: number) => void; unit?: string; invalid?: boolean }
>(function CmInput({ value, onValue, unit = "cm", invalid, className, ...props }, ref) {
  const [text, setText] = React.useState(value === null || value === 0 ? "" : String(value))
  const focused = React.useRef(false)
  React.useEffect(() => {
    if (!focused.current) setText(value === null || value === 0 ? "" : String(value))
  }, [value])
  return (
    <span className={cn("relative inline-flex w-full items-center", className)}>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        aria-invalid={invalid || undefined}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value.replace(",", "."))
          if (e.target.value.trim() !== "" && Number.isFinite(n)) onValue(n)
        }}
        onBlur={() => {
          focused.current = false
          setText(value === null || value === 0 ? "" : String(value))
        }}
        className={cn(
          "h-12 w-full rounded-lg border-2 bg-background pl-4 pr-12 text-lg tabular-nums outline-none transition-colors",
          "focus-visible:border-primary",
          invalid ? "border-destructive" : "border-input",
        )}
        {...props}
      />
      <span aria-hidden="true" className="pointer-events-none absolute right-4 text-muted-foreground">
        {unit}
      </span>
    </span>
  )
})

export function Notice({ tone = "info", children, className, role }: { tone?: "info" | "warning"; children: React.ReactNode; className?: string; role?: "status" | "alert" }) {
  const Icon = tone === "warning" ? TriangleAlert : Info
  return (
    <div
      role={role}
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3 text-[0.98rem] leading-snug",
        tone === "warning" ? "border-[hsl(var(--site-gold))] bg-accent text-accent-foreground" : "border-border bg-secondary/50",
        className,
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-2 font-medium text-destructive">
      {children}
    </p>
  )
}
