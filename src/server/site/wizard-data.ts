import { unstable_cache } from "next/cache"
import { DEFAULT_LOVATO_RULES, type PriceList, type RuleSet } from "@/domain"
import { CONSENT_TEXT, PRIVACY_NOTICE_VERSION } from "@/server/consent"
import { loadPublicCatalog, type PublicCatalog } from "@/server/quotes/catalog"
import { loadSiteContent, type SiteContent } from "./content"
import { SITE_CONTENT_TAG } from "./cached"

/**
 * Dati del wizard del preventivo passati dal server alla pagina (P9, 12.3): tipologie
 * visibili (testi, disegno, "a partire da", preset di riferimento), regole costruttive
 * attive (non sensibili: il dominio gira nel browser) e **solo etichette e codici** delle
 * finiture del listino attivo (nessun prezzo: il prezzo si chiede a `/api/preventivo/stima`).
 */

export interface WizardOption {
  readonly id: string
  readonly label: string
}

export interface WizardOptions {
  readonly species: readonly WizardOption[]
  readonly qualities: readonly WizardOption[]
  readonly treatments: readonly WizardOption[]
  readonly coverings: readonly WizardOption[]
}

export interface WizardTypology {
  readonly slug: string
  readonly title: string
  readonly tagline: string
  readonly description: string
  readonly category: SiteContent["typologies"][number]["category"]
  readonly categoryLabel: string
  readonly drawingSvg: string
  readonly heroImage: { readonly src: string; readonly alt: string } | null
  /** Totale "a partire da" (IVA inclusa) e misura di riferimento. */
  readonly fromPrice: { readonly totalCents: number; readonly widthMm: number; readonly depthMm: number } | null
  readonly preset: { readonly id: string; readonly name: string; readonly params: Readonly<Record<string, number | string | boolean>> } | null
}

export interface WizardData {
  readonly typologies: readonly WizardTypology[]
  readonly options: WizardOptions
  readonly ruleSet: RuleSet
  /** `false` se listino o regole attivi mancano: il wizard funziona, il prezzo è "su richiesta". */
  readonly pricing: boolean
  readonly consent: { readonly version: string; readonly text: string }
}

const pick = (items: readonly { id: string; label: string }[]): WizardOption[] => items.map(({ id, label }) => ({ id, label }))

/** Finiture del listino come sole etichette e codici (mai prezzi). */
export function wizardOptions(priceList: PriceList | null): WizardOptions {
  if (!priceList)
    return {
      species: [{ id: "abete", label: "Abete" }],
      qualities: [{ id: "lamellare", label: "Lamellare (GL24h)" }],
      treatments: [],
      coverings: [],
    }
  return {
    species: pick(priceList.timber.species),
    qualities: pick(priceList.timber.qualities),
    treatments: pick(priceList.treatments),
    coverings: pick(priceList.coverings),
  }
}

export interface WizardDataDeps {
  readonly content?: () => Promise<SiteContent>
  readonly catalog?: () => Promise<PublicCatalog>
  readonly log?: (message: string) => void
}

export async function loadWizardData(deps: WizardDataDeps = {}): Promise<WizardData> {
  const log = deps.log ?? ((m: string) => console.warn(m))
  const content = await (deps.content ?? (() => loadSiteContent({ log })))()
  let catalog: PublicCatalog | null = null
  try {
    catalog = await (deps.catalog ?? loadPublicCatalog)() // lettura fresca: risultato in cache di Next
  } catch (e) {
    log(`wizard: listino o regole non disponibili, prezzo su richiesta (${e instanceof Error ? e.message : String(e)})`)
  }
  return {
    typologies: content.typologies.map((t) => ({
      slug: t.slug,
      title: t.title,
      tagline: t.tagline,
      description: t.description,
      category: t.category,
      categoryLabel: t.categoryLabel,
      drawingSvg: t.drawingSvg,
      heroImage: t.heroImage ? { src: t.heroImage.src, alt: t.heroImage.alt } : null,
      fromPrice: t.fromPrice ? { totalCents: t.fromPrice.totalCents, widthMm: t.fromPrice.widthMm, depthMm: t.fromPrice.depthMm } : null,
      preset: t.preset,
    })),
    options: wizardOptions(catalog?.priceList ?? null),
    ruleSet: catalog?.ruleSet ?? DEFAULT_LOVATO_RULES,
    pricing: catalog !== null,
    consent: { version: PRIVACY_NOTICE_VERSION, text: CONSENT_TEXT },
  }
}

/** Dati del wizard in cache di Next (tag `tipologie`, 300 s come le pagine del sito). */
export const getWizardData: () => Promise<WizardData> = unstable_cache(() => loadWizardData(), ["wizard-data-v1"], {
  tags: [SITE_CONTENT_TAG],
  revalidate: 300,
})
