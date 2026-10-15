import Link from "next/link"
import { MailCheck } from "lucide-react"

export const dynamic = "force-static"

/** Pagina neutra dopo la richiesta: identica per indirizzi registrati e non (spec). */
export default function AccessoInviatoPage() {
  const dev = process.env.NODE_ENV !== "production"
  return (
    <>
      <MailCheck className="mb-3 h-8 w-8 text-primary" aria-hidden />
      <h1 className="mb-2 text-xl font-semibold">Controlla la posta</h1>
      <p className="text-sm">Se l&apos;indirizzo è registrato riceverai un&apos;email con il collegamento per accedere.</p>
      <p className="mt-2 text-sm text-muted-foreground">Il collegamento vale 15 minuti e si può usare una sola volta.</p>
      {dev && (
        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Sviluppo: senza RESEND_API_KEY l&apos;email non parte e il collegamento è stampato nel terminale di <code>npm run dev</code>.
        </p>
      )}
      <p className="mt-5 text-sm">
        <Link href="/accesso" className="underline underline-offset-4">
          Non è arrivata? Richiedi un nuovo collegamento
        </Link>
      </p>
    </>
  )
}
