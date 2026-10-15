"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useState } from "react"

interface NavItem {
  readonly href: string
  readonly label: string
}

/** Menu a comparsa per schermi stretti: si chiude al cambio pagina e con Esc. */
export function MobileNav({ items, ctaHref }: { items: readonly NavItem[]; ctaHref: string }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const panelId = useId()

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-foreground/25 px-4 font-medium"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
          {open ? (
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          )}
        </svg>
        Menu
      </button>
      <nav
        id={panelId}
        aria-label="Menu"
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-border bg-background px-[var(--site-gutter)] pb-6 pt-2 shadow-[0_12px_24px_-16px_hsl(var(--foreground)/0.4)]"
      >
        <ul className="divide-y divide-border/70">
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="block py-4 text-[1.15rem] font-medium">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link href={ctaHref} className="site-btn site-btn-primary mt-4 w-full">
          Richiedi preventivo
        </Link>
      </nav>
    </div>
  )
}
