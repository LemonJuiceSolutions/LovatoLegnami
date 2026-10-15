import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { euroRounded } from "@/components/site/format"
import { JsonLd } from "@/components/site/json-ld"
import { siteUrl, typologyHref } from "@/components/site/links"
import { pageMetadata, productJsonLd } from "@/components/site/seo"
import { TypologyDetail } from "@/components/site/typology-detail"
import { getSiteContent, getSiteTypology } from "@/server/site/cached"

// Rigenerata ogni 5 minuti o alla pubblicazione del dataset (tag `tipologie`).
export const revalidate = 300

type Props = { params: { seoSlug: string } }

export async function generateStaticParams() {
  const { typologies } = await getSiteContent()
  return typologies.map((t) => ({ seoSlug: t.seoSlug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getSiteTypology(params.seoSlug)
  if (!t) return { title: "Pagina non trovata", robots: { index: false, follow: true } }
  const price = t.fromPrice ? ` Da ${euroRounded(t.fromPrice.totalCents).replace(" ", " ")} IVA inclusa, prezzo indicativo online.` : ""
  const lead = (t.tagline || t.description || `${t.title} in legno su misura.`).replace(/\s+/g, " ").slice(0, 120)
  return pageMetadata({ title: t.title, description: `${lead}${price}`, path: typologyHref(t.seoSlug) })
}

export default async function TypologyPage({ params }: Props) {
  const typology = await getSiteTypology(params.seoSlug)
  // tipologia inesistente o nascosta dall'ufficio: 404 del sito
  if (!typology) notFound()
  return (
    <>
      <JsonLd data={productJsonLd(typology, siteUrl())} />
      <TypologyDetail typology={typology} />
    </>
  )
}
