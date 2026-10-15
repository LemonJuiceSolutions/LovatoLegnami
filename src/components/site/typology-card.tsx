import Image from "next/image"
import Link from "next/link"
import type { SiteTypology } from "@/server/site/content"
import { euroRounded, footprint } from "./format"
import { typologyHref, wizardHref } from "./links"

export type TypologyCardData = Pick<SiteTypology, "slug" | "seoSlug" | "title" | "tagline" | "description" | "categoryLabel" | "heroImage" | "drawingSvg" | "fromPrice">

/** Prezzo "a partire da" con la misura di riferimento; senza prezzo, "su richiesta". */
export function FromPriceLine({ fromPrice }: { fromPrice: SiteTypology["fromPrice"] }) {
  if (!fromPrice) return <p className="text-muted-foreground">Prezzo su richiesta</p>
  return (
    <p>
      <span className="text-muted-foreground">da </span>
      <strong className="site-display text-[1.6rem] font-medium text-[hsl(var(--site-gold-ink))]">{euroRounded(fromPrice.totalCents)}</strong>
      <span className="text-muted-foreground"> IVA inclusa, per {footprint(fromPrice.widthMm, fromPrice.depthMm)}</span>
    </p>
  )
}

/**
 * Scheda di una tipologia: foto dell'ufficio se c'è, altrimenti il disegno isometrico
 * del preset di riferimento su carta millimetrata; titolo, sottotitolo, prezzo "a
 * partire da" e due azioni (la pagina della tipologia e il preventivo già impostato).
 */
export function TypologyCard({ typology, headingLevel = "h3" }: { typology: TypologyCardData; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel
  const href = typologyHref(typology.seoSlug)
  return (
    <article className="group flex flex-col">
      <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--site-radius)] border border-border/80">
          {typology.heroImage ? (
            <Image
              src={typology.heroImage.src}
              alt=""
              fill
              sizes="(min-width: 1024px) 40vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
              unoptimized={/^https:\/\//.test(typology.heroImage.src)}
            />
          ) : (
            <div
              className="site-drafting site-drawing absolute inset-0 p-8 text-foreground transition-transform duration-500 group-hover:scale-[1.02]"
              dangerouslySetInnerHTML={{ __html: typology.drawingSvg }}
            />
          )}
        </div>
      </Link>
      <div className="mt-5 flex flex-1 flex-col">
        <p className="text-muted-foreground">{typology.categoryLabel}</p>
        <Heading className="site-display site-h3 mt-1">
          <Link href={href} className="underline-offset-4 hover:underline">
            {typology.title}
          </Link>
        </Heading>
        {(typology.tagline || typology.description) && (
          <p className="mt-2 line-clamp-3 max-w-[52ch] text-foreground/80">{typology.tagline || typology.description}</p>
        )}
        <div className="mt-4">
          <FromPriceLine fromPrice={typology.fromPrice} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={wizardHref(typology.slug)} className="site-btn site-btn-primary">
            Calcola il prezzo<span className="sr-only"> di {typology.title}</span>
          </Link>
          <Link href={href} className="site-btn site-btn-quiet">
            Dettagli<span className="sr-only"> di {typology.title}</span>
          </Link>
        </div>
      </div>
    </article>
  )
}
