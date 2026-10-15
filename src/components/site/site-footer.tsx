import Link from "next/link"
import { companyInfo, type CompanyInfo } from "./company"
import { SITE_NAV, WIZARD_PATH } from "./links"
import { Wordmark } from "./wordmark"

/** Piè di pagina: chi siamo in una riga, recapiti, orari, collegamenti e dati legali. */
export function SiteFooter({ company = companyInfo() }: { company?: CompanyInfo }) {
  return (
    <footer className="mt-auto border-t border-border/70 bg-secondary/40">
      <div className="site-container grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <Wordmark />
          <p className="max-w-[36ch] text-muted-foreground">
            Legno lavorato a Settimo di Pescantina dal {company.foundedYear}: pergole, coperture, case in legno e taglio CNC su misura.
          </p>
        </div>
        <div>
          <h2 className="mb-3 font-semibold">Dove siamo</h2>
          <address className="not-italic text-muted-foreground">
            {company.street}
            <br />
            {company.postalCode} {company.locality} ({company.province})
            <br />
            <a href={`tel:${company.phoneHref}`} className="text-foreground underline-offset-4 hover:underline">
              {company.phone}
            </a>
            <br />
            <a href={`mailto:${company.email}`} className="text-foreground underline-offset-4 hover:underline">
              {company.email}
            </a>
          </address>
          <p className="mt-3 text-muted-foreground">{company.hours.join(", ")}</p>
        </div>
        <nav aria-label="Piè di pagina">
          <h2 className="mb-3 font-semibold">Sito</h2>
          <ul className="space-y-2">
            {SITE_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="underline-offset-4 hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href={WIZARD_PATH} className="underline-offset-4 hover:underline">
                Richiedi preventivo
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="underline-offset-4 hover:underline">
                Informativa privacy
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-border/70">
        <p className="site-container py-5 text-muted-foreground">
          {company.legalName}, P. IVA {company.vatNumber}
        </p>
      </div>
    </footer>
  )
}
