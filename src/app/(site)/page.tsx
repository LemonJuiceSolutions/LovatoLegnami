import Link from "next/link"
import { WIZARD_PATH } from "@/components/site/links"

export default function HomePage() {
  return (
    <section className="site-container py-24">
      <h1 className="site-display site-h1 max-w-[14ch]">Pergole in legno, progettate sulle tue misure.</h1>
      <p className="site-lead mt-6">Scegli la forma, inserisci le misure del tuo spazio e ricevi subito un prezzo indicativo.</p>
      <Link href={WIZARD_PATH} className="site-btn site-btn-primary mt-8">
        Calcola il prezzo
      </Link>
    </section>
  )
}
