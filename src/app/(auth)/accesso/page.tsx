import { redirect } from "next/navigation"
import { SignInForm } from "@/components/auth/sign-in-form"
import { requestSignIn } from "@/server/actions/auth"
import { getSession, safeNextPath } from "@/server/auth"

export const dynamic = "force-dynamic"

type Search = { next?: string | string[]; error?: string | string[]; uscito?: string | string[] }
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function AccessoPage({ searchParams }: { searchParams: Search }) {
  const next = safeNextPath(one(searchParams.next))
  const error = one(searchParams.error)
  // Già autenticato: direttamente alla destinazione (requireUser la ricontrollerà).
  if (!error && (await getSession())) redirect(next)
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Accedi all&apos;area interna</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        {one(searchParams.uscito) ? "Sei uscito. " : ""}Inserisci la tua email aziendale: ti invieremo un collegamento per entrare senza password.
      </p>
      <SignInForm action={requestSignIn} next={next} error={error} />
    </>
  )
}
