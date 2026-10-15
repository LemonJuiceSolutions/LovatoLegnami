import Link from "next/link"
import { euroRounded, metres } from "./format"
import { typologyHref, WIZARD_PATH } from "./links"
import type { TypologyCardData } from "./typology-card"

/**
 * Apertura della home: il titolo a sinistra e, a destra, una "tavola" di progetto con il
 * disegno della pergola di riferimento, le quote in oro e il cartiglio con misure e
 * prezzo di partenza. È l'elemento che distingue il sito: Lovato taglia il legno sul
 * disegno (centro CNC), e il cliente parte proprio da un disegno con le sue misure.
 */
export function Hero({ featured, foundedYear }: { featured: TypologyCardData | null; foundedYear: number }) {
  const price = featured?.fromPrice ?? null
  return (
    <section aria-labelledby="titolo-home" className="site-container grid items-center gap-12 pb-16 pt-10 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16 lg:pb-24">
      <div>
        <p className="text-muted-foreground">Dal {foundedYear} a Settimo di Pescantina, Verona</p>
        <h1 id="titolo-home" className="site-display site-h1 mt-5 max-w-[13ch]">
          Pergole in legno, disegnate sulle tue misure.
        </h1>
        <p className="site-lead mt-6">
          Scegli la forma, inserisci le misure del tuo spazio e vedi subito un prezzo indicativo. Poi veniamo noi a misurare e a montarla.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href={WIZARD_PATH} className="site-btn site-btn-primary">
            Calcola il prezzo
          </Link>
          <Link href="/pergole" className="site-btn site-btn-quiet">
            Guarda le pergole
          </Link>
        </div>
        <ul className="mt-10 grid max-w-[34rem] gap-3 text-foreground/85 sm:grid-cols-3 sm:gap-6">
          <li className="border-l-2 border-[hsl(var(--site-sage))] pl-3">Legno lamellare e massello</li>
          <li className="border-l-2 border-[hsl(var(--site-sage))] pl-3">Taglio CNC nel nostro laboratorio</li>
          <li className="border-l-2 border-[hsl(var(--site-sage))] pl-3">Montaggio a Verona e provincia</li>
        </ul>
      </div>

      {featured && (
        <figure className="relative">
          <div className="site-drafting relative rounded-[calc(var(--site-radius)*2)] border border-border p-5 sm:p-8">
            <div className="flex gap-3 sm:gap-4">
              {/* quota verticale */}
              {price && (
                <div className="flex flex-col items-center py-2" aria-hidden="true">
                  <span className="h-px w-3 bg-[hsl(var(--site-gold))]" />
                  <span className="site-trace-y origin-bottom w-px flex-1 bg-[hsl(var(--site-gold))]" />
                  <span className="my-2 text-[1rem] font-medium text-[hsl(var(--site-gold-ink))] [writing-mode:vertical-rl] rotate-180">
                    {metres(price.heightMm)}
                  </span>
                  <span className="site-trace-y origin-top w-px flex-1 bg-[hsl(var(--site-gold))]" />
                  <span className="h-px w-3 bg-[hsl(var(--site-gold))]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="site-drawing aspect-[5/4] text-foreground" dangerouslySetInnerHTML={{ __html: featured.drawingSvg }} />
                {/* quota orizzontale */}
                {price && (
                  <div className="mt-3 flex items-center" aria-hidden="true">
                    <span className="h-3 w-px bg-[hsl(var(--site-gold))]" />
                    <span className="site-trace-x origin-right h-px flex-1 bg-[hsl(var(--site-gold))]" />
                    <span className="mx-3 text-[1rem] font-medium text-[hsl(var(--site-gold-ink))]">{metres(price.widthMm)}</span>
                    <span className="site-trace-x origin-left h-px flex-1 bg-[hsl(var(--site-gold))]" />
                    <span className="h-3 w-px bg-[hsl(var(--site-gold))]" />
                  </div>
                )}
              </div>
            </div>
            {/* cartiglio */}
            <figcaption className="site-reveal mt-6 grid grid-cols-[1fr_auto] border border-foreground/70 bg-card text-[1rem] sm:ml-auto sm:max-w-[22rem]">
              <Link href={typologyHref(featured.seoSlug)} className="col-span-2 border-b border-foreground/70 px-4 py-2 font-semibold underline-offset-4 hover:underline">
                {featured.title}
              </Link>
              {price ? (
                <>
                  <span className="border-r border-foreground/70 px-4 py-2 text-muted-foreground">{`${metres(price.widthMm)} × ${metres(price.depthMm)}`}</span>
                  <span className="px-4 py-2 font-semibold text-[hsl(var(--site-gold-ink))]">{`da ${euroRounded(price.totalCents)}`}</span>
                </>
              ) : (
                <span className="col-span-2 px-4 py-2 text-muted-foreground">Prezzo calcolato sulle tue misure</span>
              )}
            </figcaption>
          </div>
        </figure>
      )}
    </section>
  )
}
