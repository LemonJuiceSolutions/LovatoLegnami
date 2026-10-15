# Note di implementazione – gruppi 13 (hosting) e 14 (integrazione e verifica finale)

File separato da `design.md` come per i gruppi 9–12; da riportare nella sezione "Note di implementazione" all'unione.

## 13. Hosting e distribuzione

- **13.1 WASM versionato**: `scripts/copy-occt-wasm.mjs` copia in `public/occt/<versione>/` (versione da
  `replicad-opencascadejs/package.json`, oggi `1.1.0`) e rimuove le altre cartelle e i file della vecchia
  disposizione. `src/geometry/occt/init.ts` esporta `OCCT_VERSION` (import di `replicad-opencascadejs/package.json`,
  esportato dal pacchetto) e `DEFAULT_ASSET_BASE = /occt/<versione>/`. `next.config.js` `headers()`: `/occt/:path*`
  con `Cache-Control: public, max-age=31536000, immutable`, `/occt/:path*.wasm` anche con `application/wasm`.
  Test `src/geometry/kernel-asset-path.geometry.test.ts`: il kernel si inizializza con `browserOcctFactory` dalla
  cartella versionata (verificato che fallisce con un percorso sbagliato). Intestazioni verificate con `next start`.
- **13.2**: `vercel.json` (`framework: nextjs`, `installCommand: npm ci`, `buildCommand: npm run db:migrate && npm
  run build`). Le route PDF/invio avevano già `runtime = "nodejs"` e `maxDuration = 30`. Test
  `src/test/runtime.test.ts`: nessun `route`/`page`/`layout` dichiara `edge`; le route dinamiche (escluse quelle
  `force-static`, es. `og.png`, e l'assistente AI) dichiarano Node; il middleware non importa il database.
  **Aggiunta**: `src/db/migrate-target.ts` – `db:migrate` con `VERCEL` impostata e senza `DATABASE_URL` fallisce
  (prima avrebbe migrato un PGlite usa e getta sulla macchina di build e il rilascio sarebbe proseguito).
- **13.3**: `docs/deploy.md` (provisioning Vercel, Neon dal Marketplace con branch per anteprima, Blob privato,
  Resend con SPF/DKIM/DMARC, tabella delle variabili, primo rilascio e seed manuale, dominio, controlli
  sull'anteprima, rollback, backup e ripristino, "Da confermare", esiti di 14.2). Test `src/test/docs.test.ts`: gli
  `npm run …` di `docs/deploy.md` e `README.md` esistono in `package.json`, i file citati esistono, tutte le
  variabili dello schema di `env.ts` sono nella guida.
  Correzioni emerse dopo: in produzione il mittente "console" non stampa il collegamento di accesso, quindi **senza
  `RESEND_API_KEY` non si accede al back-office**; le pagine generate dal primo build (database vuoto) mostrano i
  prezzi entro 5 minuti dal seed.
- **13.4**: `.github/workflows/ci.yml` (Node 24; job `verifica`: `npm ci`, lint, test, test:db, build, test:bundle;
  job `geometria`: test:geometry), scritto e non eseguito in remoto; sequenza eseguita in locale (senza `npm ci`).
  Analytics: `src/components/site/site-analytics.tsx` (client) monta `<Analytics />` di `@vercel/analytics/react`
  con `next/dynamic` solo se `process.env.NEXT_PUBLIC_ANALYTICS === "1"`; il layout `(site)` lo include sempre.
  **Insidia**: una `NEXT_PUBLIC_*` assente non è sostituita da Next, quindi la condizione non era costante e il chunk
  delle statistiche finiva comunque nel build. `next.config.js` `env` definisce sempre `NEXT_PUBLIC_ANALYTICS`
  (`"1"` o `"0"`). Test in `bundle.test.ts`: senza la variabile nessun chunk contiene `_vercel/insights`/
  `@vercel/analytics` (verificato anche il contrario con un build a `1`).

## 14. Integrazione e verifica finale

- **14.1**: `src/server/__tests__/flusso-richiesta.db.test.ts` (seed → stima → invio con foto → outbox → presa in
  carico → apertura nel configuratore → definitivo con voce manuale e invio → PDF → riepilogo e PDF dal token → foto
  negate senza sessione/token, consentite col token). `npm run test:db` ≈ 14 s.
- **14.2** (Playwright headless, script nello scratchpad; esiti in `docs/deploy.md` §12): build + `next start` con
  `NODE_ENV=development` (in produzione `env.ts` esige `DATABASE_URL`, niente PGlite) e cache dati del build
  svuotata (il build locale gira senza database e genera i contenuti senza prezzi). Lighthouse home: mobile 89 a
  freddo / 94, desktop 100; accessibilità 100.
- **14.3**: lint, test (1274), test:db (117), test:geometry (64), build, test:bundle (7) verdi. README aggiornato
  (sezioni "Sito pubblico e wizard", "Back-office", "Preventivazione", "Database e ambienti", struttura, limiti).

## Bug trovati e corretti

- **Note per il cliente con misure grezze** ("lavoro in quota 3516,4 mm"): l'etichetta della riga di complicazione
  finisce nella nota "Il prezzo comprende le lavorazioni di cantiere per: …". Ora `friendlyCondition` in
  `phases/complications.ts` usa la soglia della regola in unità comode ("oltre 3,5 m", "da 10 cm", "oltre 3°") o il
  valore dichiarato ("accesso al cantiere medio"); niente per conteggi e soglie a zero. Il valore esatto resta nella
  spiegazione (vista ufficio). Fixture golden aggiornate. Altre note del cliente (wizard, PDF, `/p/`) già in m/cm.
- **"A partire da" non aggiornato dopo la pubblicazione**: Next carica `server/quotes/catalog.ts` in più grafi di
  moduli (RSC, route handler, server action); `invalidatePublicCatalog()` della server action non svuotava la cache
  usata dalle pagine, che ricalcolavano il sito con il catalogo vecchio (TTL 60 s) e lo rimettevano in
  `unstable_cache` per 300 s. Ora lo stato della cache è su `globalThis` (`Symbol.for("lovato.publicCatalog")`,
  con un contatore di generazione per scartare letture iniziate prima dell'invalidazione) e `loadSiteContent` /
  `loadWizardData` leggono il catalogo fresco (`loadPublicCatalog`), già protetti da `unstable_cache`: vale anche fra
  istanze serverless. Test `src/server/quotes/catalog-cache.db.test.ts` (falliva senza la correzione).
  Nota: anche `rate-limit.ts` ha stato di modulo, ma ogni rotta usa il proprio grafo e le chiavi sono per rotta.

## Revisione di sicurezza (14.3)

Controllati: server action (tutte con `requireUser` e permesso, schemi zod; `contact` e `requestSignIn` pubbliche),
route admin (`withUser`), route pubbliche (rate limit, limiti del corpo, schemi strict, nessun campo interno:
`blacklistedKeys`), `/api/uploads` (sessione o token della stessa richiesta, CSP sandbox, nosniff), `/api/immagini`
(solo prefisso `sito/`), `/p/[token]` (noindex, no-referrer, niente contatti), route AI (`denyUnlessAllowed`), HTML
grezzo (SVG con etichetta escapata, JSON-LD escapato). Correzioni:
- `requestSignIn` senza limiti (inondazione di email verso un utente interno): 5 ogni 10 minuti per IP e per
  indirizzo. Nei file `"use server"` si possono esportare solo funzioni async (il messaggio resta interno).
- Intestazioni globali in `next.config.js`: `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`. Test `src/test/next-config.test.ts`.

## Osservazioni per il titolare

- Il wizard chiede il CAP all'ultimo passo: il prezzo del passo "Prezzo" usa la zona di trasporto di ripiego ed è
  più alto di quello salvato dopo l'invio (es. 3.840 € → circa 3.400 €). Da decidere se chiedere il CAP prima.
- `npm run db:migrate` locale crea `.data/`; per la verifica nel browser è stato ripulito alla fine.
