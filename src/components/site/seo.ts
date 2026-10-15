import type { Metadata, MetadataRoute } from "next"
import type { SiteTypology } from "@/server/site/content"
import type { CompanyInfo } from "./company"
import { typologyHref } from "./links"

/**
 * SEO del sito pubblico (11.5): metadati per pagina, dati strutturati (JSON-LD) e
 * contenuto di sitemap/robots come funzioni pure, testate senza Next.
 */

export const SITE_NAME = "Lovato Legnami"

/** Immagine Open Graph comune (`/og.png`, vedi `og-image.tsx`). */
export const OG_ALT = "Lovato Legnami – pergole in legno su misura, Settimo di Pescantina (Verona)"
export const OG_SIZE = { width: 1200, height: 630 } as const
export const OG_PATH = "/og.png"

/** Metadati di una pagina: titolo, descrizione, canonical e Open Graph completi. */
export function pageMetadata({ title, description, path, absoluteTitle = false }: { title: string; description: string; path: string; absoluteTitle?: boolean }): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "it_IT",
      siteName: SITE_NAME,
      title: absoluteTitle ? title : `${title} – ${SITE_NAME}`,
      description,
      url: path,
      images: [{ url: OG_PATH, width: OG_SIZE.width, height: OG_SIZE.height, alt: OG_ALT }],
    },
  }
}

/** Percorsi pubblici fissi (oltre a home e tipologie) presenti nella sitemap. */
export const STATIC_PUBLIC_PATHS = ["/pergole", "/galleria", "/contatti", "/privacy"] as const

/** Aree mai indicizzate: interne, admin, API, accesso, wizard oltre il primo passo, preventivi dei clienti. */
export const DISALLOWED_PATHS = ["/admin", "/dashboard", "/configuratore", "/ai", "/api/", "/accesso", "/preventivo/", "/p/"] as const

export function buildSitemap(base: string, typologies: readonly Pick<SiteTypology, "seoSlug">[], lastModified: Date = new Date()): MetadataRoute.Sitemap {
  return [
    { url: `${base}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    ...STATIC_PUBLIC_PATHS.map((p) => ({ url: `${base}${p}`, lastModified, changeFrequency: "monthly" as const, priority: p === "/pergole" ? 0.9 : 0.5 })),
    ...typologies.map((t) => ({ url: `${base}${typologyHref(t.seoSlug)}`, lastModified, changeFrequency: "weekly" as const, priority: 0.8 })),
  ]
}

export function buildRobots(base: string): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...DISALLOWED_PATHS] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}

/** Attività locale (home). */
export function localBusinessJsonLd(company: CompanyInfo, base: string) {
  return {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    "@id": `${base}/#azienda`,
    name: company.brand,
    legalName: company.legalName,
    url: `${base}/`,
    telephone: company.phoneHref,
    email: company.email,
    foundingDate: String(company.foundedYear),
    vatID: `IT${company.vatNumber}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: company.street,
      postalCode: company.postalCode,
      addressLocality: company.locality,
      addressRegion: company.province,
      addressCountry: company.country,
    },
    openingHours: [...company.openingHours],
    areaServed: { "@type": "AdministrativeArea", name: "Provincia di Verona" },
    sameAs: [company.website],
  }
}

/** Prodotto (pagina tipologia) con l'offerta "a partire da" se c'è un prezzo. */
export function productJsonLd(t: Pick<SiteTypology, "title" | "description" | "tagline" | "seoSlug" | "fromPrice" | "categoryLabel">, base: string) {
  const url = `${base}${typologyHref(t.seoSlug)}`
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: t.title,
    description: t.description || t.tagline || t.title,
    category: t.categoryLabel,
    url,
    brand: { "@type": "Brand", name: SITE_NAME },
    ...(t.fromPrice
      ? {
          offers: {
            "@type": "Offer",
            url,
            priceCurrency: "EUR",
            price: (Math.round(t.fromPrice.totalCents) / 100).toFixed(2),
            availability: "https://schema.org/InStock",
            seller: { "@id": `${base}/#azienda` },
            priceSpecification: { "@type": "PriceSpecification", priceCurrency: "EUR", minPrice: (t.fromPrice.totalCents / 100).toFixed(2), valueAddedTaxIncluded: true },
          },
        }
      : {}),
  }
}

/** JSON da inserire in `<script type="application/ld+json">` senza poter chiudere il tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
}
