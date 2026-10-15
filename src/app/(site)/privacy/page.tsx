import type { Metadata } from "next"
import { companyInfo } from "@/components/site/company"
import { PrivacyNotice } from "@/components/site/privacy-notice"
import { PRIVACY_NOTICE_VERSION } from "@/server/consent"

export const metadata: Metadata = {
  title: "Informativa sulla privacy",
  description: "Come Lovato Legnami tratta i dati inviati con il form Contatti e con la richiesta di preventivo.",
  alternates: { canonical: "/privacy" },
}

export default function PrivacyPage() {
  return (
    <div className="site-container pb-24 pt-12 md:pt-16">
      <h1 className="site-display site-h1 max-w-[18ch]">Informativa sulla privacy</h1>
      <div className="mt-8">
        <PrivacyNotice version={PRIVACY_NOTICE_VERSION} company={companyInfo()} />
      </div>
    </div>
  )
}
