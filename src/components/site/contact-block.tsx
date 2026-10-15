import { companyInfo, type CompanyInfo } from "./company"

/** Recapiti: telefono, email, indirizzo con mappa (collegamento esterno, nessun widget), orari. */
export function ContactBlock({ company = companyInfo() }: { company?: CompanyInfo }) {
  return (
    <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <dt className="font-semibold">Telefono</dt>
        <dd className="mt-1">
          <a href={`tel:${company.phoneHref}`} className="site-display text-[1.5rem] underline-offset-4 hover:underline">
            {company.phone}
          </a>
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Email</dt>
        <dd className="mt-1">
          <a href={`mailto:${company.email}`} className="site-display break-all text-[1.5rem] underline-offset-4 hover:underline">
            {company.email}
          </a>
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Laboratorio e uffici</dt>
        <dd className="mt-1 text-muted-foreground">
          <address className="not-italic">
            {company.street}
            <br />
            {company.postalCode} {company.locality} ({company.province})
          </address>
          <a href={company.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-primary underline underline-offset-4">
            Apri la mappa<span className="sr-only"> (si apre in una nuova scheda)</span>
          </a>
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Orari</dt>
        <dd className="mt-1 text-muted-foreground">
          {company.hours.map((h) => (
            <p key={h}>{h}</p>
          ))}
        </dd>
      </div>
    </dl>
  )
}
