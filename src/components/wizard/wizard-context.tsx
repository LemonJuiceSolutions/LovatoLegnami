"use client"

import * as React from "react"
import { useStore } from "zustand"
import type { WizardData } from "@/server/site/wizard-data"
import { wizardStore, type WizardState, type WizardStore } from "@/stores/wizard-store"

/**
 * Contesto del wizard: dati del server (tipologie, finiture, regole) e store. Nei test si
 * passa uno store creato con uno storage in memoria; nel browser è il singleton idratato
 * da `sessionStorage`.
 */

interface WizardContextValue {
  readonly data: WizardData
  readonly store: WizardStore
  /** Lo store è stato letto dallo storage (prima si mostra uno scheletro). */
  readonly hydrated: boolean
  /** Chiamata di rete della stima e dell'invio (iniettabile nei test). */
  readonly fetcher: typeof fetch
}

const Ctx = React.createContext<WizardContextValue | null>(null)

export function WizardProvider({
  data,
  store,
  fetcher,
  children,
}: {
  data: WizardData
  store?: WizardStore
  fetcher?: typeof fetch
  children: React.ReactNode
}) {
  const s = React.useMemo(() => store ?? wizardStore(), [store])
  const [hydrated, setHydrated] = React.useState(() => s.persist.hasHydrated())
  React.useEffect(() => {
    let alive = true
    // prima l'idratazione, poi le regole del server: una scrittura prima dell'idratazione
    // sovrascriverebbe le risposte salvate
    void Promise.resolve(s.persist.hasHydrated() ? undefined : s.persist.rehydrate()).then(() => {
      if (!alive) return
      s.getState().setRuleSet(data.ruleSet)
      setHydrated(true)
    })
    return () => {
      alive = false
    }
  }, [s, data.ruleSet])
  const value = React.useMemo(() => ({ data, store: s, hydrated, fetcher: fetcher ?? ((...a: Parameters<typeof fetch>) => fetch(...a)) }), [data, s, hydrated, fetcher])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWizardContext(): WizardContextValue {
  const v = React.useContext(Ctx)
  if (!v) throw new Error("useWizardContext fuori da <WizardProvider>")
  return v
}

export function useWizard<T>(selector: (s: WizardState) => T): T {
  return useStore(useWizardContext().store, selector)
}

export const useWizardActions = (): WizardState => useWizardContext().store.getState()
