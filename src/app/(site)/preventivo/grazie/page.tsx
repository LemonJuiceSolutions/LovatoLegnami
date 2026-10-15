import type { Metadata } from "next"
import { Suspense } from "react"
import { ThankYou } from "@/components/wizard/thank-you"

/** Conferma dell'invio (12.7): codice della richiesta e riepilogo dalla sessione del browser. */
export const metadata: Metadata = {
  title: "Richiesta inviata",
  robots: { index: false, follow: false },
}

export default function GraziePage() {
  return (
    <Suspense fallback={<div className="site-container py-16 text-muted-foreground">Caricamento…</div>}>
      <ThankYou />
    </Suspense>
  )
}
