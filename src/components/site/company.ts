/**
 * Dati aziendali mostrati dal sito pubblico (contatti, piè di pagina, JSON-LD).
 * Fonte: www.lovatosrl.it (ottobre 2026). Telefono, email e via sono sovrascrivibili
 * da variabili d'ambiente senza rilascio del codice (`SITE_COMPANY_PHONE`,
 * `SITE_COMPANY_EMAIL`, `SITE_COMPANY_STREET`).
 * DA VALIDARE con Lovato: il sito riporta sia "Via Antonio Meucci 2" sia "4".
 */

export interface CompanyInfo {
  readonly brand: string
  readonly legalName: string
  readonly foundedYear: number
  readonly vatNumber: string
  readonly street: string
  readonly postalCode: string
  readonly locality: string
  readonly province: string
  readonly region: string
  readonly country: string
  /** Telefono come si legge ("045 6700620"). */
  readonly phone: string
  /** Telefono per `tel:` (E.164). */
  readonly phoneHref: string
  readonly email: string
  readonly website: string
  /** Orari in forma leggibile, una riga per fascia. */
  readonly hours: readonly string[]
  /** Orari in forma schema.org (`Mo-Fr 08:00-12:00`). */
  readonly openingHours: readonly string[]
  readonly mapsUrl: string
}

const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined)

/** Numero E.164 italiano dal numero leggibile (`045 6700620` → `+390456700620`). */
export function phoneToHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "")
  if (digits.startsWith("+")) return digits
  if (digits.startsWith("00")) return `+${digits.slice(2)}`
  return `+39${digits}`
}

export function companyInfo(env: Readonly<Record<string, string | undefined>> = process.env): CompanyInfo {
  const phone = clean(env.SITE_COMPANY_PHONE) ?? "045 6700620"
  const street = clean(env.SITE_COMPANY_STREET) ?? "Via Antonio Meucci 4"
  const locality = "Settimo di Pescantina"
  return {
    brand: "Lovato Legnami",
    legalName: "Lovato Alessandro S.r.l.",
    foundedYear: 1991,
    vatNumber: "02988330235",
    street,
    postalCode: "37026",
    locality,
    province: "VR",
    region: "Veneto",
    country: "IT",
    phone,
    phoneHref: phoneToHref(phone),
    email: clean(env.SITE_COMPANY_EMAIL) ?? "info@lovatosrl.it",
    website: "https://www.lovatosrl.it",
    hours: ["Lunedì–venerdì 8:00–12:00 e 13:30–17:30"],
    openingHours: ["Mo-Fr 08:00-12:00", "Mo-Fr 13:30-17:30"],
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Lovato Legnami, ${street}, ${locality}`)}`,
  }
}
