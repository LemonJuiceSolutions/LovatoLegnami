import type { Metadata } from "next"
import Link from "next/link"
import { companyInfo } from "@/components/site/company"
import { ContactBlock } from "@/components/site/contact-block"
import { ContactForm } from "@/components/site/contact-form"
import { WIZARD_PATH } from "@/components/site/links"
import { Section } from "@/components/site/section"
import { sendContactMessage } from "@/server/actions/contact"
import { PRIVACY_NOTICE_VERSION } from "@/server/consent"

export const metadata: Metadata = {
  title: "Contatti",
  description: "Telefono, email, indirizzo e orari di Lovato Legnami a Settimo di Pescantina (Verona). Scrivici per una pergola su misura.",
  alternates: { canonical: "/contatti" },
}

export default function ContattiPage() {
  const company = companyInfo()
  return (
    <>
      <header className="site-container pb-4 pt-12 md:pt-16">
        <h1 className="site-display site-h1 max-w-[16ch]">Contatti</h1>
        <p className="site-lead mt-5">
          Per un prezzo indicativo il modo più rapido è il{" "}
          <Link href={WIZARD_PATH} className="text-primary underline underline-offset-4">
            preventivo online
          </Link>
          . Per tutto il resto, chiamaci o scrivici.
        </p>
      </header>
      <Section title="Dove trovarci" className="pb-8 md:pb-12">
        <ContactBlock company={company} />
      </Section>
      <Section title="Scrivici" intro="Rispondiamo all'indirizzo che indichi. Se ci mandi le misure indicative, la prima risposta sarà già più precisa." className="border-t border-border/70">
        <div className="max-w-[44rem]">
          <ContactForm action={sendContactMessage} privacyVersion={PRIVACY_NOTICE_VERSION} />
        </div>
      </Section>
    </>
  )
}
