import { notFound } from "next/navigation"
import { TypologyDetail } from "@/components/site/typology-detail"
import { getSiteContent, getSiteTypology } from "@/server/site/cached"

// Rigenerata ogni 5 minuti o alla pubblicazione del dataset (tag `tipologie`).
export const revalidate = 300

export async function generateStaticParams() {
  const { typologies } = await getSiteContent()
  return typologies.map((t) => ({ seoSlug: t.seoSlug }))
}

export default async function TypologyPage({ params }: { params: { seoSlug: string } }) {
  const typology = await getSiteTypology(params.seoSlug)
  // tipologia inesistente o nascosta dall'ufficio: 404 del sito
  if (!typology) notFound()
  return <TypologyDetail typology={typology} />
}
