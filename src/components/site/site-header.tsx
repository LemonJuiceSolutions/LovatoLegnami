import Link from "next/link"
import { SITE_NAV, WIZARD_PATH } from "./links"
import { MobileNav } from "./mobile-nav"
import { Wordmark } from "./wordmark"

/**
 * Intestazione del sito: marchio, pergole, galleria, contatti e l'invito al preventivo.
 * Su schermi stretti i collegamenti passano nel menu a comparsa (`MobileNav`).
 */
export function SiteHeader() {
  return (
    <header className="relative z-20 border-b border-border/70">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-30 focus:rounded focus:bg-background focus:px-4 focus:py-2"
      >
        Vai al contenuto
      </a>
      <div className="site-container flex h-20 items-center justify-between gap-6">
        <Wordmark />
        <nav aria-label="Principale" className="hidden items-center gap-8 md:flex">
          <ul className="flex items-center gap-7">
            {SITE_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="font-medium text-foreground/85 underline-offset-[6px] hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href={WIZARD_PATH} className="site-btn site-btn-primary">
            Richiedi preventivo
          </Link>
        </nav>
        <MobileNav items={SITE_NAV} ctaHref={WIZARD_PATH} />
      </div>
    </header>
  )
}
