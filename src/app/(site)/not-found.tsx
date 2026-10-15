import Link from "next/link"

/** 404 del sito pubblico (anche per le tipologie nascoste). */
export default function SiteNotFound() {
  return (
    <section className="site-container py-24 md:py-32">
      <p className="text-muted-foreground">Errore 404</p>
      <h1 className="site-display site-h1 mt-3 max-w-[16ch]">Questa pagina non c&apos;è.</h1>
      <p className="site-lead mt-5">Forse il modello che cercavi non è più a catalogo. Guarda le pergole disponibili o chiedici direttamente.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/pergole" className="site-btn site-btn-primary">
          Guarda le pergole
        </Link>
        <Link href="/contatti" className="site-btn site-btn-quiet">
          Contattaci
        </Link>
      </div>
    </section>
  )
}
