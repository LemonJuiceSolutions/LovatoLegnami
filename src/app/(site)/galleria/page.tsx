import type { Metadata } from "next"
import { pageMetadata } from "@/components/site/seo"
import { Cta } from "@/components/site/cta"
import { Gallery } from "@/components/site/gallery"
import { WIZARD_PATH } from "@/components/site/links"
import { getSiteContent } from "@/server/site/cached"

export const revalidate = 300

export const metadata: Metadata = pageMetadata({
  title: "Galleria",
  description: "Pergole in legno di Lovato Legnami: realizzazioni e configurazioni di riferimento, con le misure.",
  path: "/galleria",
})

export default async function GalleriaPage() {
  const { gallery } = await getSiteContent()
  const onlyDrawings = gallery.every((g) => g.kind === "drawing")
  return (
    <>
      <header className="site-container pb-10 pt-12 md:pt-16">
        <h1 className="site-display site-h1 max-w-[16ch]">Galleria</h1>
        <p className="site-lead mt-5">
          {onlyDrawings
            ? "Le configurazioni di partenza, disegnate dal nostro configuratore con le misure reali. Le foto dei lavori finiti arriveranno qui."
            : "Lavori realizzati e configurazioni di partenza, con le misure."}
        </p>
      </header>
      <div className="site-container pb-16">
        <Gallery items={gallery} />
      </div>
      <Cta title="Ti piace una di queste?" text="Parti da lì e cambia le misure: il prezzo indicativo si aggiorna mentre scegli." href={WIZARD_PATH} label="Calcola il prezzo" />
    </>
  )
}
