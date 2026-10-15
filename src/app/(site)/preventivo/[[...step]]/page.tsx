import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { WIZARD_STEPS, stepFromSegments } from "@/components/wizard/answers"
import { PreventivoWizard } from "@/components/wizard/wizard"
import { getWizardData } from "@/server/site/wizard-data"

/**
 * Wizard del preventivo (P8/P9, 12.3): `/preventivo` è il passo 1 (indicizzabile),
 * `/preventivo/<passo>` gli altri, con `noindex` (anche `robots.txt` esclude
 * `/preventivo/`). Dati del server (tipologie, finiture, regole) in cache 300 s.
 */

export const revalidate = 300

type Params = { step?: string[] }

export function generateStaticParams(): Params[] {
  return [{ step: [] }, ...WIZARD_STEPS.filter((s) => s !== "tipologia").map((s) => ({ step: [s] }))]
}

export function generateMetadata({ params }: { params: Params }): Metadata {
  const first = !params.step || params.step.length === 0
  return {
    title: "Preventivo online della tua pergola",
    description: "Scegli il modello, inserisci le misure e vedi subito il prezzo indicativo della tua pergola in legno. Poi ti ricontattiamo per il sopralluogo.",
    alternates: { canonical: "/preventivo" },
    ...(first ? {} : { robots: { index: false, follow: false } }),
  }
}

export default async function PreventivoPage({ params }: { params: Params }) {
  const step = stepFromSegments(params.step)
  if (!step) notFound()
  const data = await getWizardData()
  return (
    <Suspense fallback={<div className="site-container py-10 text-muted-foreground">Caricamento del preventivo…</div>}>
      <PreventivoWizard data={data} step={step} />
    </Suspense>
  )
}
