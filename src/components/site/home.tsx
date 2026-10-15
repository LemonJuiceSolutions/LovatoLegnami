import Link from "next/link"
import type { SiteContent } from "@/server/site/content"
import type { CompanyInfo } from "./company"
import { ContactBlock } from "./contact-block"
import { Cta } from "./cta"
import { Gallery } from "./gallery"
import { Hero } from "./hero"
import { WIZARD_PATH } from "./links"
import { Section } from "./section"
import { Steps } from "./steps"
import { TypologyCard } from "./typology-card"

/** Numero di elementi della galleria breve in home. */
export const HOME_GALLERY_ITEMS = 3

const WORKSHOP = [
  { term: "Dal 1991", text: "Commercio e lavorazione del legno a Settimo di Pescantina." },
  { term: "Centro di taglio CNC", text: "Travi, incastri e fori tagliati a macchina sul disegno della tua pergola." },
  { term: "Lamellare certificato", text: "Abete, larice e castagno, lamellare o massello, trattati per l'esterno." },
  { term: "Consegna e montaggio", text: "Le nostre squadre montano a Verona e provincia; fuori zona ne parliamo." },
] as const

/** Contenuto della home (componente puro: dati in ingresso, testabile senza server). */
export function HomeContent({ content, company }: { content: SiteContent; company: CompanyInfo }) {
  const [featured] = content.typologies
  return (
    <>
      <Hero featured={featured ?? null} foundedYear={company.foundedYear} />

      <Section
        id="pergole"
        title="Scegli la forma"
        intro="Ogni pergola nasce da un modello che adattiamo alle tue misure: le sezioni del legno si dimensionano da sole sulla luce e sui carichi."
        action={
          <Link href="/pergole" className="font-medium text-primary underline underline-offset-4">
            Tutte le pergole
          </Link>
        }
      >
        {content.typologies.length > 0 ? (
          <div className="grid gap-x-10 gap-y-14 md:grid-cols-2">
            {content.typologies.slice(0, 4).map((t) => (
              <TypologyCard key={t.slug} typology={t} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">Stiamo aggiornando il catalogo: chiamaci e ti consigliamo noi.</p>
        )}
      </Section>

      <div className="border-y border-border/70 bg-secondary/40">
        <Section
          id="come-funziona"
          title="Come funziona"
          intro="Il prezzo online è indicativo: lo calcoliamo con il nostro listino, e diventa definitivo dopo il sopralluogo."
        >
          <Steps />
        </Section>
      </div>

      <Section id="laboratorio" title="Dal legname alla pergola montata">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="site-prose text-[1.125rem]">
            <p>
              Lovato Legnami lavora il legno da più di trent&apos;anni: semilavorati, arredo urbano, coperture e case in legno. Le pergole sono la parte del
              nostro lavoro che entra nei giardini di casa.
            </p>
            <p>
              Il disegno che vedi online è lo stesso da cui partiamo in laboratorio: le misure diventano pezzi, i pezzi passano dal centro di taglio, e la
              squadra di montaggio trova tutto già pronto.
            </p>
          </div>
          <dl className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
            {WORKSHOP.map((w) => (
              <div key={w.term} className="border-t border-border pt-4">
                <dt className="site-display site-h3">{w.term}</dt>
                <dd className="mt-2 text-muted-foreground">{w.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      {content.gallery.length > 0 && (
        <Section
          id="galleria"
          title="Dalla galleria"
          action={
            <Link href="/galleria" className="font-medium text-primary underline underline-offset-4">
              Apri la galleria
            </Link>
          }
        >
          <Gallery items={content.gallery.slice(0, HOME_GALLERY_ITEMS)} />
        </Section>
      )}

      <Cta
        title="Hai già le misure?"
        text="Bastano pochi minuti per avere un prezzo indicativo. Lo ricevi anche via email, con il riepilogo in PDF."
        href={WIZARD_PATH}
        label="Calcola il prezzo"
      />

      <Section id="contatti" title="Parliamone">
        <ContactBlock company={company} />
      </Section>
    </>
  )
}
