"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { LogOut, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ROLE_LABELS, type Role } from "@/server/auth/permissions"

export interface NavUser {
  readonly name: string | null
  readonly email: string
  readonly role: Role
}

export function NavHeader({ user, onSignOut }: { user?: NavUser; onSignOut?: () => Promise<void> }) {
  const pathname = usePathname()
  const title = pathname.split("/").filter(Boolean)[0]?.toUpperCase() ?? ""

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
      <div className="flex items-center gap-3 pl-10 md:pl-0">
        <span className="text-sm font-semibold text-muted-foreground">{title}</span>
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-medium">{user.name ?? user.email}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
          </div>
        )}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden>
          <User className="h-4 w-4" />
        </div>
        {user && <SignOutButton onSignOut={onSignOut} />}
      </div>
    </header>
  )
}

function SignOutButton({ onSignOut }: { onSignOut?: () => Promise<void> }) {
  const [pending, startTransition] = React.useTransition()
  const run = () =>
    startTransition(async () => {
      const action = onSignOut ?? (await import("@/server/actions/auth")).signOutAction
      await action()
    })
  return (
    <Button type="button" variant="ghost" size="sm" onClick={run} disabled={pending}>
      <LogOut className="mr-1 h-4 w-4" aria-hidden />
      Esci
    </Button>
  )
}
