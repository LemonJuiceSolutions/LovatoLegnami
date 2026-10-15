import { unstable_cache } from "next/cache"
import { loadSiteContent, type SiteContent, type SiteTypology } from "./content"

/**
 * Contenuti del sito in cache di Next (P8): tag `tipologie` (la pubblicazione di un
 * dataset dal back-office chiama `revalidateSiteContent()`) e scadenza di 300 s come
 * le pagine (`revalidate = 300`).
 */
export const SITE_CONTENT_TAG = "tipologie"
export const SITE_REVALIDATE_SECONDS = 300

export const getSiteContent: () => Promise<SiteContent> = unstable_cache(() => loadSiteContent(), ["site-content-v1"], {
  tags: [SITE_CONTENT_TAG],
  revalidate: SITE_REVALIDATE_SECONDS,
})

export async function getSiteTypology(seoSlug: string): Promise<SiteTypology | null> {
  const { typologies } = await getSiteContent()
  return typologies.find((t) => t.seoSlug === seoSlug) ?? null
}
