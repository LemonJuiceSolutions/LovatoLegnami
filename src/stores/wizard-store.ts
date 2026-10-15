import { createJSONStorage, persist, type StateStorage } from "zustand/middleware"
import { createStore, type StoreApi } from "zustand/vanilla"
import type { ParamValue } from "@/domain/components/types"
import type { RuleSet } from "@/domain/rules/types"
import { getTypology } from "@/domain/typologies/registry"
import {
  DEFAULT_ANSWERS,
  measuresFromParams,
  newObstacle,
  WIZARD_STEPS,
  type ContactDraft,
  type DiagonalMeasures,
  type FinishAnswers,
  type ObstacleKind,
  type SimpleObstacle,
  type SpaceAnswers,
  type WizardAnswers,
  type WizardStep,
} from "@/components/wizard/answers"
import { EMPTY_DERIVED, toConfig, type WizardDerived } from "@/components/wizard/to-config"

/**
 * Store del wizard del preventivo (12.1, P9): zustand con `persist` su `sessionStorage`
 * (chiave `lovato-wizard-v1`), separato dal `configuratoreStore` interno perché il wizard
 * ragiona in domande e centimetri. Persistiti `step`, `answers` e l'ultimo invio
 * (`submitted`, per la pagina di conferma); `derived` è ricalcolato in modo sincrono con
 * `toConfig` a ogni risposta, con le regole costruttive arrivate dal server.
 */

export const WIZARD_STORAGE_KEY = "lovato-wizard-v1"

/** Riepilogo dell'ultimo invio, per la pagina di conferma e il collegamento al PDF. */
export interface SubmittedSummary {
  readonly code: string
  readonly token: string
  readonly typologyTitle: string
  readonly measures: string
  readonly totalCents: number | null
  readonly rangeCents: readonly [number, number] | null
  readonly email: string
}

export interface PresetChoice {
  readonly id: string
  readonly params: Readonly<Record<string, ParamValue>>
}

export interface WizardState {
  /** Passo più avanzato raggiunto (per il ricaricamento e per l'indicatore). */
  readonly step: WizardStep
  readonly answers: WizardAnswers
  readonly ruleSet: RuleSet | null
  readonly derived: WizardDerived
  readonly submitted: SubmittedSummary | null

  setRuleSet(ruleSet: RuleSet): void
  setStep(step: WizardStep): void
  chooseTypology(slug: string, preset: PresetChoice | null): void
  setMeasure(key: string, cm: number): void
  setSpace(patch: Partial<Omit<SpaceAnswers, "diagonals" | "obstacles">>): void
  setDiagonals(patch: Partial<DiagonalMeasures>): void
  addObstacle(kind: ObstacleKind): string
  updateObstacle(id: string, patch: Partial<Omit<SimpleObstacle, "id">>): void
  removeObstacle(id: string): void
  setFinishes(patch: Partial<FinishAnswers>): void
  setContacts(patch: Partial<ContactDraft>): void
  markSubmitted(summary: SubmittedSummary): void
  reset(): void
}

export interface WizardStoreOptions {
  /** Storage del `persist` (default `sessionStorage`); nei test uno in memoria. */
  readonly storage?: StateStorage
  /** Non leggere lo storage alla creazione (lato client si chiama `persist.rehydrate()` dopo il montaggio). */
  readonly skipHydration?: boolean
}

type Persisted = Pick<WizardState, "step" | "answers" | "submitted">

const later = (a: WizardStep, b: WizardStep): WizardStep => (WIZARD_STEPS.indexOf(a) >= WIZARD_STEPS.indexOf(b) ? a : b)

let obstacleSeq = 0
const obstacleId = (existing: readonly SimpleObstacle[]) => {
  let id: string
  do id = `ostacolo-${++obstacleSeq}`
  while (existing.some((o) => o.id === id))
  return id
}

export type WizardStore = StoreApi<WizardState> & { persist: { rehydrate(): Promise<void> | void; hasHydrated(): boolean } }

export function createWizardStore(options: WizardStoreOptions = {}): WizardStore {
  return createStore<WizardState>()(
    persist(
      (set, get) => {
        const derive = (answers: WizardAnswers, ruleSet = get().ruleSet): WizardDerived => (ruleSet ? toConfig(answers, ruleSet) : EMPTY_DERIVED)
        const update = (answers: WizardAnswers) => set({ answers, derived: derive(answers) })
        const patchAnswers = (fn: (a: WizardAnswers) => WizardAnswers) => update(fn(get().answers))
        return {
          step: "tipologia",
          answers: DEFAULT_ANSWERS,
          ruleSet: null,
          derived: EMPTY_DERIVED,
          submitted: null,

          setRuleSet(ruleSet) {
            set({ ruleSet, derived: derive(get().answers, ruleSet) })
          },
          setStep(step) {
            set({ step: later(step, get().step) })
          },
          chooseTypology(slug, preset) {
            const template = getTypology(slug)
            const baseParams = preset?.params ?? {}
            patchAnswers((a) => ({
              ...a,
              tipologia: { slug, presetId: preset?.id ?? null, baseParams },
              misure: measuresFromParams(template, baseParams),
              spazio: template.category === "addossata" ? { ...a.spazio, againstWall: true } : a.spazio,
            }))
          },
          setMeasure(key, cm) {
            patchAnswers((a) => ({ ...a, misure: { ...a.misure, [key]: cm } }))
          },
          setSpace(patch) {
            patchAnswers((a) => ({ ...a, spazio: { ...a.spazio, ...patch } }))
          },
          setDiagonals(patch) {
            patchAnswers((a) => ({ ...a, spazio: { ...a.spazio, diagonals: { ...a.spazio.diagonals, ...patch } } }))
          },
          addObstacle(kind) {
            const id = obstacleId(get().answers.spazio.obstacles)
            patchAnswers((a) => ({ ...a, spazio: { ...a.spazio, obstacles: [...a.spazio.obstacles, newObstacle(kind, id)] } }))
            return id
          },
          updateObstacle(id, patch) {
            patchAnswers((a) => ({ ...a, spazio: { ...a.spazio, obstacles: a.spazio.obstacles.map((o) => (o.id === id ? { ...o, ...patch } : o)) } }))
          },
          removeObstacle(id) {
            patchAnswers((a) => ({ ...a, spazio: { ...a.spazio, obstacles: a.spazio.obstacles.filter((o) => o.id !== id) } }))
          },
          setFinishes(patch) {
            patchAnswers((a) => ({ ...a, finiture: { ...a.finiture, ...patch } }))
          },
          setContacts(patch) {
            // i contatti non cambiano la pergola: niente ricalcolo
            set({ answers: { ...get().answers, contatti: { ...get().answers.contatti, ...patch } } })
          },
          markSubmitted(summary) {
            set({ submitted: summary, answers: DEFAULT_ANSWERS, step: "tipologia", derived: EMPTY_DERIVED })
          },
          reset() {
            set({ answers: DEFAULT_ANSWERS, step: "tipologia", derived: EMPTY_DERIVED })
          },
        }
      },
      {
        name: WIZARD_STORAGE_KEY,
        version: 1,
        storage: createJSONStorage<Persisted>(() => options.storage ?? sessionStorage),
        partialize: (s) => ({ step: s.step, answers: s.answers, submitted: s.submitted }),
        skipHydration: options.skipHydration,
        merge: (persisted, current) => {
          const p = persisted as Partial<Persisted> | undefined
          if (!p || typeof p !== "object") return current
          const step = p.step && WIZARD_STEPS.includes(p.step) ? p.step : current.step
          const answers = mergeAnswers(p.answers)
          return { ...current, step, answers, submitted: p.submitted ?? null, derived: current.ruleSet ? toConfig(answers, current.ruleSet) : EMPTY_DERIVED }
        },
      },
    ),
  ) as WizardStore
}

/** Risposte salvate sopra i default (campi nuovi o mancanti prendono il default). */
function mergeAnswers(saved: WizardAnswers | undefined): WizardAnswers {
  if (!saved || typeof saved !== "object") return DEFAULT_ANSWERS
  const d = DEFAULT_ANSWERS
  return {
    tipologia: { ...d.tipologia, ...saved.tipologia },
    misure: { ...saved.misure },
    spazio: { ...d.spazio, ...saved.spazio, diagonals: { ...d.spazio.diagonals, ...saved.spazio?.diagonals }, obstacles: saved.spazio?.obstacles ?? [] },
    finiture: { ...d.finiture, ...saved.finiture },
    contatti: { ...d.contatti, ...saved.contatti },
  }
}

let browserStore: WizardStore | null = null
/** Store del wizard nel browser (singleton, idratato dal componente dopo il montaggio). */
export function wizardStore(): WizardStore {
  browserStore ??= createWizardStore({ skipHydration: true })
  return browserStore
}
