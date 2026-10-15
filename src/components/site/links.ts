/**
 * Percorsi del sito pubblico. Il wizard (gruppo 12) vive in `/preventivo`: il sito
 * vi entra sempre da qui, con la tipologia precompilata quando c'è (`?tipologia=`).
 */
export const SITE_NAV = [
  { href: "/pergole", label: "Pergole" },
  { href: "/galleria", label: "Galleria" },
  { href: "/contatti", label: "Contatti" },
] as const

export const WIZARD_PATH = "/preventivo"

/** Avvio del wizard, eventualmente con la tipologia già scelta. */
export function wizardHref(typologySlug?: string): string {
  return typologySlug ? `${WIZARD_PATH}?tipologia=${encodeURIComponent(typologySlug)}` : WIZARD_PATH
}

export const typologyHref = (seoSlug: string) => `/pergole/${seoSlug}`

/** URL pubblico del sito senza barra finale (metadata, canonical, sitemap, JSON-LD). */
export function siteUrl(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return (env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "")
}
