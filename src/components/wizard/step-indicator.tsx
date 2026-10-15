"use client"

import Link from "next/link"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { STEP_LABELS, WIZARD_STEPS, stepIndex, stepPath, type WizardStep } from "./answers"

/**
 * Indicatore di avanzamento (spec "Percorso a passi"): sei tappe numerate, la corrente con
 * `aria-current="step"`, quelle già raggiunte cliccabili (si torna indietro senza perdere
 * nulla). Su telefono resta la barra a segmenti con "Passo 2 di 6 · Misure".
 */
export function StepIndicator({ current, furthest }: { current: WizardStep; furthest: WizardStep }) {
  const ci = stepIndex(current)
  const fi = stepIndex(furthest)
  return (
    <nav aria-label="Avanzamento del preventivo" className="mb-8">
      <p className="mb-3 text-[0.95rem] text-muted-foreground sm:hidden">
        Passo {ci + 1} di {WIZARD_STEPS.length} · <strong className="font-semibold text-foreground">{STEP_LABELS[current]}</strong>
      </p>
      <ol className="flex gap-1.5 sm:gap-2">
        {WIZARD_STEPS.map((step, i) => {
          const done = i < ci
          const isCurrent = i === ci
          const reachable = i <= fi && !isCurrent
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "block h-1.5 w-full rounded-full transition-colors",
                  isCurrent ? "bg-primary" : done || i <= fi ? "bg-[hsl(var(--site-gold))]" : "bg-border",
                )}
              />
              <span className="mt-2 hidden items-center gap-1.5 text-[0.9rem] sm:flex">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    isCurrent ? "bg-primary text-primary-foreground" : done ? "bg-[hsl(var(--site-gold))] text-white" : "border border-input text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn("truncate", isCurrent ? "font-semibold text-foreground" : "text-muted-foreground")}>{STEP_LABELS[step]}</span>
              </span>
              <span className="sr-only">
                {`Passo ${i + 1}: ${STEP_LABELS[step]}`}
                {done ? " (completato)" : ""}
              </span>
            </>
          )
          return (
            <li key={step} className="min-w-0 flex-1" aria-current={isCurrent ? "step" : undefined}>
              {reachable ? (
                <Link href={stepPath(step)} className="block rounded-md py-1 hover:opacity-80">
                  {content}
                </Link>
              ) : (
                <span className="block py-1">{content}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
