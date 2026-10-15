/**
 * Asset del kernel OCCT (P12): `public/occt/<versione>/` (vedi
 * `scripts/copy-occt-wasm.mjs`). La versione nel percorso rende sicura la cache
 * immutabile di un anno; il `.wasm` è servito come `application/wasm` (necessario a
 * `WebAssembly.instantiateStreaming`).
 */
const OCCT_CACHE = "public, max-age=31536000, immutable"

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Driver del database caricati da node_modules a runtime (non impacchettati):
    // PGlite porta un WASM e file di dati, `pg` ha dipendenze native opzionali.
    // `@react-pdf/renderer` (PDF del preventivo, runtime Node) carica font AFM e moduli
    // ESM da node_modules: impacchettato da webpack perderebbe i file dei font standard.
    serverComponentsExternalPackages: ["@electric-sql/pglite", "pg", "@react-pdf/renderer"],
  },
  async headers() {
    return [
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
