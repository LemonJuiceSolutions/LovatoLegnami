"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import type { WizardData, WizardTypology } from "@/server/site/wizard-data"
import type { WizardStore } from "@/stores/wizard-store"
import { WIZARD_STEPS, stepIndex, stepPath, type WizardStep } from "./answers"
import { StepIndicator } from "./step-indicator"
import { StepMeasures } from "./step-measures"
import { StepSpace } from "./step-space"
import { StepTypology } from "./step-typology"
import { WizardAside } from "./wizard-aside"
import { useWizard, useWizardContext, WizardProvider } from "./wizard-context"
import { FieldError } from "./ui"

/**
 * Wizard del preventivo (12.3, spec `wizard-preventivo` "Percorso a passi"): guscio con
 * indicatore di avanzamento, contenuto del passo e barra Indietro/Avanti. Il passo viene
 * dall'indirizzo (`/preventivo/<passo>`), le risposte dallo store persistito in
 * `sessionStorage`: avanti e indietro (anche con i tasti del browser) non perdono nulla.
 * `?tipologia=<slug>` sceglie il modello e salta al passo 2.
 */
export function PreventivoWizard({ data, step, store, fetcher }: { data: WizardData; step: WizardStep; store?: WizardStore; fetcher?: typeof fetch }) {
  return (
    <WizardProvider data={data} store={store} fetcher={fetcher}>
      <WizardShell step={step} />
    </WizardProvider>
  )
}

/** Motivo per cui non si può lasciare il passo (messaggio sul passo), `null` se si può. */
export type StepGuard = (step: WizardStep) => string | null

function WizardShell({ step }: { step: WizardStep }) {
  const { data, store, hydrated } = useWizardContext()
  const router = useRouter()
  const search = useSearchParams()
  const furthest = useWizard((s) => s.step)
  const slug = useWizard((s) => s.answers.tipologia.slug)
  const planError = useWizard((s) => s.derived.planError)
  const wallShape = useWizard((s) => s.answers.spazio.wallShape)
  const [problem, setProblem] = React.useState<string | null>(null)
  const errorId = React.useId()

  const go = React.useCallback(
    (to: WizardStep, replace = false) => {
      store.getState().setStep(to)
      setProblem(null)
      if (replace) router.replace(stepPath(to))
      else router.push(stepPath(to))
    },
    [router, store],
  )

  // ?tipologia=<slug>: preimposta il modello (preset di riferimento) e passa alle misure
  const requested = search?.get("tipologia") ?? null
  React.useEffect(() => {
    if (!hydrated || !requested) return
    const t = data.typologies.find((x) => x.slug === requested)
    if (!t) return
    if (store.getState().answers.tipologia.slug !== t.slug) store.getState().chooseTypology(t.slug, t.preset)
    go("misure", true)
  }, [hydrated, requested, data.typologies, store, go])

  // senza modello scelto si riparte dal passo 1
  React.useEffect(() => {
    if (hydrated && !requested && step !== "tipologia" && !slug) router.replace(stepPath("tipologia"))
  }, [hydrated, requested, step, slug, router])

  // a ogni cambio di passo (non al primo caricamento): in cima e fuoco sul titolo (lettori di schermo)
  const firstStep = React.useRef(true)
  React.useEffect(() => {
    if (!hydrated) return
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    document.getElementById("wizard-top")?.scrollIntoView?.({ block: "start" })
    document.getElementById("passo-titolo")?.focus({ preventScroll: true })
  }, [step, hydrated])

  const guard: StepGuard = (s) => {
    if (s === "tipologia" && !slug) return "Scegli un modello per continuare."
    if (s === "spazio" && wallShape === "diagonali" && planError) return planError
    return null
  }

  const choose = (t: WizardTypology) => {
    if (store.getState().answers.tipologia.slug !== t.slug) store.getState().chooseTypology(t.slug, t.preset)
    go("misure")
  }

  const i = stepIndex(step)
  const next = WIZARD_STEPS[i + 1]
  const prev = WIZARD_STEPS[i - 1]
  const onNext = () => {
    const p = guard(step)
    if (p) {
      setProblem(p)
      return
    }
    if (next) go(next)
  }

  if (!hydrated)
    return (
      <div className="site-container py-10" aria-busy="true">
        <p className="text-muted-foreground">Caricamento del preventivo…</p>
      </div>
    )

  return (
    <div id="wizard-top" className="site-container scroll-mt-24 pb-32 pt-8 sm:pt-10 lg:pb-16">
      <StepIndicator current={step} furthest={furthest} />
      {step === "tipologia" ? (
        <StepTypology typologies={data.typologies} selected={slug} onChoose={choose} />
      ) : (
        <StepBody step={step} />
      )}
      {step !== "tipologia" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:static lg:mt-12 lg:border-0 lg:bg-transparent lg:backdrop-blur-none">
          <div className="mx-auto flex max-w-[calc(var(--site-max)+2*var(--site-gutter))] items-center justify-between gap-3 px-[var(--site-gutter)] py-3 lg:max-w-none lg:px-0">
            {prev ? (
              <button type="button" onClick={() => go(prev)} className="site-btn site-btn-quiet">
                <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Indietro
              </button>
            ) : (
              <span />
            )}
            {next && step !== "contatti" && (
              <button type="button" onClick={onNext} className="site-btn site-btn-primary" aria-describedby={problem ? errorId : undefined}>
                {next === "riepilogo" ? "Vedi il prezzo" : next === "contatti" ? "Richiedi il preventivo" : "Avanti"}
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
          {problem && (
            <div className="px-[var(--site-gutter)] pb-3 lg:px-0">
              <FieldError id={errorId}>{problem}</FieldError>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StepBody({ step }: { step: WizardStep }) {
  const content = (() => {
    switch (step) {
      case "misure":
        return <StepMeasures />
      case "spazio":
        return <StepSpace />
      default:
        return (
          <section aria-labelledby="passo-titolo">
            <h1 id="passo-titolo" tabIndex={-1} className="site-display text-3xl outline-none">
              {step}
            </h1>
          </section>
        )
    }
  })()
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:gap-14">
      <div className="min-w-0">{content}</div>
      <WizardAside />
    </div>
  )
}
