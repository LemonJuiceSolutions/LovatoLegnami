#!/usr/bin/env bash
# Rilascio di Lovato Legnami sull'host Hetzner condiviso, DA ESEGUIRE SUL MAC dalla radice
# del repository (docs/deploy.md, "Deploy su Hetzner"). Idempotente: si può rilanciare.
#
#   deploy/hetzner/deploy.sh              # rilascia HEAD
#   SEED=1 deploy/hetzner/deploy.sh       # … e poi esegue db:seed (idempotente)
#
# Passi: 1) invio di `git archive HEAD` in /opt/lovato; 2) .env.production (creato da
# gen-env.sh solo se manca); 3) build e avvio dello stack Compose, attesa del container
# sano; 4) Caddy: copia di sicurezza del Caddyfile, aggiunta del blocco solo se assente,
# `caddy validate` (ripristino automatico se fallisce), `systemctl reload caddy` (mai
# restart: sull'host girano altri siti); 5) controlli con curl.
# Si ferma al primo errore.
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-91.98.45.4}"
SSH_TARGET="${SSH_TARGET:-root@$DEPLOY_HOST}"
REMOTE_DIR="${REMOTE_DIR:-/opt/lovato}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
SITE_HOST="${SITE_HOST:-lovato.91-98-45-4.sslip.io}"
CONF_HOST="${CONF_HOST:-configuratore.91-98-45-4.sslip.io}"
COMPOSE="docker compose -f deploy/hetzner/docker-compose.yml --env-file deploy/hetzner/.env.production"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mERRORE: %s\033[0m\n' "$*" >&2; exit 1; }
trap 'fail "passo non riuscito (riga $LINENO): il rilascio si è fermato"' ERR

cd "$(git rev-parse --show-toplevel)"
REV="$(git rev-parse --short HEAD)"

step "0/5 Controlli locali (revisione $REV)"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Attenzione: modifiche non committate NON incluse (si invia solo HEAD $REV)."
fi
ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_TARGET" true || fail "SSH verso $SSH_TARGET non riuscito"

step "1/5 Invio dei sorgenti in $SSH_TARGET:$REMOTE_DIR"
git archive --format=tar HEAD | ssh "$SSH_TARGET" "mkdir -p '$REMOTE_DIR' && tar -x -C '$REMOTE_DIR' && echo '$REV' > '$REMOTE_DIR/REVISION'"

step "2/5 Variabili di produzione"
ssh "$SSH_TARGET" "cd '$REMOTE_DIR' && if [ -f deploy/hetzner/.env.production ]; then echo 'deploy/hetzner/.env.production presente: invariato'; else deploy/hetzner/gen-env.sh; fi && chmod 600 deploy/hetzner/.env.production"

step "3/5 Build e avvio dello stack (progetto lovato)"
ssh "$SSH_TARGET" "cd '$REMOTE_DIR' && $COMPOSE up -d --build --remove-orphans"
ssh "$SSH_TARGET" 'for i in $(seq 1 60); do
  s=$(docker inspect -f "{{.State.Health.Status}}" lovato-app 2>/dev/null || echo assente)
  echo "lovato-app: $s"
  [ "$s" = healthy ] && exit 0
  sleep 5
done
docker logs --tail 80 lovato-app; exit 1'
if [[ "${SEED:-0}" == "1" ]]; then
  step "3b/5 Seed del database (idempotente)"
  ssh "$SSH_TARGET" "cd '$REMOTE_DIR' && $COMPOSE exec -T lovato-app npm run db:seed"
fi

step "4/5 Caddy (solo aggiunta, reload senza restart)"
ssh "$SSH_TARGET" CADDYFILE="$CADDYFILE" SNIPPET="$REMOTE_DIR/deploy/hetzner/Caddyfile.snippet" 'bash -s' <<'REMOTE'
set -euo pipefail
command -v caddy >/dev/null || { echo "caddy non trovato sul server" >&2; exit 1; }
[ -f "$CADDYFILE" ] || { echo "$CADDYFILE non trovato" >&2; exit 1; }
if grep -q '>>> lovato-legnami' "$CADDYFILE"; then
  echo "Blocco lovato-legnami già presente in $CADDYFILE: nessuna modifica."
  if ! diff -q <(sed -n '/>>> lovato-legnami/,/<<< lovato-legnami/p' "$CADDYFILE") "$SNIPPET" >/dev/null; then
    echo "Nota: il blocco nel Caddyfile differisce da Caddyfile.snippet; aggiornarlo a mano (docs/deploy.md)."
  fi
  exit 0
fi
BACKUP="$CADDYFILE.bak-$(date +%Y%m%d-%H%M%S)"
cp -p "$CADDYFILE" "$BACKUP"
echo "Copia di sicurezza: $BACKUP"
{ printf '\n'; cat "$SNIPPET"; } >> "$CADDYFILE"
if ! caddy validate --config "$CADDYFILE" --adapter caddyfile; then
  cp -p "$BACKUP" "$CADDYFILE"
  echo "caddy validate fallito: ripristinato $CADDYFILE dalla copia (Caddy non è stato ricaricato)." >&2
  exit 1
fi
if ! systemctl reload caddy; then
  cp -p "$BACKUP" "$CADDYFILE"
  systemctl reload caddy || true
  echo "systemctl reload caddy fallito: ripristinato $CADDYFILE." >&2
  exit 1
fi
echo "Caddy ricaricato con i due host di Lovato."
REMOTE

step "5/5 Controlli"
check() { # descrizione, codice atteso, curl args…
  local what="$1" want="$2"; shift 2
  local got=""
  for _ in $(seq 1 12); do # il primo certificato TLS può richiedere qualche secondo
    got="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$@" || true)"
    [[ "${got%% *}" == "$want" ]] && break
    sleep 5
  done
  printf '%-48s %s\n' "$what" "$got"
  [[ "${got%% *}" == "$want" ]] || fail "$what: atteso $want, ottenuto '$got'"
}
ssh "$SSH_TARGET" "curl -fsS -o /dev/null -w 'app su 127.0.0.1:3310: %{http_code}\n' http://127.0.0.1:3310/robots.txt"
check "home https://$SITE_HOST/" 200 "https://$SITE_HOST/"
check "wizard https://$SITE_HOST/preventivo" 200 "https://$SITE_HOST/preventivo"
check "https://$CONF_HOST/ → /configuratore" 302 "https://$CONF_HOST/"
check "https://$CONF_HOST/configuratore → /accesso" 307 "https://$CONF_HOST/configuratore"
check "pagina di accesso https://$CONF_HOST/accesso" 200 "https://$CONF_HOST/accesso"

trap - ERR
step "Rilascio $REV completato"
cat <<EOF
Sito:          https://$SITE_HOST/
Configuratore: https://$CONF_HOST/
Primo accesso: ssh $SSH_TARGET "cd $REMOTE_DIR && $COMPOSE exec lovato-app npm run admin:link -- <email> https://$CONF_HOST"
EOF
