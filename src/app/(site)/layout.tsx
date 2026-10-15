import type { Metadata, Viewport } from "next"
import { Archivo, Fraunces } from "next/font/google"
import { siteUrl } from "@/components/site/links"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import "./site.css"

/*
 * Sito pubblico (P8): tema `.theme-site` sopra i token shadcn, caratteri propri.
 * Fraunces (display, asse ottico e "SOFT") dà il calore del mestiere; Archivo è il
 * carattere del sito di Lovato, robusto e leggibile nel testo corrente.
 */
const display = Fraunces({ subsets: ["latin"], axes: ["opsz", "SOFT"], variable: "--font-site-display", display: "swap" })
const body = Archivo({ subsets: ["latin"], variable: "--font-site-body", display: "swap" })

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Lovato Legnami – Pergole in legno su misura a Verona", template: "%s – Lovato Legnami" },
  description:
    "Pergole, coperture e gazebo in legno progettati sulle tue misure da Lovato Legnami, Settimo di Pescantina (Verona), dal 1991. Prezzo indicativo online e sopralluogo.",
  applicationName: "Lovato Legnami",
  robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "it_IT", siteName: "Lovato Legnami" },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F6F2" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1A15" },
  ],
  width: "device-width",
  initialScale: 1,
}

/**
 * Tema chiaro/scuro dalle preferenze del sistema, applicato prima del primo disegno
 * (script in linea come primo figlio del contenitore: nessun lampo, nessun cookie).
 */
const THEME_SCRIPT = `(function(){var e=document.currentScript&&document.currentScript.parentElement;if(!e||!window.matchMedia)return;var m=window.matchMedia("(prefers-color-scheme: dark)");function a(){e.classList.toggle("dark",m.matches)}a();m.addEventListener&&m.addEventListener("change",a)})();`

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`theme-site ${display.variable} ${body.variable} flex min-h-screen flex-col`} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <SiteHeader />
      <main id="contenuto" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
