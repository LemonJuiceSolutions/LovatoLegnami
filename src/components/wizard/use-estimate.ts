"use client"

import * as React from "react"
import type { CustomerQuote } from "@/domain/pricing/views"
import type { WizardAnswers } from "./answers"
import type { WizardConfigFile } from "./to-config"
import { useWizard, useWizardContext } from "./wizard-context"

/**
 * Prezzo indicativo dal server (12.6, P9): `POST /api/preventivo/stima` con la
 * configurazione del wizard, i dati del cantiere dichiarati e le finiture; risposta = sola
 * vista cliente. Debounce di 400 ms, `AbortController` sulle richieste superate, nessuna
 * richiesta se il corpo non è cambiato. Il listino non arriva mai nel browser.
 */

export const ESTIMATE_DEBOUNCE_MS = 400

export interface EstimateBody {
  readonly config: WizardConfigFile
  readonly declared: { readonly access: WizardAnswers["spazio"]["access"]; readonly cap?: string }
  readonly commercial: { readonly species: string; readonly quality: string; readonly treatment: string | null; readonly covering: string | null }
}

/** Corpo della stima (e della parte `estimate` dell'invio). Il CAP, se già noto, stima il trasporto. */
export function estimateBody(config: WizardConfigFile, answers: WizardAnswers): EstimateBody {
  const f = answers.finiture
  const cap = answers.contatti.cap.trim()
  const validCap = /^\d{5}$/.test(cap)
  return {
    // il CAP va anche nelle opzioni commerciali del file: chi riapre la richiesta nel
    // configuratore interno ritrova lo stesso trasporto
    config: validCap ? { ...config, commercial: { ...config.commercial, cap } } : config,
    declared: { access: answers.spazio.access, ...(validCap ? { cap } : {}) },
    commercial: { species: f.species, quality: f.quality, treatment: f.treatment, covering: f.covering },
  }
}

export type EstimateState =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly quote: CustomerQuote | null; readonly notes: readonly string[] }
  | { readonly status: "ok"; readonly quote: CustomerQuote; readonly notes: readonly string[] }
  | { readonly status: "error"; readonly message: string; readonly unavailable: boolean }

export function useEstimate(): EstimateState {
  const { fetcher, data } = useWizardContext()
  const config = useWizard((s) => s.derived.config)
  const answers = useWizard((s) => s.answers)
  const body = React.useMemo(() => (config ? JSON.stringify(estimateBody(config, answers)) : null), [config, answers])
  const [state, setState] = React.useState<EstimateState>({ status: "idle" })
  const last = React.useRef<{ quote: CustomerQuote; notes: readonly string[] } | null>(null)

  React.useEffect(() => {
    if (!body) return
    if (!data.pricing) {
      setState({ status: "error", message: "Il preventivo online non è disponibile in questo momento: inviaci comunque la richiesta.", unavailable: true })
      return
    }
    const controller = new AbortController()
    setState({ status: "loading", quote: last.current?.quote ?? null, notes: last.current?.notes ?? [] })
    const timer = setTimeout(async () => {
      try {
        const res = await fetcher("/api/preventivo/stima", { method: "POST", headers: { "content-type": "application/json" }, body, signal: controller.signal })
        const json = (await res.json().catch(() => ({}))) as { quote?: CustomerQuote; notes?: string[]; error?: string }
        if (controller.signal.aborted) return
        if (res.ok && json.quote) {
          last.current = { quote: json.quote, notes: json.notes ?? [] }
          setState({ status: "ok", quote: json.quote, notes: json.notes ?? [] })
        } else
          setState({
            status: "error",
            unavailable: res.status === 503 || res.status === 422,
            message:
              res.status === 429
                ? "Stai facendo molte prove: aspetta un minuto e riprova."
                : res.status === 422 || res.status === 503
                  ? "Per questa configurazione il prezzo te lo calcola il nostro ufficio: inviaci la richiesta."
                  : (json.error ?? "Non riusciamo a calcolare il prezzo adesso: riprova tra poco."),
          })
      } catch (e) {
        if ((e as Error)?.name === "AbortError" || controller.signal.aborted) return
        setState({ status: "error", unavailable: false, message: "Connessione assente: il prezzo si aggiorna appena torni in linea." })
      }
    }, ESTIMATE_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [body, fetcher, data.pricing])

  return state
}
