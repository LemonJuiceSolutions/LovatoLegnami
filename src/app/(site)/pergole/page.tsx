import type { Metadata } from "next"
import { TypologyList } from "@/components/site/typology-detail"
import { getSiteContent } from "@/server/site/cached"

export const revalidate = 300

export const metadata: Metadata = {
  title: "Pergole in legno",
  description: "Le pergole in legno di Lovato Legnami: addossate al muro o autoportanti, progettate sulle tue misure con prezzo indicativo online.",
  alternates: { canonical: "/pergole" },
}

export default async function PergolePage() {
  const { typologies } = await getSiteContent()
  return (
    <>
      <header className="site-container pb-4 pt-12 md:pt-16">
        <h1 className="site-display site-h1 max-w-[16ch]">Le nostre pergole</h1>
        <p className="site-lead mt-5">Ogni modello si adatta alle tue misure. Il prezzo &ldquo;da&rdquo; è quello della misura di riferimento indicata.</p>
      </header>
      <TypologyList typologies={typologies} />
    </>
  )
}
