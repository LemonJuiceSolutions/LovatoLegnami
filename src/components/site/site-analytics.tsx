"use client"

import dynamic from "next/dynamic"

/**
 * Vercel Web Analytics (P7, P12): senza cookie, solo nel layout `(site)` e solo con
 * `NEXT_PUBLIC_ANALYTICS=1`. La variabile è letta al build: con la condizione falsa
 * webpack elimina il ramo e con esso l'import, quindi il bundle non contiene
 * `@vercel/analytics` (verificato da `npm run test:bundle`).
 */
const Analytics =
  process.env.NEXT_PUBLIC_ANALYTICS === "1"
    ? dynamic(() => import("@vercel/analytics/react").then((m) => m.Analytics), { ssr: false })
    : null

export default function SiteAnalytics() {
  return Analytics ? <Analytics /> : null
}
