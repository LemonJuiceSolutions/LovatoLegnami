/**
 * Asset del kernel OCCT (P12): `public/occt/<versione>/` (vedi
 * `scripts/copy-occt-wasm.mjs`). La versione nel percorso rende sicura la cache
 * immutabile di un anno; il `.wasm` è servito come `application/wasm` (necessario a
 * `WebAssembly.instantiateStreaming`).
 */
const OCCT_CACHE = "public, max-age=31536000, immutable"

/**
 * Intestazioni di sicurezza per ogni risposta: niente incorniciamento (clickjacking sul
 * back-office), niente MIME sniffing, referrer limitato all'origine verso altri siti.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Sempre definita al build (anche se assente: "0"), così la condizione di
    // `components/site/site-analytics.tsx` è costante e webpack elimina l'import di
    // `@vercel/analytics` quando le statistiche sono spente.
    NEXT_PUBLIC_ANALYTICS: process.env.NEXT_PUBLIC_ANALYTICS === "1" ? "1" : "0",
  },
  experimental: {
    // Driver del database caricati da node_modules a runtime (non impacchettati):
    // PGlite porta un WASM e file di dati, `pg` ha dipendenze native opzionali.
    // `@react-pdf/renderer` (PDF del preventivo, runtime Node) carica font AFM e moduli
    // ESM da node_modules: impacchettato da webpack perderebbe i file dei font standard.
    serverComponentsExternalPackages: ["@electric-sql/pglite", "pg", "@react-pdf/renderer"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/occt/:path*", headers: [{ key: "Cache-Control", value: OCCT_CACHE }] },
      {
        source: "/occt/:path*.wasm",
        headers: [
          { key: "Cache-Control", value: OCCT_CACHE },
          { key: "Content-Type", value: "application/wasm" },
        ],
      },
    ]
  },
}

module.exports = nextConfig
module.exports.SECURITY_HEADERS = SECURITY_HEADERS
