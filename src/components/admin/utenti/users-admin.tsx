"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { ActionResult } from "@/server/actions/result"
import { ROLE_LABELS, ROLES, type Role } from "@/server/auth/permissions"

/**
 * Utenti interni (9.10, solo `utenti:gestisci`): elenco, creazione, cambio di ruolo,
 * attivazione/disattivazione. Le regole (email unica, ultimo amministratore attivo) sono
 * del server: qui si mostra l'esito.
 */

export interface UserRowView {
  readonly id: string
  readonly email: string
  readonly name: string | null
  readonly role: Role
  readonly active: boolean
  readonly createdAt: string
}

export interface UserActions {
  readonly create: (input: { email: string; name?: string | null; role: string }) => Promise<ActionResult<unknown>>
  readonly setActive: (id: string, active: boolean) => Promise<ActionResult<unknown>>
  readonly setRole: (id: string, role: string) => Promise<ActionResult<unknown>>
  readonly resetPassword: (id: string) => Promise<ActionResult<{ email: string; password: string }>>
}

const serverActions: UserActions = {
  create: async (input) => (await import("@/server/actions/users")).createUserAction(input),
  setActive: async (id, active) => (await import("@/server/actions/users")).setUserActiveAction(id, active),
  setRole: async (id, role) => (await import("@/server/actions/users")).setUserRoleAction(id, role),
  resetPassword: async (id) => (await import("@/server/actions/users")).resetUserPasswordAction(id),
}

const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm"

export function UsersAdmin({ users, currentUserId, actions = serverActions }: { users: readonly UserRowView[]; currentUserId: string; actions?: UserActions }) {
  const router = useRouter()
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [pending, start] = React.useTransition()
  const [email, setEmail] = React.useState("")
  const [name, setName] = React.useState("")
  const [role, setRole] = React.useState<Role>("commerciale")
  // Password generata dalla reimpostazione: mostrata una sola volta, solo in memoria.
  const [issued, setIssued] = React.useState<{ email: string; password: string } | null>(null)

  const resetPassword = (u: UserRowView) => {
    if (!window.confirm(`Reimpostare la password di ${u.email}? Quella attuale smetterà di funzionare.`)) return
    start(async () => {
      const r = await actions.resetPassword(u.id)
      if (r.ok) {
        setIssued(r.data)
        setMessage(null)
      } else setMessage({ kind: "error", text: r.message })
    })
  }

  const run = (fn: () => Promise<ActionResult<unknown>>, ok: string, after?: () => void) =>
    start(async () => {
      setIssued(null)
      const r = await fn()
      if (r.ok) {
        setMessage({ kind: "ok", text: ok })
        after?.()
        router.refresh()
      } else setMessage({ kind: "error", text: r.message })
    })

  return (
    <div className="space-y-4">
      <form
        aria-label="Nuovo utente"
        className="flex flex-wrap items-end gap-2 rounded-md border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => actions.create({ email, name: name.trim() || null, role }), `Utente ${email.trim().toLowerCase()} creato: imposta la sua password con «Reimposta password»`, () => {
            setEmail("")
            setName("")
          })
        }}
      >
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Email</span>
          <Input type="email" required className="h-9 w-64" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Nome</span>
          <Input className="h-9 w-48" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Ruolo</span>
          <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={pending || !email.trim()}>
          Crea utente
        </Button>
      </form>
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message.text}
        </p>
      )}
      {issued && (
        <div role="status" className="space-y-1 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
          <p>
            Nuova password di <strong>{issued.email}</strong> (mostrata solo ora, comunicala in modo riservato):
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <code className="select-all rounded bg-muted px-2 py-1 font-mono text-base" data-testid="password-generata">
              {issued.password}
            </code>
            <Button type="button" size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(issued.password)}>
              Copia
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setIssued(null)}>
              Nascondi
            </Button>
          </p>
        </div>
      )}
      <div className="overflow-auto rounded-md border">
        <table className="w-full text-sm" aria-label="Utenti">
          <thead className="bg-muted">
            <tr>
              {["Email", "Nome", "Ruolo", "Attivo", "Creato il", "Password"].map((h) => (
                <th key={h} scope="col" className="px-2 py-1.5 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-2 py-1.5">
                  {u.email}
                  {u.id === currentUserId && <span className="ml-1 text-xs text-muted-foreground">(tu)</span>}
                </td>
                <td className="px-2 py-1.5">{u.name ?? "—"}</td>
                <td className="px-2 py-1.5">
                  <select
                    aria-label={`Ruolo di ${u.email}`}
                    className={selectClass}
                    value={u.role}
                    disabled={pending}
                    onChange={(e) => run(() => actions.setRole(u.id, e.target.value), `Ruolo di ${u.email}: ${ROLE_LABELS[e.target.value as Role]}`)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <Switch
                    aria-label={`${u.email} attivo`}
                    checked={u.active}
                    disabled={pending}
                    onCheckedChange={(v) => run(() => actions.setActive(u.id, v), v ? `${u.email} riattivato` : `${u.email} disattivato: perde subito l'accesso`)}
                  />
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{u.createdAt}</td>
                <td className="px-2 py-1.5">
                  {u.id === currentUserId ? (
                    <span className="text-xs text-muted-foreground">dal menu «Cambia password»</span>
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled={pending} aria-label={`Reimposta la password di ${u.email}`} onClick={() => resetPassword(u)}>
                      Reimposta password
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
