import { can, type Actor, type Permission } from "@/server/auth/permissions"
import type { DatasetName } from "./types"

/**
 * Sezioni dell'area admin (spec `back-office-admin`, 9.1) e permessi che le aprono: una
 * sezione è visibile se l'utente ha **almeno uno** dei permessi elencati. Modulo puro,
 * usato dalla sidebar e dalla sotto-navigazione per nascondere ciò che non serve; il
 * controllo vincolante è `requirePageUser`/`requireUser` nelle pagine e nelle action.
 */

export interface AdminSection {
  readonly href: string
  readonly label: string
  readonly permissions: readonly Permission[]
}

const PRICE_LIST: readonly Permission[] = ["listino:scrivi", "listino-tecnico:scrivi"]

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { href: "/admin/listino", label: "Listino", permissions: PRICE_LIST },
  { href: "/admin/regole", label: "Regole", permissions: ["regole:scrivi"] },
  { href: "/admin/tipologie", label: "Tipologie", permissions: ["tipologie:scrivi"] },
  { href: "/admin/preset", label: "Preset", permissions: ["preset:scrivi"] },
  { href: "/admin/richieste", label: "Richieste", permissions: ["richieste:leggi"] },
  { href: "/admin/utenti", label: "Utenti", permissions: ["utenti:gestisci"] },
  { href: "/admin/registro", label: "Registro", permissions: ["listino:scrivi", "listino-tecnico:scrivi", "regole:scrivi", "tipologie:scrivi", "preset:scrivi", "utenti:gestisci"] },
  { href: "/admin/simula", label: "Simula", permissions: PRICE_LIST },
]

/** Sotto-sezioni del listino (`/admin/listino/<slug>`), con il permesso di chi le modifica. */
export const PRICE_LIST_SECTIONS = [
  { slug: "legno", label: "Legno e lunghezze" },
  { slug: "lavorazioni", label: "Lavorazioni" },
  { slug: "ferramenta", label: "Ferramenta" },
  { slug: "finiture", label: "Trattamenti e coperture" },
  { slug: "montaggio", label: "Montaggio" },
  { slug: "complicazioni", label: "Complicazioni" },
  { slug: "trasporto", label: "Trasporto" },
  { slug: "margini", label: "Margini e IVA" },
] as const
export type PriceListSectionSlug = (typeof PRICE_LIST_SECTIONS)[number]["slug"]

export const canOpenSection = (user: Actor | null | undefined, section: AdminSection): boolean => section.permissions.some((p) => can(user, p))

/** Sezioni che l'utente può aprire, nell'ordine della navigazione. */
export const adminSectionsFor = (user: Actor | null | undefined): AdminSection[] => ADMIN_SECTIONS.filter((s) => canOpenSection(user, s))

/** Voce "ADMIN" della sidebar: almeno una sezione accessibile. */
export const canAccessAdmin = (user: Actor | null | undefined): boolean => adminSectionsFor(user).length > 0

/** Permessi che consentono di modificare e pubblicare ogni insieme di dati (uno qualsiasi). */
export const DATASET_PERMISSIONS: Readonly<Record<DatasetName, readonly Permission[]>> = {
  listino: PRICE_LIST,
  regole: ["regole:scrivi"],
  tipologie: ["tipologie:scrivi"],
  preset: ["preset:scrivi"],
}

/** Pagina dell'editor di ogni insieme di dati. */
export const DATASET_HREF: Readonly<Record<DatasetName, string>> = {
  listino: "/admin/listino",
  regole: "/admin/regole",
  tipologie: "/admin/tipologie",
  preset: "/admin/preset",
}

export const canPublishDataset = (user: Actor | null | undefined, dataset: DatasetName): boolean => DATASET_PERMISSIONS[dataset].some((p) => can(user, p))

/** Sezione di un percorso (`/admin/listino/legno` → Listino). */
export const sectionOfPath = (pathname: string): AdminSection | undefined =>
  ADMIN_SECTIONS.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))
