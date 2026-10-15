import type { Metadata } from "next"

/**
 * Gruppo `(admin)` (11.5): mai indicizzato. Il layout dell'area (`admin/layout.tsx`,
 * gruppo 9) con autenticazione e navigazione sta sotto; qui solo i metadati.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return children
}
