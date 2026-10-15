"use client"

import * as React from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ActionResult } from "@/server/actions/result"

/** Lunghezza minima (= `PASSWORD_MIN_LENGTH` del server, che resta il controllo vincolante). */
const MIN = 12

export type ChangePasswordAction = (input: { current: string; next: string }) => Promise<ActionResult<unknown>>

const serverAction: ChangePasswordAction = async (input) => (await import("@/server/actions/password")).changeOwnPasswordAction(input)

/**
 * "Cambia password" dal menu utente: password attuale (vuota se non è ancora impostata,
 * es. chi è entrato con il collegamento via email), nuova e conferma. Le regole sono del
 * server; qui solo i controlli immediati (lunghezza, conferma).
 */
export function ChangePasswordDialog({ action = serverAction }: { action?: ChangePasswordAction }) {
  const [open, setOpen] = React.useState(false)
  const [pending, start] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const current = String(data.get("current") ?? "")
    const next = String(data.get("next") ?? "")
    const confirm = String(data.get("confirm") ?? "")
    setError(null)
    if (next.length < MIN) return setError(`La nuova password deve avere almeno ${MIN} caratteri.`)
    if (next !== confirm) return setError("Le due password nuove non coincidono.")
    start(async () => {
      const r = await action({ current, next })
      if (r.ok) setDone(true)
      else setError(r.message)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) {
          setError(null)
          setDone(false)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <KeyRound className="mr-1 h-4 w-4" aria-hidden />
          Cambia password
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cambia password</DialogTitle>
          <DialogDescription>Almeno {MIN} caratteri. Se non hai ancora una password, lascia vuoto il primo campo.</DialogDescription>
        </DialogHeader>
        {done ? (
          <>
            <p role="status" className="text-sm">
              Password aggiornata: usala dal prossimo accesso.
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                Chiudi
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="cp-current">Password attuale</Label>
              <Input id="cp-current" name="current" type="password" autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-next">Nuova password</Label>
              <Input id="cp-next" name="next" type="password" autoComplete="new-password" minLength={MIN} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-confirm">Conferma la nuova password</Label>
              <Input id="cp-confirm" name="confirm" type="password" autoComplete="new-password" minLength={MIN} required />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Salva la password
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
