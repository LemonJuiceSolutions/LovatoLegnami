import { companyInfo } from "@/components/site/company"
import { HomeContent } from "@/components/site/home"
import { getSiteContent } from "@/server/site/cached"

// Contenuti dal dataset `tipologie` attivo, rigenerati ogni 5 minuti o alla pubblicazione.
export const revalidate = 300

export default async function HomePage() {
  const content = await getSiteContent()
  return <HomeContent content={content} company={companyInfo()} />
}
