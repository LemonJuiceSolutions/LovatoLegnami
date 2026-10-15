# Messa in produzione – Lovato Legnami

Guida passo passo per pubblicare il sito dei preventivi e il back-office su **Vercel**
con **Neon Postgres**, **Vercel Blob** (foto dei clienti) e **Resend** (email).
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
5. Dal back-office: **Utenti** per creare gli altri account (commerciale, tecnico,
   visualizzatore); **Listino**, **Regole**, **Tipologie** per sostituire i segnaposto e
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

Da notare: nel wizard il CAP si chiede solo nell'ultimo passo, quindi il prezzo mostrato al
passo "Prezzo" usa la zona di trasporto di ripiego ("da verificare") ed è più alto di quello
salvato dopo l'invio con il CAP (es. 3.840 € → 3.400 € circa). Da valutare con Lovato se
chiedere il CAP prima.

La prova di ripristino del database (sezione 10) va eseguita sull'anteprima reale.
