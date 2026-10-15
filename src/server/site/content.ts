import { isometricSvg } from "@/components/configuratore/thumbnails/isometric"
import { assemblyBounds } from "@/domain/assembly/bounds"
import { parseEnvelope } from "@/domain/envelope/types"
import { PRESET_CATALOG } from "@/domain/presets/catalog"
import type { Preset } from "@/domain/presets/types"
import { defaultTypologySettings, MVP_VISIBLE_TYPOLOGIES, type SiteImage, type TypologySetting } from "@/domain/site/typology-settings"
import type { TypologyCategory, TypologyTemplate } from "@/domain/typologies/template"
import { generate, getTypology } from "@/domain/typologies/registry"
import { resolveParams } from "@/domain/typologies/template"
import { getActive } from "@/server/repositories/datasets"
import { getPublicCatalog, type PublicCatalog } from "@/server/quotes/catalog"
import { computeStartingPrice, startingPriceConfig } from "@/server/quotes/starting-price"
import { CONFIG_SCHEMA_VERSION, defaultConfig, presetConfig, type ConfiguratoreConfig } from "@/stores/config"
import { footprint } from "@/components/site/format"
import type { GalleryItem } from "@/components/site/gallery"

/**
 * Contenuti del sito pubblico (P8, spec `sito-pubblico`): tipologie visibili del dataset
 * `tipologie` attivo con testi, immagini, miniatura isometrica di ripiego, caratteristiche
 * dal template e prezzo "a partire da" del preset di riferimento con il listino attivo.
 *
 * Tutto ciò che esce da qui è destinato al pubblico: solo il **totale** della vista
 * cliente (mai righe, listino o costi) e le misure del preset. Il risultato è JSON puro
 * (serializzabile da `unstable_cache`). Le pagine passano da `cached.ts` (tag
 * `tipologie`, 300 s); qui la funzione è diretta e testabile sul database.
 *
 * Senza database o senza dataset `tipologie` si ripiega sulle impostazioni di default con
 * le tipologie dell'MVP (come il catalogo pubblico) e senza prezzi: il sito resta in piedi.
 */

export interface FromPrice {
  /** Totale IVA inclusa della vista cliente del preset di riferimento. */
  readonly totalCents: number
  readonly widthMm: number
  readonly depthMm: number
  readonly heightMm: number
  /** Nome del preset di riferimento, se esiste. */
  readonly presetName: string | null
  /** Cosa comprende il prezzo (voci della vista cliente con importo). */
  readonly includes: readonly string[]
  /** Finitura usata per il prezzo (etichette del listino). */
  readonly finish: string
}

export interface SiteTypology {
  readonly slug: string
  readonly seoSlug: string
  readonly title: string
  readonly tagline: string
  readonly description: string
  readonly category: TypologyCategory
  readonly categoryLabel: string
  readonly tags: readonly string[]
  readonly heroImage: SiteImage | null
  readonly gallery: readonly SiteImage[]
  /** SVG isometrico del preset di riferimento (stringa deterministica). */
  readonly drawingSvg: string
  readonly features: readonly string[]
  readonly fromPrice: FromPrice | null
  /** Preset di riferimento (parametri risolti): il punto di partenza del wizard. */
  readonly preset: { readonly id: string; readonly name: string; readonly params: Readonly<Record<string, number | string | boolean>> } | null
}

export interface SiteContent {
  readonly typologies: readonly SiteTypology[]
  /** Galleria: immagini caricate dall'ufficio, poi disegni dei preset delle tipologie visibili. */
  readonly gallery: readonly GalleryItem[]
  /** `archivio` = dataset attivo letto dal database; `default` = ripiego. */
  readonly source: "archivio" | "default"
}

export const CATEGORY_LABELS: Readonly<Record<TypologyCategory, string>> = {
  addossata: "Addossate al muro",
  autoportante: "Autoportanti",
  carport: "Carport",
  gazebo: "Gazebo",
  pensilina: "Pensiline",
}

const metres = (mm: number) => `${(Math.round(mm / 10) / 100).toFixed(2).replace(".", ",")} m`

const FEATURE_PARAMS: Readonly<Record<string, string>> = { larghezza: "Larghezza", profondita: "Profondità", altezza: "Altezza sotto trave" }

/** Caratteristiche leggibili dal template: campi di misura e parole chiave. */
export function templateFeatures(template: TypologyTemplate): string[] {
  const out: string[] = []
  for (const p of template.params) {
    const label = FEATURE_PARAMS[p.name]
    if (label && p.kind === "number" && p.unit === "mm") out.push(`${label} da ${metres(p.min)} a ${metres(p.max)}`)
  }
  const tags = template.tags.filter((t) => t !== template.category)
  if (tags.length) out.push(`Costruzione: ${tags.join(", ")}`)
  out.push("Sezioni del legno dimensionate sulle misure scelte")
  return out
}

/** Preset di riferimento: quello indicato nelle impostazioni, altrimenti il primo della tipologia. */
function referencePreset(setting: TypologySetting, presets: readonly Preset[]): Preset | undefined {
  const own = presets.filter((p) => p.typologySlug === setting.slug)
  return (setting.referencePresetId ? own.find((p) => p.id === setting.referencePresetId) : undefined) ?? own[0]
}

/** Configurazione del preset (parametri del dataset, ingombro del preset o del catalogo). */
function configFor(slug: string, preset: Preset | undefined): ConfiguratoreConfig {
  if (!preset) return defaultConfig(slug)
  const params = { ...resolveParams(getTypology(slug), preset.params) }
  let envelope = preset.envelope ? parseEnvelope(preset.envelope) : undefined
  if (!envelope) {
    try {
      envelope = presetConfig(preset.id).envelope
    } catch {
      envelope = defaultConfig(slug).envelope
    }
  }
  return { ...defaultConfig(slug), schemaVersion: CONFIG_SCHEMA_VERSION, params, envelope }
}

function drawingSvg(config: ConfiguratoreConfig, title: string): string {
  try {
    return isometricSvg(generate(config.typology, config.params).pieces, { label: `Disegno assonometrico: ${title}` })
  } catch {
    return isometricSvg([], { label: title })
  }
}

/**
 * Prezzo "a partire da" per le pagine pubbliche: definizione unica condivisa con il
 * back-office (`computeStartingPrice`: preset di riferimento, adattamento e
 * dimensionamento, abete lamellare con il trattamento meno caro, nessuna copertura).
 */
export function fromPriceFor(slug: string, preset: Preset | undefined, catalog: PublicCatalog): FromPrice | null {
  const { priceList } = catalog
  const price = computeStartingPrice(startingPriceConfig(slug, preset), {
    priceList,
    priceListVersion: catalog.priceListVersion,
    ruleSet: catalog.ruleSet,
    ruleSetVersionId: catalog.ruleSetVersionId,
  })
  if (!price) return null
  const { prepared, finish } = price
  const box = assemblyBounds(prepared.assembly)
  if (!box) return null
  // misure nominali del cliente (larghezza × profondità della pergola); l'ingombro con gli sbalzi come ripiego
  const nominal = (name: string, fallback: number) => {
    const v = prepared.config.params[name]
    return Math.round(typeof v === "number" ? v : fallback)
  }
  const label = <T extends { id: string; label: string }>(items: readonly T[], id: string | null) => items.find((x) => x.id === id)?.label
  const species = label(priceList.timber.species, finish.species) ?? finish.species
  const quality = (label(priceList.timber.qualities, finish.quality) ?? finish.quality).split(" (")[0].toLowerCase()
  const treatment = label(priceList.treatments, finish.treatment)
  return {
    totalCents: price.totalCents,
    widthMm: nominal("larghezza", box.max.x - box.min.x),
    depthMm: nominal("profondita", box.max.y - box.min.y),
    heightMm: Math.round(box.max.z - box.min.z),
    presetName: preset?.name ?? null,
    includes: price.quote.groups.filter((g) => g.amountCents > 0).map((g) => g.label),
    finish: [`${species} ${quality}`, treatment ? treatment.toLowerCase() : null].filter(Boolean).join(", "),
  }
}

export interface LoadDeps {
  readonly settings?: () => Promise<readonly TypologySetting[] | null>
  readonly presets?: () => Promise<readonly Preset[] | null>
  readonly catalog?: () => Promise<PublicCatalog>
  readonly log?: (message: string) => void
}

const defaultDeps: Required<LoadDeps> = {
  settings: async () => (await getActive("tipologie"))?.data ?? null,
  presets: async () => (await getActive("preset"))?.data ?? null,
  catalog: () => getPublicCatalog(),
  log: (m) => console.warn(m),
}

/** Contenuti del sito dalle versioni attive (con ripieghi): tipologie visibili in ordine. */
export async function loadSiteContent(deps: LoadDeps = {}): Promise<SiteContent> {
  const d = { ...defaultDeps, ...deps }
  let settings: readonly TypologySetting[] | null = null
  let presets: readonly Preset[] | null = null
  try {
    ;[settings, presets] = await Promise.all([d.settings(), d.presets()])
  } catch (e) {
    d.log(`sito: dataset non leggibili, uso i default (${e instanceof Error ? e.message : String(e)})`)
  }
  const source = settings ? "archivio" : "default"
  const visible = (settings ?? defaultTypologySettings(undefined, MVP_VISIBLE_TYPOLOGIES)).filter((t) => t.visible).sort((a, b) => a.order - b.order)
  const presetList = presets ?? PRESET_CATALOG

  let catalog: PublicCatalog | null = null
  try {
    catalog = await d.catalog()
  } catch (e) {
    d.log(`sito: listino non disponibile, pagine senza prezzi (${e instanceof Error ? e.message : String(e)})`)
  }

  const typologies = visible.map((setting): SiteTypology => {
    const template = getTypology(setting.slug)
    const preset = referencePreset(setting, presetList)
    const config = configFor(setting.slug, preset)
    let fromPrice: FromPrice | null = null
    if (catalog?.typologies.has(setting.slug)) {
      try {
        fromPrice = fromPriceFor(setting.slug, preset, catalog)
      } catch (e) {
        d.log(`sito: prezzo "a partire da" non calcolabile per ${setting.slug} (${e instanceof Error ? e.message : String(e)})`)
      }
    }
    return {
      slug: setting.slug,
      seoSlug: setting.seoSlug,
      title: setting.title,
      tagline: setting.tagline,
      description: setting.description,
      category: template.category,
      categoryLabel: CATEGORY_LABELS[template.category],
      tags: [...template.tags],
      heroImage: setting.heroImage ?? null,
      gallery: [...setting.gallery],
      drawingSvg: drawingSvg(config, setting.title),
      features: templateFeatures(template),
      fromPrice,
      preset: preset ? { id: preset.id, name: preset.name, params: { ...config.params } } : null,
    }
  })
  return { typologies, gallery: buildGallery(visible, presetList), source }
}

/** Massimo di disegni generati in galleria (calcolati sul server, una volta per cache). */
export const MAX_GALLERY_DRAWINGS = 9

function buildGallery(visible: readonly TypologySetting[], presets: readonly Preset[]): GalleryItem[] {
  const images: GalleryItem[] = visible.flatMap((t) =>
    [...(t.heroImage ? [t.heroImage] : []), ...t.gallery].map((img) => ({ kind: "image" as const, src: img.src, alt: img.alt, caption: t.title })),
  )
  const drawings: GalleryItem[] = []
  for (const t of visible) {
    const own = presets.filter((p) => p.typologySlug === t.slug)
    // i preset della tipologia e la sua configurazione di partenza
    const sources: { preset?: Preset; name: string }[] = [...own.map((p) => ({ preset: p, name: p.name })), { name: t.title }]
    for (const { preset, name } of sources) {
      if (drawings.length >= MAX_GALLERY_DRAWINGS) break
      try {
        const config = configFor(t.slug, preset)
        const pieces = generate(config.typology, config.params).pieces
        const box = assemblyBounds({ pieces })
        const w = config.params.larghezza
        const d = config.params.profondita
        drawings.push({
          kind: "drawing",
          svg: isometricSvg(pieces, { label: `Disegno di ${name}` }),
          caption: name === t.title ? t.title : `${t.title}, ${name}`,
          size: typeof w === "number" && typeof d === "number" ? footprint(w, d) : box ? footprint(box.max.x - box.min.x, box.max.y - box.min.y) : null,
        })
      } catch {
        // un preset non più generabile non entra in galleria
      }
    }
  }
  return [...images, ...drawings]
}

/** Tipologia visibile per `seoSlug`; `null` se non esiste o è nascosta (pagina 404). */
export async function loadSiteTypology(seoSlug: string, deps: LoadDeps = {}): Promise<SiteTypology | null> {
  const { typologies } = await loadSiteContent(deps)
  return typologies.find((t) => t.seoSlug === seoSlug) ?? null
}
