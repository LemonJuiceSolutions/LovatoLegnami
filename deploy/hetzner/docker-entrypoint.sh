#!/bin/sh
# Avvio del container lovato-app: applica le migrazioni (idempotenti) e poi esegue il
# comando (default `node server.js`). Una migrazione fallita ferma l'avvio: il container
# esce, Compose lo riavvia e il log (`docker compose logs lovato-app`) dice perché.
# RUN_MIGRATIONS=0 salta le migrazioni (es. per un comando una tantum).
set -eu
if [ "${RUN_MIGRATIONS:-1}" != "0" ] && [ "${1:-}" = "node" ] && [ "${2:-}" = "server.js" ]; then
  node tools/migrate.cjs
fi
exec "$@"
