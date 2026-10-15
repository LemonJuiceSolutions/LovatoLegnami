import { redirect } from "next/navigation"
import { AuthErrorAlert, PasswordSignInForm, SignInForm } from "@/components/auth/sign-in-form"
import { requestSignIn, signInWithPassword } from "@/server/actions/auth"
import { currentUser, getSession, safeNextPath } from "@/server/auth"
import { getEnv } from "@/server/env"

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
  // Il collegamento via email si offre solo se le email partono davvero (Resend configurato).
  const emailLink = Boolean(getEnv().resendApiKey)
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Accedi all&apos;area interna</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        {one(searchParams.uscito) ? "Sei uscito. " : ""}
        {stale ? "La sessione non è più valida: accedi di nuovo. " : ""}Inserisci la tua email aziendale e la password.
      </p>
      <div className="space-y-4">
        <AuthErrorAlert error={error} />
        <PasswordSignInForm action={signInWithPassword} next={next} />
        {emailLink && (
          <details className="group rounded-md border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">Ricevi un link via email</summary>
            <div className="pt-3">
              <p className="mb-3 text-xs text-muted-foreground">Senza password: ti invieremo un collegamento per entrare.</p>
              <SignInForm action={requestSignIn} next={next} />
            </div>
          </details>
        )}
      </div>
    </>
  )
}
