import Image from "next/image"
import Link from "next/link"
import type { SiteTypology } from "@/server/site/content"
import { Cta } from "./cta"
import { euroRounded, footprint } from "./format"
import { Gallery } from "./gallery"
import { wizardHref } from "./links"
import { Section } from "./section"
import { TypologyCard } from "./typology-card"

/** Pagina di una tipologia (componente puro, dati dal server). */
export function TypologyDetail({ typology }: { typology: SiteTypology }) {
  const price = typology.fromPrice
  const images = typology.gallery.map((img) => ({ kind: "image" as const, src: img.src, alt: img.alt, caption: typology.title }))
  return (
    <>
      <div className="site-container pt-8">
        <nav aria-label="Percorso">
          <ol className="flex flex-wrap gap-2 text-muted-foreground">
            <li>
              <Link href="/pergole" className="underline underline-offset-4">
                Pergole
              </Link>
              <span aria-hidden="true"> /</span>
            </li>
            <li aria-current="page">{typology.title}</li>
          </ol>
        </nav>
      </div>

      <section aria-labelledby="titolo-tipologia" className="site-container grid gap-12 pb-16 pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
        <div>
          <p className="text-muted-foreground">{typology.categoryLabel}</p>
          <h1 id="titolo-tipologia" className="site-display site-h1 mt-3">
            {typology.title}
          </h1>
          {typology.tagline && <p className="site-lead mt-5">{typology.tagline}</p>}
          {typology.description && <p className="mt-5 max-w-[60ch] text-foreground/85">{typology.description}</p>}

          <div className="mt-8 border-l-2 border-[hsl(var(--site-gold))] pl-5">
            {price ? (
              <>
                <p>
                  <span className="text-muted-foreground">a partire da </span>
                  <strong className="site-display text-[2.4rem] font-medium leading-none text-[hsl(var(--site-gold-ink))]">{euroRounded(price.totalCents)}</strong>
                  <span className="text-muted-foreground"> IVA inclusa</span>
                </p>
                <p className="mt-3 max-w-[56ch] text-muted-foreground">
                  Per {footprint(price.widthMm, price.depthMm)}
                  {price.presetName ? ` (${price.presetName})` : ""} in {price.finish.toLowerCase()}, senza copertura. Comprende{" "}
                  {price.includes.map((s) => s.toLowerCase()).join(", ")}. È un prezzo indicativo: quello definitivo arriva dopo il sopralluogo.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Prezzo su richiesta: inserisci le misure e ti rispondiamo con un preventivo.</p>
            )}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={wizardHref(typology.slug)} className="site-btn site-btn-primary">
              Calcola il prezzo con le tue misure
            </Link>
            <Link href="/contatti" className="site-btn site-btn-quiet">
              Fai una domanda
            </Link>
          </div>
        </div>

        <figure>
          <div className="relative aspect-[5/4] overflow-hidden rounded-[calc(var(--site-radius)*2)] border border-border">
            {typology.heroImage ? (
              <Image
                src={typology.heroImage.src}
                alt={typology.heroImage.alt}
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
                unoptimized={/^https:\/\//.test(typology.heroImage.src)}
              />
            ) : (
              <div className="site-drafting site-drawing absolute inset-0 p-8 text-foreground sm:p-12" dangerouslySetInnerHTML={{ __html: typology.drawingSvg }} />
            )}
          </div>
          <figcaption className="mt-3 text-muted-foreground">
            {typology.heroImage ? typology.heroImage.alt : `Disegno della configurazione di riferimento${price ? `, ${footprint(price.widthMm, price.depthMm)}` : ""}.`}
          </figcaption>
        </figure>
      </section>

      <Section title="Caratteristiche" className="border-t border-border/70">
        <ul className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
          {typology.features.map((f) => (
            <li key={f} className="border-t border-border pt-3">
              {f}
            </li>
          ))}
          <li className="border-t border-border pt-3">Pezzi tagliati e lavorati nel nostro centro CNC</li>
          <li className="border-t border-border pt-3">Consegna e montaggio con la nostra squadra</li>
        </ul>
      </Section>

      {images.length > 0 && (
        <Section title="Immagini">
          <Gallery items={images} />
        </Section>
      )}

      <Cta
        title={`La tua ${typology.title.toLowerCase()}, sulle tue misure`}
        text="Imposta larghezza, profondità e altezza, dicci cosa c'è intorno e vedi subito il prezzo indicativo."
        href={wizardHref(typology.slug)}
        label="Inizia dal preventivo"
      />
    </>
  )
}

/** Elenco delle tipologie visibili raggruppate per categoria, nell'ordine dell'ufficio. */
export function TypologyList({ typologies }: { typologies: readonly SiteTypology[] }) {
  const groups: { label: string; items: SiteTypology[] }[] = []
  for (const t of typologies) {
    const g = groups.find((x) => x.label === t.categoryLabel)
    if (g) g.items.push(t)
    else groups.push({ label: t.categoryLabel, items: [t] })
  }
  if (groups.length === 0) return <p className="site-container pb-24 text-muted-foreground">Stiamo aggiornando il catalogo: chiamaci e ti consigliamo noi.</p>
  return (
    <>
      {groups.map((g) => (
        <Section key={g.label} title={g.label} className="pt-6 md:pt-10">
          <div className="grid gap-x-10 gap-y-14 md:grid-cols-2">{g.items.map((t) => (
              <TypologyCard key={t.slug} typology={t} />
            ))}</div>
        </Section>
      ))}
    </>
  )
}
