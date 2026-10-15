import { redirect } from "next/navigation"
import { SignInForm } from "@/components/auth/sign-in-form"
import { requestSignIn } from "@/server/actions/auth"
import { currentUser, getSession, safeNextPath } from "@/server/auth"

export const dynamic = "force-dynamic"

type Search = { next?: string | string[]; error?: string | string[]; uscito?: string | string[] }
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function AccessoPage({ searchParams }: { searchParams: Search }) {
  const next = safeNextPath(one(searchParams.next))
  const error = one(searchParams.error)
  // Già autenticato con un utente valido nel database: direttamente alla destinazione.
  // Un JWT ancora firmato ma di un utente inesistente o disattivato vale come anonimo
  // (si mostra il form): fidarsi del solo cookie creava il ciclo `/accesso` ⇄ `/admin`.
  const user = error ? null : await currentUser()
  if (user) redirect(next)
  const stale = !error && !user && (await getSession()) !== null
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Accedi all&apos;area interna</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        {one(searchParams.uscito) ? "Sei uscito. " : ""}
        {stale ? "La sessione non è più valida: accedi di nuovo. " : ""}Inserisci la tua email aziendale: ti invieremo un collegamento per entrare senza password.
      </p>
      <SignInForm action={requestSignIn} next={next} error={error} />
    </>
  )
}
