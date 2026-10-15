/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Driver del database caricati da node_modules a runtime (non impacchettati):
    // PGlite porta un WASM e file di dati, `pg` ha dipendenze native opzionali.
    // `@react-pdf/renderer` (PDF del preventivo, runtime Node) carica font AFM e moduli
    // ESM da node_modules: impacchettato da webpack perderebbe i file dei font standard.
    serverComponentsExternalPackages: ["@electric-sql/pglite", "pg", "@react-pdf/renderer"],
  },
}

module.exports = nextConfig
