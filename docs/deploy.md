# Messa in produzione – Lovato Legnami

Guida passo passo per pubblicare il sito dei preventivi e il back-office su **Vercel**
con **Neon Postgres**, **Vercel Blob** (foto dei clienti) e **Resend** (email).
In alternativa, su un server proprio con Docker e Caddy: sezione
[13. Deploy su Hetzner (Docker + Caddy)](#13-deploy-su-hetzner-docker--caddy).
Riferimenti: `openspec/changes/sito-preventivi/design.md` (P12) e la spec
`hosting-e-distribuzione`.

Come è fatto il rilascio, in breve:

- Next.js 14 su Vercel, **runtime Node** per tutte le pagine e le API (database, PDF,
  email). L'unico codice edge è `src/middleware.ts`, che controlla solo la sessione.
- `vercel.json` usa come comando di build `npm run db:migrate && npm run build`: le
  migrazioni del database girano **prima** del build. Se una migrazione fallisce il build
  fallisce e il sito continua a servire la versione precedente.
- Il kernel geometrico (WASM OpenCascade, ~23 MB) è copiato al build in
  `public/occt/<versione>/` ed è servito con cache immutabile di un anno; lo scarica solo
  il configuratore interno quando serve.
- Le variabili d'ambiente sono validate all'avvio da `src/server/env.ts`: in produzione
  una variabile obbligatoria mancante blocca l'avvio con un messaggio che la nomina.
- Il **seed** (listino, regole, tipologie, preset e primo amministratore) si esegue **a mano**
  una sola volta: non è nel build.

---

## 0. Prima di iniziare

Servono:

1. Un account **Vercel** (team di Lovato o di Lemonjuice: vedi "Da confermare").
2. Accesso al repository Git (GitHub) del progetto.
3. Accesso al pannello DNS del dominio (es. `lovatolegnami.it`) per il sito e per il
   mittente delle email.
4. Sul proprio computer: Node.js 24 e il repository clonato con `npm ci` eseguito.

---

## 1. Creare il progetto su Vercel

1. Vercel → **Add New… → Project** → importare il repository.
2. **Framework Preset**: Next.js (già indicato da `vercel.json`).
3. **Build Command**: lasciare quello di `vercel.json`
   (`npm run db:migrate && npm run build`); **Install Command**: `npm ci`.
4. **Node.js Version** (Settings → General): 24.x.
5. **Non** fare ancora il primo deploy (o lasciarlo fallire): mancano database e variabili.
   Un build su Vercel senza `DATABASE_URL` si ferma apposta con
   `DATABASE_URL mancante nel build Vercel`.
6. Settings → **Deployment Protection**: attivare la protezione (Vercel Authentication)
   almeno per le **anteprime**: i branch Neon delle anteprime contengono una copia dei dati
   di produzione, compresi i dati personali dei clienti.

## 2. Database: Neon Postgres dal Marketplace

1. Nel progetto Vercel → **Storage → Create Database → Neon (Marketplace)**.
2. Regione: **Frankfurt (eu-central-1)**, la più vicina alla regione delle funzioni Vercel
   (impostare anche Settings → Functions → Region su Frankfurt, `fra1`).
3. Collegare il database al progetto per gli ambienti **Production** e **Preview**.
4. Nelle impostazioni dell'integrazione attivare **un branch Neon per ogni deployment di
   anteprima** (preview branching): ogni anteprima riceve il proprio `DATABASE_URL`,
   separato da quello di produzione, e le migrazioni del build girano sul branch.
5. Verificare in Settings → Environment Variables che `DATABASE_URL` esista per
   Production e Preview (forma `postgresql://…`). L'integrazione aggiunge anche altre
   variabili (`DATABASE_URL_UNPOOLED`, `PGHOST`, …) che l'applicazione non usa.
6. **Backup**: in Neon → Settings → **History retention** (finestra di ripristino) impostare
   **almeno 7 giorni**. Il piano gratuito ha una finestra più corta: serve un piano a
   pagamento (vedi "Da confermare").

## 3. Foto dei clienti: Vercel Blob

1. Progetto Vercel → **Storage → Create → Blob**.
2. Accesso: **Private** (le foto si leggono solo da `/api/uploads/[id]` dopo il controllo
   di accesso; mai con un collegamento pubblico).
3. Collegarlo agli ambienti Production e Preview: Vercel aggiunge `BLOB_READ_WRITE_TOKEN`.

Senza `BLOB_READ_WRITE_TOKEN` l'applicazione salverebbe le foto sul disco della funzione,
che su Vercel non è persistente: in produzione il token è di fatto necessario (all'avvio
compare un avviso nel log).

## 4. Email: Resend e dominio mittente

1. Creare l'account Resend (anche dal Marketplace Vercel: **Integrations → Resend**, che
   aggiunge `RESEND_API_KEY` al progetto) oppure su resend.com e creare una **API key**
   con permesso "Sending access".
2. Resend → **Domains → Add Domain**: usare il dominio del sito (es. `lovatolegnami.it`) o un
   sottodominio dedicato (es. `mail.lovatolegnami.it`).
3. Nel pannello DNS del dominio aggiungere **esattamente** i record mostrati da Resend:
   - **SPF**: record `TXT` (e `MX`) sul sottodominio di invio indicato
     (`v=spf1 include:amazonses.com ~all`);
   - **DKIM**: record `TXT` `resend._domainkey` con la chiave pubblica;
   - consigliato **DMARC**: `TXT` `_dmarc` con `v=DMARC1; p=none; rua=mailto:<casella>`.
   Se il dominio ha già un record SPF per un'altra posta, **non** crearne un secondo sullo
   stesso nome: Resend usa un sottodominio proprio proprio per evitarlo.
4. Attendere lo stato **Verified** in Resend.
5. `EMAIL_FROM` deve usare quel dominio, es. `Lovato Legnami <preventivi@lovatolegnami.it>`.

Senza `RESEND_API_KEY` le email non partono: in produzione il log riporta solo
destinatario e oggetto (mai il contenuto, perché il collegamento di accesso è una
credenziale). Quindi **senza Resend non si può accedere al back-office**: configurarlo
prima del primo accesso.

## 5. Variabili d'ambiente

Settings → **Environment Variables**. Elenco completo in `.env.example`; validazione in
`src/server/env.ts`. "PROD" = obbligatoria con `NODE_ENV=production` (cioè su Vercel,
anche nelle anteprime).

| Variabile | Obbligatoria | Valore / origine | Note |
|---|---|---|---|
| `DATABASE_URL` | PROD | Integrazione Neon | `postgres://` o `postgresql://`; per ambiente (anteprime: branch Neon). |
| `AUTH_SECRET` | PROD | `openssl rand -base64 32` | ≥ 32 caratteri. Valori **diversi** per Production e Preview. |
| `NEXT_PUBLIC_SITE_URL` | PROD | `https://www.lovatolegnami.it` | Senza barra finale; link nelle email, sitemap, Open Graph. Per Preview si può lasciare l'URL di produzione o un URL di anteprima fisso. |
| `EMAIL_FROM` | PROD | `Lovato Legnami <preventivi@lovatolegnami.it>` | Dominio verificato su Resend. |
| `OFFICE_EMAIL` | PROD | casella dell'ufficio | Riceve le notifiche delle nuove richieste. |
| `RESEND_API_KEY` | di fatto sì | Resend | Assente ⇒ nessuna email inviata (avviso all'avvio) e nessun accesso al back-office. |
| `BLOB_READ_WRITE_TOKEN` | consigliata | Integrazione Blob | Assente ⇒ foto su disco non persistente (avviso). |
| `ADMIN_EMAIL` | solo per il seed | email del primo admin | Letta da `npm run db:seed`, non dal sito. |
| `NEXT_PUBLIC_ANALYTICS` | no | `1` o `0` | `1` = Vercel Web Analytics (senza cookie) sul sito pubblico. È letta **al build**: dopo una modifica serve un nuovo deploy. Attivare anche Analytics nel progetto Vercel. |
| `RATE_LIMIT_SUBMIT` | no | `5/600` | Invii per IP, forma `N/secondi` (default 5 ogni 10 minuti). |
| `RATE_LIMIT_ESTIMATE` | no | `60/60` | Stime del prezzo per IP (default 60 al minuto). In memoria per istanza: limite "best effort". |
| `SITE_COMPANY_PHONE`, `SITE_COMPANY_EMAIL`, `SITE_COMPANY_STREET` | no | recapiti | Sovrascrivono i recapiti mostrati dal sito. |
| `OLLAMA_API_BASE`, `CLAUDE_PATH`, `GROQ_API_KEY` | no | — | Assistente AI interno esistente; non servono al sito. |

`AUTH_URL` non serve su Vercel (Auth.js usa l'host della richiesta); impostarla solo se il
back-office deve rispondere da un dominio diverso da quello della richiesta.

## 6. Primo rilascio

1. Con database, Blob, Resend e variabili configurati: Deployments → **Redeploy** (o un
   push sul branch principale).
2. Nel log del build controllare:
   - `[db:migrate] migrazioni applicate su Postgres (DATABASE_URL)`;
   - `[copy-occt-wasm] … → public/occt/<versione>/`;
   - la tabella delle pagine di `next build`.
3. **Seed** (una sola volta, dal proprio computer, con il `DATABASE_URL` di
   **produzione** copiato da Vercel → Settings → Environment Variables o dalla console Neon):

   ```bash
   DATABASE_URL="postgresql://…produzione…" ADMIN_EMAIL="nome@lovatolegnami.it" npm run db:seed
   ```

   Il comando è idempotente: crea la versione 1 di listino, regole, tipologie e preset
   (valori segnaposto **DA VALIDARE**) e l'utente admin; rieseguito non modifica nulla.
   Le pagine del sito generate durante il primo build (database ancora vuoto) mostrano
   "Prezzo su richiesta": si aggiornano da sole entro 5 minuti dal seed, oppure subito
   con un **Redeploy** o con la prima pubblicazione dal back-office.
   Per un'anteprima già creata si può fare lo stesso con il `DATABASE_URL` del suo branch.
   Il comando può anche applicare le migrazioni a mano sullo stesso database:

   ```bash
   DATABASE_URL="postgresql://…" npm run db:migrate
   ```

4. **Primo accesso admin**: aprire `https://<dominio>/accesso`, inserire `ADMIN_EMAIL`,
   aprire il collegamento ricevuto via email (valido pochi minuti, monouso). Se l'email
   non arriva: Resend → **Emails** (stato dell'invio) e Vercel → **Logs** (errori).
5. Dal back-office: **Utenti** per creare gli altri account (ruoli `admin`,
   `ufficio-tecnico`, `commerciale`); **Listino**, **Regole**, **Tipologie** per sostituire i segnaposto e
   **pubblicare** (la pubblicazione aggiorna il sito in pochi secondi).
6. Prova completa: richiesta di preventivo dal sito con una foto → email all'ufficio e al
   cliente → richiesta nel back-office → PDF.

## 7. Dominio personalizzato

1. Vercel → Settings → **Domains** → aggiungere `www.lovatolegnami.it` (e il dominio
   nudo `lovatolegnami.it` con reindirizzamento a `www`, o viceversa).
2. Nel DNS: record indicati da Vercel (tipicamente `A` per il dominio nudo e `CNAME`
   `cname.vercel-dns.com` per `www`). Il certificato HTTPS è automatico.
3. Aggiornare `NEXT_PUBLIC_SITE_URL` (Production) con il dominio definitivo e fare un
   **Redeploy** (la variabile entra nella sitemap e nei metadati al build).
4. Se il vecchio sito `lovatosrl.it` resta attivo, decidere i reindirizzamenti (vedi
   "Da confermare").

## 8. Anteprime e controlli prima della promozione

Ogni pull request crea un deployment di anteprima con il proprio branch Neon. Prima di
promuovere in produzione, sull'anteprima:

- [ ] Lighthouse (Chrome DevTools, modalità navigazione, profilo mobile) sulla home:
      **Prestazioni ≥ 90** e **Accessibilità ≥ 90**; ripetere su una pagina tipologia.
- [ ] axe DevTools (o Lighthouse → Accessibilità) su home, tipologia, wizard e pagina
      di conferma: nessuna violazione "serious" o "critical".
- [ ] Stima del prezzo nel wizard: nella scheda Network la chiamata
      `POST /api/preventivo/stima` risponde in **meno di 500 ms** (dopo il primo avvio).
- [ ] `https://<anteprima>/occt/<versione>/replicad_single.wasm` risponde con
      `Cache-Control: public, max-age=31536000, immutable` e `Content-Type: application/wasm`.
- [ ] Una richiesta di prova arriva all'ufficio e il PDF si apre.

La CI (`.github/workflows/ci.yml`) esegue a ogni push e pull request `npm ci`,
`npm run lint`, `npm test`, `npm run test:db`, `npm run build`, `npm run test:bundle` e, in
un job separato, `npm run test:geometry`. In locale la stessa sequenza è:

```bash
npm ci
npm run lint
npm test
npm run test:db
npm run test:geometry
npm run build
npm run test:bundle
```

## 9. Rollback dell'applicazione

- Vercel → **Deployments** → scegliere l'ultimo deployment funzionante → **Instant
  Rollback** (o "Promote to Production"). Il cambio è immediato e non ricompila.
- Le migrazioni sono **solo additive** (nuove tabelle/colonne, mai rimozioni o rinomine
  nello stesso rilascio): la versione precedente del codice funziona sul database già
  migrato, quindi il rollback non richiede di toccare il database.
- Una modifica distruttiva dello schema va divisa in due rilasci: prima il codice che non
  usa più la colonna, poi (dopo almeno un rilascio stabile) la migrazione che la rimuove.
- Errore nei **dati** (listino pubblicato sbagliato): dal back-office correggere la bozza
  riportando i valori precedenti (ogni versione pubblicata resta nel database e le
  modifiche sono nel **Registro**) e pubblicare di nuovo; non serve il rollback del codice.
  I preventivi già emessi restano legati alla versione con cui sono stati calcolati.

## 10. Backup e ripristino del database

- Neon conserva lo storico (point-in-time restore) per la finestra impostata al punto 2
  (≥ 7 giorni).
- Le foto in Vercel Blob **non** sono coperte dal backup del database; per l'MVP si
  accetta il rischio (le foto sono di supporto al sopralluogo). Vedi "Da confermare".

**Procedura di ripristino** (da provare almeno una volta su un'anteprima, spec
`hosting-e-distribuzione` "Backup e ripristino"):

1. Annotare l'istante a cui tornare (es. prima di un'importazione errata).
2. Console Neon → progetto → **Branches** → **Create branch** → "From a point in time"
   del branch principale, all'istante scelto. Nome es. `ripristino-2026-10-15`.
3. Verificare il branch: Neon → SQL Editor sul nuovo branch, es.
   `select dataset, version, status from dataset_versions order by created_at desc limit 10;`
   e `select count(*) from leads;` → devono comparire listini e richieste del punto di
   ripristino.
4. **Prova su anteprima**: in Vercel impostare per un branch Git di prova (Settings →
   Environment Variables → Preview, "Git branch") `DATABASE_URL` = stringa di connessione
   del branch ripristinato, fare un deploy di quel branch e controllare back-office e sito.
5. **Ripristino reale**: in Neon usare **Restore** sul branch principale allo stesso
   istante (Neon conserva automaticamente un branch di backup dello stato precedente),
   oppure impostare `DATABASE_URL` di Production sul branch ripristinato e fare
   **Redeploy**. Le richieste arrivate dopo l'istante di ripristino vanno recuperate dal
   branch di backup.
6. Annotare data, istante e risultato della prova in fondo a questo documento.

## 11. Da confermare (checklist del titolare)

- [ ] **Account Vercel**: team di Lovato Legnami o di Lemonjuice; piano (Hobby non è
      ammesso per uso commerciale: serve **Pro**).
- [ ] **Dominio**: `lovatolegnami.it` / `www.lovatolegnami.it` o sottodominio
      (es. `preventivi.lovatolegnami.it`); destino del sito attuale `lovatosrl.it` e
      reindirizzamenti.
- [ ] **Neon**: piano con finestra di ripristino ≥ 7 giorni; regione Frankfurt.
- [ ] **Resend**: account e dominio mittente; indirizzo `EMAIL_FROM`; casella
      `OFFICE_EMAIL` dell'ufficio.
- [ ] **Vercel Blob** privato per le foto (alternative: S3/R2) e se serve un backup delle
      foto.
- [ ] **Autenticazione**: magic link via email confermato, oppure password / Google
      Workspace.
- [ ] **Analytics**: attivare Vercel Web Analytics (`NEXT_PUBLIC_ANALYTICS=1`) sì/no.
- [ ] **Listino reale**: legno, lavorazioni, ferramenta, trattamenti, coperture, tariffe e
      tempi di montaggio, complicazioni, zone di trasporto, margini, minimo d'ordine,
      fascia di indicatività, aliquote, lunghezze commerciali; oggi tutto è segnaposto
      `DA VALIDARE` dal seed.
- [ ] **Testo dell'informativa privacy** (`/privacy`) e del consenso nel wizard: da far
      validare (titolare del trattamento, tempi di conservazione, responsabili esterni:
      Vercel, Neon, Resend). Un cambio di testo richiede di aggiornare la versione
      dell'informativa (`PRIVACY_NOTICE_VERSION` in `src/server/consent.ts`).
- [ ] **Indirizzo**: il sito attuale riporta sia "Via Antonio Meucci **2**" sia "**4**";
      oggi è usato il 4 (`src/components/site/company.ts`, sovrascrivibile con
      `SITE_COMPANY_STREET`).
- [ ] **Logo ufficiale in SVG**, colori e fotografie reali dei lavori (oggi segnaposto
      generati).
- [ ] **CNC**: validare con il software della macchina un file SAT esportato dal
      configuratore (unità in millimetri, orientamento dei pezzi, nomi) prima dell'uso in
      produzione.
- [ ] **Rate limit**: in memoria per istanza; valutare un archivio condiviso (es. Upstash
      Redis dal Marketplace) se arrivano abusi.

## 12. Esiti della verifica finale (task 14.2)

Verifica del 15/10/2026 su `next build` + `next start` in locale (porta 3135) con PGlite.
In locale `next start` è stato avviato con `NODE_ENV=development`, perché in produzione
`src/server/env.ts` esige `DATABASE_URL` (Postgres) e PGlite non è ammesso; per lo stesso
motivo il build locale genera le pagine senza prezzi e la cache dei dati del build
(`.next/cache/fetch-cache`) è stata svuotata prima dell'avvio. Su Vercel, con
`DATABASE_URL`, nessuno dei due accorgimenti serve. Browser: Chromium headless
(Playwright) a 1440 px (tema chiaro) e 390 px (tema scuro).

| Controllo | Esito |
|---|---|
| Home, elenco tipologie, scheda tipologia, galleria, contatti a 390 e 1440 px | OK, nessuno scroll orizzontale; prezzi "da …" presenti |
| Wizard monofalda con muro fuori squadra (548/534 cm) e grondaia a 270 cm, accesso medio | OK: nota "Abbiamo ridotto la profondità a 2,3 m per passare sotto la grondaia", "Muro fuori squadra di circa 2°", prezzo in circa 0,8 s, invio con foto, pagina di conferma, PDF dal token, pagina `/p/[token]` senza contatti |
| Wizard bifalda a 390 px | OK; nota "lavoro in quota oltre 3,5 m" (prima: "3516,4 mm", corretto) |
| Accesso admin con il collegamento nel log del server | OK |
| Richiesta nell'admin con foto, "Apri nel configuratore" | OK: pianta e 3D caricati, pannello preventivo |
| Export SAT dal configuratore e "Verifica file" | OK: "Struttura SAT valida", SAT 7.0, 20 body, 2719 entità |
| Preventivo definitivo con voce manuale, stato "preventivo inviato", email al cliente | OK (email con PDF nell'outbox) |
| Modifica del listino (manodopera +20%), simulatore, dialogo di pubblicazione con differenze | OK |
| "A partire da" sul sito dopo la pubblicazione | OK dopo la correzione (prima restava il prezzo vecchio fino a 6 minuti) |
| Lighthouse home, mobile | Prestazioni 89 alla prima esecuzione a freddo, 94 nelle successive; Accessibilità, Best practice, SEO 100 |
| Lighthouse home, desktop | 100 / 100 / 100 / 100 |
| Intestazioni `/occt/1.1.0/replicad_single.wasm` | `Cache-Control: public, max-age=31536000, immutable`, `Content-Type: application/wasm` |

Da notare (risolto dopo la verifica): il CAP si chiedeva solo nell'ultimo passo, quindi il
prezzo del passo "Prezzo" usava la zona di trasporto di ripiego ed era più alto di quello
salvato con il CAP (es. 3.840 € → 3.400 € circa). Ora il CAP del cantiere si chiede al
passo 3 "Spazio" e il passo contatti lo ritrova compilato.

La prova di ripristino del database (sezione 10) va eseguita sull'anteprima reale.

## 13. Deploy su Hetzner (Docker + Caddy)

Alternativa a Vercel: tutto lo stack (app Next.js + Postgres 16) in Docker su un server
Hetzner **condiviso** (Ubuntu, Docker con Compose v5, Caddy di sistema già attivo su
:80/:443 per altri siti). File in `deploy/hetzner/` e `Dockerfile` alla radice.

Indirizzi del primo rilascio (DNS gratuito di sslip.io, nessun dominio da configurare):

- sito pubblico: `https://lovato.91-98-45-4.sslip.io`
- configuratore e back-office: `https://configuratore.91-98-45-4.sslip.io` (la radice `/`
  reindirizza con 302 a `/configuratore`)

### 13.1 Come è fatto

| Parte | Dettaglio |
|---|---|
| `Dockerfile` | multi-stage su `node:22.20.0-bookworm-slim`; `next build` con `NEXT_OUTPUT=standalone` (solo nel container: su Vercel il build resta quello di sempre); kernel OCCT copiato in `public/occt/<versione>/`; `db:migrate`, `db:seed`, `admin:link` impacchettati in `tools/*.cjs` (Node puro, senza `tsx`); utente non root `node`; healthcheck su `/robots.txt` |
| Avvio del container | `deploy/hetzner/docker-entrypoint.sh`: applica le migrazioni (idempotenti) e poi `node server.js`. Una migrazione fallita ferma l'avvio (il log lo dice) |
| `lovato-app` | porta **solo** `127.0.0.1:3310` → 3000; limite 2 GB; `restart: unless-stopped`; log `json-file` ruotati (5 × 10 MB); volume `lovato-uploads` su `/app/.data/uploads` (foto su disco, senza Vercel Blob) |
| `lovato-db` | `postgres:16.10-bookworm`; nessuna porta pubblicata, solo rete interna `lovato-internal` (senza uscita); limite 512 MB; volume `lovato-db-data`; healthcheck `pg_isready` (l'app parte solo con il database sano) |
| Email | senza `RESEND_API_KEY`: adattatore console, nel log del container compaiono solo destinatario e oggetto. Per entrare nel back-office si usa `admin:link` (13.4) |
| Accesso su due host | `AUTH_TRUST_HOST=true` e **nessun** `AUTH_URL`: Auth.js prende l'host da `X-Forwarded-Host`/`X-Forwarded-Proto` di Caddy. La route `/api/auth/*` ricostruisce l'URL pubblico (`src/server/auth/forwarded-origin.ts`), perché in modalità standalone Next 14 darebbe `http://0.0.0.0:3000` |

**Host condiviso**: lo stack non tocca gli altri servizi. L'app ascolta solo su
127.0.0.1 (raggiungibile solo da Caddy), il database non ha porte, rete e volumi hanno nomi
propri (`lovato-*`), i limiti di memoria proteggono gli altri container, e il Caddyfile di
sistema viene solo **esteso** (blocco aggiunto in fondo, mai riscritto) e **ricaricato**
(`systemctl reload caddy`, mai `restart`).

### 13.2 Prerequisiti

1. Sul Mac: accesso SSH con chiave a `root@91.98.45.4` (`ssh root@91.98.45.4 true` deve
   funzionare senza password), il repository con il commit da rilasciare.
2. Sul server: Docker con `docker compose` (v2+, sul server v5), Caddy installato come
   servizio systemd con il Caddyfile in `/etc/caddy/Caddyfile`, `openssl`, `curl`.
3. Porte 80/443 già servite da Caddy (i certificati per i due host sslip.io li ottiene
   Caddy da solo al primo accesso). La porta 3310 libera su 127.0.0.1.
4. Circa 3 GB liberi su disco per il build dell'immagine (l'immagine finale è ~470 MB).

### 13.3 Primo rilascio

Dal Mac, nella radice del repository:

```bash
SEED=1 deploy/hetzner/deploy.sh
```

Lo script stampa ogni passo e si ferma al primo errore:

1. `git archive HEAD | ssh root@91.98.45.4 "mkdir -p /opt/lovato && tar -x -C /opt/lovato"`
   (solo il commit corrente: le modifiche non committate non partono);
2. se manca, crea `/opt/lovato/deploy/hetzner/.env.production` con `gen-env.sh` (segreti
   casuali generati **sul server**, permessi 600; mai nel repository);
3. `docker compose -f deploy/hetzner/docker-compose.yml --env-file deploy/hetzner/.env.production up -d --build`
   e attesa dello stato `healthy`; con `SEED=1` anche `npm run db:seed` (idempotente);
4. Caddy: copia `/etc/caddy/Caddyfile.bak-AAAAMMGG-hhmmss`, aggiunge
   `deploy/hetzner/Caddyfile.snippet` solo se il blocco `lovato-legnami` non c'è già,
   `caddy validate` (se fallisce ripristina la copia e si ferma), `systemctl reload caddy`;
5. controlli con curl: home e `/preventivo` (200), `configuratore…/` → `/configuratore`
   (302), `/configuratore` senza sessione → `/accesso` (307), `/accesso` (200).

Gli stessi passi a mano, sul server (`ssh root@91.98.45.4`):

```bash
cd /opt/lovato
deploy/hetzner/gen-env.sh                     # una volta sola
docker compose -f deploy/hetzner/docker-compose.yml --env-file deploy/hetzner/.env.production up -d --build
docker compose -f deploy/hetzner/docker-compose.yml --env-file deploy/hetzner/.env.production exec \
  -e ADMIN_EMAIL=tonslemonjuice@gmail.com lovato-app npm run db:seed
cp -p /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date +%Y%m%d-%H%M%S)
grep -q '>>> lovato-legnami' /etc/caddy/Caddyfile || { echo; cat deploy/hetzner/Caddyfile.snippet; } >> /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy
```

Per brevità, negli esempi seguenti (sul server, in `/opt/lovato`):

```bash
alias dc='docker compose -f deploy/hetzner/docker-compose.yml --env-file deploy/hetzner/.env.production'
```

Il **seed** (listino, regole, tipologie, preset, primo amministratore) è idempotente: non
tocca dataset già presenti né l'admin esistente. `ADMIN_EMAIL` è già in `.env.production`
(`tonslemonjuice@gmail.com`); `-e ADMIN_EMAIL=…` la sostituisce per un altro indirizzo.

Nota: le pagine pubbliche generate al build non hanno i prezzi (al build il database non è
raggiungibile); passati 5 minuti dal build la prima visita le rigenera con i dati del
database (`revalidate = 300`; provato in locale: "Prezzo su richiesta" → prezzi "da …"). Se il seed è stato eseguito dopo che qualcuno aveva già visitato il
sito, i prezzi "a partire da" compaiono entro 5 minuti (o subito con
`dc up -d --force-recreate lovato-app`).

### 13.4 Primo accesso al back-office (senza email)

Senza Resend il collegamento di accesso non arriva per email. Lo genera l'operatore sul
server, per un utente **esistente e attivo**:

```bash
dc exec lovato-app npm run admin:link -- tonslemonjuice@gmail.com https://configuratore.91-98-45-4.sslip.io
```

Stampa un URL `https://configuratore.91-98-45-4.sslip.io/api/auth/callback/resend?…`
valido **15 minuti** e **una sola volta** (token salvato in `verification_tokens` come
quelli di Auth.js; il terzo argomento facoltativo è la pagina di arrivo, default `/admin`).
Aprirlo nel browser; da lì si creano gli altri utenti. Il comando non ha una route HTTP:
serve l'accesso SSH al server. Funziona su entrambi gli host (usare l'URL di base
dell'host su cui si vuole la sessione: il cookie vale per quell'host).

### 13.5 Aggiornamento

Dal Mac, dopo il commit: `deploy/hetzner/deploy.sh` (stessi passi; `.env.production` e il
blocco Caddy restano invariati, le migrazioni girano all'avvio del nuovo container). Il
vecchio container resta attivo durante il build; la sostituzione richiede pochi secondi.

### 13.6 Log e stato

```bash
dc ps                              # stato e healthcheck
dc logs -f --tail 200 lovato-app   # applicazione (email "non inviate" incluse)
dc logs --tail 100 lovato-db
docker stats --no-stream lovato-app lovato-db
journalctl -u caddy --since "1 hour ago"
```

### 13.7 Backup e ripristino

Database (formato custom di `pg_dump`):

```bash
mkdir -p /root/backup-lovato
dc exec -T lovato-db pg_dump -U lovato -d lovato -Fc > /root/backup-lovato/lovato-$(date +%Y%m%d-%H%M).dump
```

Ripristino (sovrascrive i dati; prima fermare l'app):

```bash
dc stop lovato-app
dc exec -T lovato-db pg_restore -U lovato -d lovato --clean --if-exists --no-owner < /root/backup-lovato/lovato-AAAAMMGG-hhmm.dump
dc start lovato-app
```

Foto dei clienti (volume `lovato-uploads`):

```bash
docker run --rm -v lovato-uploads:/data:ro -v /root/backup-lovato:/backup debian:bookworm-slim \
  tar czf /backup/uploads-$(date +%Y%m%d-%H%M).tgz -C /data .
# ripristino
docker run --rm -v lovato-uploads:/data -v /root/backup-lovato:/backup debian:bookworm-slim \
  tar xzf /backup/uploads-AAAAMMGG-hhmm.tgz -C /data
```

Per un backup giornaliero, le due righe di backup in un cron di root (es. alle 3:15) e una
copia fuori dal server (es. Storage Box Hetzner). `pg_dump` è stato provato in locale con
un ripristino completo. **Non** usare `dc down -v`: cancella i volumi (database e foto).

### 13.8 Rollback

Il rilascio è un commit: per tornare indietro si rilascia il commit precedente.

```bash
git switch --detach <commit-buono> && deploy/hetzner/deploy.sh && git switch -
```

Le migrazioni del database sono solo in avanti: se il rilascio da annullare ne conteneva una
non compatibile con il codice precedente, ripristinare anche il backup del database fatto
prima del rilascio (13.7). Per togliere del tutto Lovato da Caddy: ripristinare la copia
`/etc/caddy/Caddyfile.bak-…` (o cancellare il blocco tra `>>> lovato-legnami` e
`<<< lovato-legnami`), `caddy validate` e `systemctl reload caddy`; poi `dc down` (senza
`-v`, i dati restano).

### 13.9 Passaggio a un dominio vero

1. DNS: record `A` (e `AAAA` se c'è IPv6) di `www.lovatolegnami.it` e
   `configuratore.lovatolegnami.it` (nomi da decidere) verso `91.98.45.4`.
2. Caddyfile: nel blocco `lovato-legnami` sostituire i due nomi sslip.io (si possono anche
   elencare entrambi, separati da virgola, durante il passaggio); `caddy validate` e
   `systemctl reload caddy`.
3. `.env.production`: `NEXT_PUBLIC_SITE_URL=https://www.lovatolegnami.it`, e con Resend
   attivo `RESEND_API_KEY`, `EMAIL_FROM` sul dominio verificato (sezione 4) e
   `OFFICE_EMAIL` reale.
4. `deploy/hetzner/deploy.sh` (ricostruisce l'immagine: `NEXT_PUBLIC_SITE_URL` entra anche
   nelle pagine generate al build). Aggiornare `SITE_HOST`/`CONF_HOST` dei controlli:
   `SITE_HOST=www.lovatolegnami.it CONF_HOST=configuratore.lovatolegnami.it deploy/hetzner/deploy.sh`.
5. Le sessioni esistenti valgono per il vecchio host: si rientra con il collegamento.

### 13.10 Verifica locale dello stack (15/10/2026)

Su Docker Desktop (Mac), stack completo su 127.0.0.1:3310 con `.env.production` di prova:
build dell'immagine riuscito (466 MB); migrazioni all'avvio; `db:seed` due volte (la
seconda non crea nulla); home, `/preventivo`, stima del prezzo (`POST /api/preventivo/stima`),
invio di una richiesta con foto (file nel volume) e PDF del cliente; `/configuratore` senza
sessione → `/accesso`; collegamento di `admin:link` → sessione admin su `/admin`, richiesta
visibile nel back-office, secondo uso del collegamento rifiutato (`error=Verification`).
Gli stessi controlli dietro un Caddy locale con il blocco di `Caddyfile.snippet` (host
`*.localhost`) su entrambi gli host, compreso il 302 da `/` a `/configuratore`;
`caddy validate` del blocco con i nomi sslip.io riuscito. Memoria a riposo: app ~105 MB,
database ~30 MB. Ripristino `pg_restore` provato.
