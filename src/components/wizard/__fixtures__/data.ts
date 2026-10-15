import { loadPreset } from "@/domain/presets/catalog"
import { DEFAULT_PRICE_LIST } from "@/domain/pricing/data/default-listino"
import { DEFAULT_LOVATO_RULES } from "@/domain/rules/data/default-lovato"
import type { TypologyCategory } from "@/domain/typologies/template"
import { wizardOptions, type WizardData, type WizardTypology } from "@/server/site/wizard-data"
import type { StateStorage } from "zustand/middleware"
import { createWizardStore } from "@/stores/wizard-store"

/** Dati finti del wizard per i test dom (nessun database). */

const DRAWING = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'

function typology(slug: string, title: string, category: TypologyCategory, presetId: string | null, fromCents: number | null): WizardTypology {
  const preset = presetId ? loadPreset(presetId) : null
  return {
    slug,
    title,
    tagline: `${title}: descrizione breve`,
    description: "",
    category,
    categoryLabel: category,
    drawingSvg: DRAWING,
    heroImage: null,
    fromPrice: fromCents === null ? null : { totalCents: fromCents, widthMm: 4000, depthMm: 3000 },
    preset: preset && presetId ? { id: presetId, name: title, params: preset.params as Record<string, number | string | boolean> } : null,
  }
}

export function wizardData(over: Partial<WizardData> = {}): WizardData {
  return {
    typologies: [
      typology("addossata-monofalda", "Pergola addossata", "addossata", "monofalda-grondaia", 690_000),
      typology("autoportante-bifalda", "Pergola bifalda", "autoportante", "bifalda-libera", 820_000),
      typology("gazebo-padiglione", "Gazebo a padiglione", "gazebo", "gazebo-3x3-4-falde", null),
      typology("portale-sandwich", "Pergola a portale", "autoportante", "libera-4x3", 610_000),
    ],
    options: wizardOptions(DEFAULT_PRICE_LIST),
    ruleSet: DEFAULT_LOVATO_RULES,
    pricing: true,
    consent: { version: "2026-10", text: "Acconsento al trattamento dei dati (versione 2026-10)." },
    ...over,
  }
}

export function memoryStorage(): StateStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

export const testStore = () => createWizardStore({ storage: memoryStorage() })
