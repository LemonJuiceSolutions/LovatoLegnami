import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * Marchio tipografico "Lovato Legnami": il nodo di due travi incrociate (il dettaglio
 * costruttivo di ogni pergola) e il nome in Fraunces. Il PNG del logo ufficiale è a
 * bassa risoluzione: il marchio disegnato resta nitido a ogni scala e in tema scuro.
 */
export function JointMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("h-8 w-8 shrink-0", className)}>
      {/* trave orizzontale in sezione e trave verticale: un incastro a mezzo legno */}
      <rect x="2" y="12" width="28" height="8" rx="1" fill="hsl(var(--primary))" />
      <rect x="12" y="2" width="8" height="28" rx="1" fill="hsl(var(--site-gold))" />
      <rect x="12" y="12" width="8" height="8" fill="hsl(var(--primary))" opacity="0.55" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-3 no-underline", className)} aria-label="Lovato Legnami, pagina iniziale">
      <JointMark />
      <span className="flex flex-col leading-none">
        <span className="site-display text-[1.6rem] tracking-[-0.01em]" style={{ lineHeight: 1 }}>
          Lovato
        </span>
        <span className="mt-1 text-[0.8rem] font-semibold tracking-[0.28em] text-[hsl(var(--site-gold-ink))]">LEGNAMI</span>
      </span>
    </Link>
  )
}
