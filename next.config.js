/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Driver del database caricati da node_modules a runtime (non impacchettati):
    // PGlite porta un WASM e file di dati, `pg` ha dipendenze native opzionali.
    serverComponentsExternalPackages: ["@electric-sql/pglite", "pg"],
  },
}

module.exports = nextConfig
