import type { Metadata } from "next"
import { companyInfo } from "@/components/site/company"
import { HomeContent } from "@/components/site/home"
import { JsonLd } from "@/components/site/json-ld"
import { siteUrl } from "@/components/site/links"
import { localBusinessJsonLd, pageMetadata } from "@/components/site/seo"
import { getSiteContent } from "@/server/site/cached"

// Contenuti dal dataset `tipologie` attivo, rigenerati ogni 5 minuti o alla pubblicazione.
export const revalidate = 300

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: "Lovato Legnami – Pergole in legno su misura a Verona",
    description:
      "Pergole in legno progettate sulle tue misure da Lovato Legnami, Settimo di Pescantina (Verona), dal 1991. Prezzo indicativo online, sopralluogo e montaggio.",
    path: "/",
    absoluteTitle: true,
  })
}

export default async function HomePage() {
  const content = await getSiteContent()
  const company = companyInfo()
  return (
    <>
      <JsonLd data={localBusinessJsonLd(company, siteUrl())} />
      <HomeContent content={content} company={company} />
    </>
  )
}
