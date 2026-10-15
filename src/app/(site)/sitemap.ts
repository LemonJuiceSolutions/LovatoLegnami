import type { MetadataRoute } from "next"
import { siteUrl } from "@/components/site/links"
import { buildSitemap } from "@/components/site/seo"
import { getSiteContent } from "@/server/site/cached"

export const revalidate = 300

/** `sitemap.xml`: home, tipologie visibili, galleria, contatti, privacy. Nessun percorso interno. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { typologies } = await getSiteContent()
  return buildSitemap(siteUrl(), typologies)
}
