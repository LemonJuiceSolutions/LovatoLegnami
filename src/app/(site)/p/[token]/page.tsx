import type { Metadata } from "next"
import { CustomerSummaryView } from "@/components/wizard/customer-summary"
import { companyInfo } from "@/components/site/company"
import { loadCustomerSummary } from "@/server/quotes/customer-summary"

/**
 * Riepilogo del preventivo per il cliente dal collegamento dell'email (12.8): token di 90
 * giorni, solo la propria richiesta, mai indicizzata (anche `robots.txt` esclude `/p/`).
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Il tuo preventivo",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function CustomerQuotePage({ params }: { params: { token: string } }) {
  const summary = await loadCustomerSummary(decodeURIComponent(params.token))
  const company = companyInfo()
  return <CustomerSummaryView summary={summary} phone={company.phone} email={company.email} />
}
