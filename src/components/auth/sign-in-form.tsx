"use client"

import * as React from "react"
import { KeyRound, Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type SignInAction = (formData: FormData) => Promise<{ ok: false; message: string } | void>

/** Messaggi per gli errori di Auth.js nella pagina di accesso (`?error=…`). */
export function linkErrorMessage(error: string | undefined): string | null {
  if (!error) return null
  if (error === "CredentialsSignin") return "Email o password non corretti."
  if (error === "Verification") return "Il collegamento è scaduto o è già stato usato. Richiedine uno nuovo qui sotto."
  if (error === "AccessDenied") return "Il collegamento non è più valido per questo indirizzo. Se pensi sia un errore contatta l'amministratore."
  return "Non è stato possibile completare l'accesso. Richiedi un nuovo collegamento."
}

/** Avviso per l'errore di Auth.js arrivato nell'URL (`?error=…`), se c'è. */
export function AuthErrorAlert({ error, id = "accesso-errore-link" }: { error?: string; id?: string }) {
  const text = linkErrorMessage(error)
  if (!text) return null
  return (
    <p id={id} role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {text}
    </p>
  )
}

/**
 * Form principale: email e password (server action `signInWithPassword`). L'errore è sempre
 * generico ("Email o password non corretti"); dopo un errore la password si svuota.
 */
export function PasswordSignInForm({ action, next }: { action: SignInAction; next: string }) {
  const [pending, startTransition] = React.useTransition()
  const [message, setMessage] = React.useState<string | null>(null)
  const passwordRef = React.useRef<HTMLInputElement>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setMessage(null)
    startTransition(async () => {
      const result = await action(data)
      if (result && !result.ok) {
        setMessage(result.message)
        if (passwordRef.current) {
          passwordRef.current.value = ""
          passwordRef.current.focus()
        }
      }
    })
  }

  const describedBy = message ? "accesso-password-errore" : undefined
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate aria-label="Accesso con email e password">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="accesso-password-email">Email</Label>
        <Input
          id="accesso-password-email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          placeholder="nome@lovatolegnami.it"
          aria-invalid={message ? true : undefined}
          aria-describedby={describedBy}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="accesso-password">Password</Label>
        <Input
          ref={passwordRef}
          id="accesso-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={message ? true : undefined}
          aria-describedby={describedBy}
        />
      </div>
      {message && (
        <p id="accesso-password-errore" role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="mr-2 h-4 w-4" aria-hidden />}
        Accedi
      </Button>
    </form>
  )
}

/**
 * Form del collegamento via email (secondario): un solo campo email. L'azione (server action `requestSignIn`) è
 * passata dalla pagina, così il componente è testabile senza il server.
 */
export function SignInForm({ action, next, error }: { action: SignInAction; next: string; error?: string }) {
  const [pending, startTransition] = React.useTransition()
  const [message, setMessage] = React.useState<string | null>(null)
  const linkError = linkErrorMessage(error)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setMessage(null)
    startTransition(async () => {
      const result = await action(data)
      if (result && !result.ok) setMessage(result.message)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate aria-label="Collegamento di accesso via email" aria-describedby={linkError ? "accesso-errore-link" : undefined}>
      <AuthErrorAlert error={error} />
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="accesso-email">Email</Label>
        <Input
          id="accesso-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="nome@lovatolegnami.it"
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? "accesso-errore" : undefined}
        />
        {message && (
          <p id="accesso-errore" role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Mail className="mr-2 h-4 w-4" aria-hidden />}
        Invia il collegamento di accesso
      </Button>
      <p className="text-xs text-muted-foreground">Riceverai un collegamento valido 15 minuti, utilizzabile una sola volta.</p>
    </form>
  )
}
