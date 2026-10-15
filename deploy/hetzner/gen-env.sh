#!/usr/bin/env bash
# Crea deploy/hetzner/.env.production con segreti casuali (openssl), permessi 600.
# Da eseguire SUL SERVER, una volta: i segreti non lasciano mai la macchina.
#
#   deploy/hetzner/gen-env.sh            # crea il file (si rifiuta se esiste già)
#   deploy/hetzner/gen-env.sh --force    # lo rigenera (copia di sicurezza del precedente)
#
# Variabili facoltative: SITE_URL (default https://lovato.91-98-45-4.sslip.io),
# ADMIN_EMAIL (default tonslemonjuice@gmail.com).
# ATTENZIONE: con --force la nuova POSTGRES_PASSWORD non vale per un database già
# inizializzato (il volume lovato-db-data conserva la vecchia): vedi docs/deploy.md.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$DIR/.env.production"
SITE_URL="${SITE_URL:-https://lovato.91-98-45-4.sslip.io}"
ADMIN_EMAIL="${ADMIN_EMAIL:-tonslemonjuice@gmail.com}"
HOST="${SITE_URL#https://}"; HOST="${HOST#http://}"; HOST="${HOST%%/*}"; HOST="${HOST%%:*}"

command -v openssl >/dev/null || { echo "openssl non trovato" >&2; exit 1; }

if [[ -e "$OUT" ]]; then
  if [[ "${1:-}" != "--force" ]]; then
    echo "$OUT esiste già: non lo tocco (usa --force per rigenerarlo)." >&2
    exit 1
  fi
  cp -p "$OUT" "$OUT.bak-$(date +%Y%m%d-%H%M%S)"
fi

AUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
DB_PASSWORD="$(openssl rand -hex 24)"

umask 077
cat > "$OUT" <<ENV
# Generato da deploy/hetzner/gen-env.sh il $(date -u +%Y-%m-%dT%H:%M:%SZ). Non versionare.
NEXT_PUBLIC_SITE_URL=$SITE_URL
AUTH_SECRET=$AUTH_SECRET
AUTH_TRUST_HOST=true

POSTGRES_USER=lovato
POSTGRES_DB=lovato
POSTGRES_PASSWORD=$DB_PASSWORD
DATABASE_URL=postgres://lovato:$DB_PASSWORD@lovato-db:5432/lovato

RESEND_API_KEY=
EMAIL_FROM="Lovato Legnami <preventivi@$HOST>"
OFFICE_EMAIL=ufficio@$HOST

BLOB_READ_WRITE_TOKEN=

ADMIN_EMAIL=$ADMIN_EMAIL
NEXT_PUBLIC_ANALYTICS=0
RATE_LIMIT_SUBMIT=
RATE_LIMIT_ESTIMATE=
ENV
chmod 600 "$OUT"
echo "Creato $OUT (permessi 600)."
