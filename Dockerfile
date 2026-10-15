# syntax=docker/dockerfile:1
#
# Immagine di produzione di Lovato Legnami (sito, back-office, API) per un host Docker
# (vedi deploy/hetzner/ e docs/deploy.md, "Deploy su Hetzner").
#
# - deps:    npm ci (con postinstall: copia il kernel OCCT in public/occt/<versione>/)
# - builder: next build in modalità standalone + comandi operativi impacchettati
#            (db:migrate, db:seed, admin:link → .next/tools/*.cjs)
# - runner:  solo server standalone, asset statici, migrazioni SQL e strumenti; utente
#            non root `node`; all'avvio applica le migrazioni e parte `node server.js`.

ARG NODE_IMAGE=node:22.20.0-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY scripts/copy-occt-wasm.mjs scripts/copy-occt-wasm.mjs
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
# URL pubblico: le pagine prerenderizzate al build (sitemap, robots, metadati OG) lo usano.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_ANALYTICS=0
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_ANALYTICS=${NEXT_PUBLIC_ANALYTICS}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && node scripts/build-tools.mjs

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/.next/tools ./tools
COPY --chown=node:node deploy/hetzner/docker-entrypoint.sh /usr/local/bin/lovato-entrypoint
# Script npm dell'immagine: gli stessi nomi dello sviluppo, ma su Node puro (niente tsx).
# `.data/uploads` (foto su disco, src/server/storage) esiste già con il proprietario giusto:
# il volume montato lì la eredita alla prima creazione.
RUN chmod 0755 /usr/local/bin/lovato-entrypoint \
 && npm pkg delete scripts \
 && npm pkg set "scripts.start=node server.js" \
                "scripts.db:migrate=node tools/migrate.cjs" \
                "scripts.db:seed=node tools/seed.cjs" \
                "scripts.admin:link=node tools/admin-link.cjs" \
 && mkdir -p /app/.data/uploads \
 && chown -R node:node /app/.data /app/package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/robots.txt').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["lovato-entrypoint"]
CMD ["node", "server.js"]
