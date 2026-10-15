# Design

## Context

Vedi `proposal.md` – Why. Stato reale su cui si costruisce:

- **Dominio puro** `src/domain` (lint vieta React/Three/replicad): `Assembly { typologySlug, params, pieces, joints, hardware, meta }`, pezzi con `section {b,h}`, `length`, `pose`, `machinings[]`, eventuale `curve`; `measureAssembly`, `evaluateRules(assembly, ruleSet)`, `autoSize`, `Envelope { box, wallSide, obstacles, floor }`, `checkCollisions` (OBB dei pezzi contro AABB del box e degli ostacoli), `fitToEnvelope` sulle dimensioni `altezza → profondita → larghezza`, `floorFunction`. `BuildOptions { floorHeightAt, embedment }` sono le "condizioni di cantiere" passate alla generazione; `BuildContext` le espone ai template.
- **Template** (`tipologie-estese`): `templates/shared.ts` ha già `wallAttachment(ctx, kind, { beams, face, wall: Plane })` che taglia le teste a filo del piano del muro con `headCutFromPlane`; `math/plane.ts` fornisce `Plane`, `transformPlane`, `intersectLinePlane`. Oggi il piano del muro è implicito (`y = yMuro`, ortogonale al fronte). Ferramenta in `Assembly.hardware` con `code` di catalogo (`hardware/catalog.ts`); metadati `category`, `tags`, `reference` sui template; preset (`src/domain/presets`, task 7 di `tipologie-estese`, non ancora implementati).
- **Dati oggi in file TS**: `rules/data/default-lovato.ts` (`loadRuleSet`), `components/sections.ts` (`SECTION_CATALOG`), `hardware/catalog.ts`, preset. Tutti marcati `DA VALIDARE`.
- **App**: Next.js 14 App Router, route group `(app)` con sidebar e `NavHeader`, `/` → redirect a `/dashboard`, nessun DB, nessuna auth, API in `src/app/api/ai/**` (Node). Store zustand `configuratoreStore` con `config` persistita e `derived` ricalcolato in modo sincrono; `ConfigFileSchema` con `schemaVersion: 1`. Tema shadcn con variabili HSL in `globals.css` (`:root` e `.dark`), Tailwind 3, `components.json`. Vitest con progetti `unit`, `dom`, `geometry`. WASM OCCT (~23 MB) copiato in `public/occt/` da `scripts/copy-occt-wasm.mjs` (`postinstall`, `prebuild`), non versionato.
- **Vincoli**: lavoro di subagenti in parallelo su un unico branch, quindi moduli piccoli con confini netti, `npm test`, `npm run lint` e `npm run build` verdi a ogni task; nessun servizio esterno necessario per sviluppo e test; l'utente non è disponibile per decisioni durante l'implementazione (le scelte "Da confermare" sono prese con un default sostituibile).

## Goals / Non-Goals

**Goals:**
- Il motore di prezzo è una funzione pura `Assembly + Envelope + opzioni + listino → Quote`, testabile al 100% in Node e condivisa da wizard pubblico (lato server), configuratore interno (lato client) e simulatore admin.
- Un solo schema per ogni insieme di dati (zod nel dominio): è usato da file seed, DB (documento JSON validato), form admin, import CSV e API. Niente duplicazione di tipi tra dominio e persistenza.
- Tutto ciò che è esterno (DB, auth, email, storage foto, analytics) sta dietro un adattatore con implementazione locale, così `npm run dev` funziona senza account e il provider si cambia in un file.
- Il sito pubblico non importa mai moduli interni pesanti o sensibili (Three, kernel, listini, store del configuratore) salvo il wizard al passo di riepilogo; verificato da test di bundle e di forma delle risposte.
- Il fuorisquadra è un'estensione **additiva** del dominio: senza pianta dichiarata tutto resta identico (fixture golden invariate).

**Non-Goals:**
- Pagamenti online, firma digitale del preventivo, CRM completo (pipeline di vendita oltre gli stati della richiesta), multi-azienda/multi-lingua.
- Calcolo strutturale o verifica normativa; i prezzi sono tabellari.
- Editor visuale dei template di tipologia o dei testi lunghi del sito (i testi sono campi semplici; layout e componenti sono codice).
- Ottimizzazione di taglio 2D (pannelli) e nesting CNC: solo barre lineari.
- App mobile nativa, PWA offline.
- Importazione di listini dai gestionali Lovato (solo CSV).

## Decisions

### P1. Motore di prezzo come pipeline pura di "fasi" che emettono righe

`src/domain/pricing/`:

```
types.ts        PriceList (zod), Quote, QuoteLine, QuoteGroup, Money (centesimi interi), PricingOptions, PricingWarning
money.ts        somma/percentuali/arrotondamenti su interi (half-up), formattazione it-IT
cutting-stock.ts  piano di taglio 1D (P2)
site-factors.ts  SiteFactors da Envelope + Assembly (P3)
phases/         timber.ts, machining.ts, hardware.ts, treatments.ts, covering.ts, labour.ts, complications.ts, transport.ts, totals.ts
engine.ts       priceAssembly(input): Quote  — esegue le fasi in ordine fisso
views.ts        officeView(quote), customerView(quote)  — la vista cliente è una proiezione, mai un calcolo diverso
data/default-listino.ts  listino seed `DA VALIDARE` (v1, validità 2026-01-01)
```

- `QuoteLine { code, category, label, quantity, unit, unitPriceCents, amountCents, explain: string[], visibility: "cliente" | "ufficio", ruleId? }`. Le categorie: `legno`, `sfrido`, `lavorazioni`, `ferramenta`, `trattamenti`, `copertura`, `montaggio`, `complicazioni`, `trasporto`, `sconti`, `margine`, `adeguamenti` (minimo d'ordine, arrotondamento).
- Ordine fisso delle fasi: costi diretti → margini (materiali/manodopera) → sconti → minimo d'ordine → imponibile → IVA → arrotondamento (requisito della spec). Ogni fase è una funzione `(ctx, acc) => acc` con `acc.lines` immutabile; `explain` cita i valori del listino e la versione (`listino v{n} del {data}`).
- `Money` in **centesimi interi**: nessun float nei totali; le quantità (m³, m², ore) restano `number` con 6 decimali e si moltiplicano con arrotondamento half-up al centesimo per riga. Determinismo byte-per-byte garantito da `canonicalJson` (già in `geometry/cache.ts`, da spostare in `domain/math/canonical.ts` o duplicare come helper del dominio) nella serializzazione del `Quote`.
- Prezzi mancanti non lanciano: riga a importo 0 + `warning { code: "prezzo-mancante", ... }` e `quote.status = "incompleto"`. Il wizard pubblico tratta `incompleto` come "prezzo su richiesta".

**Perché** fasi e righe invece di un'unica formula: ogni voce deve essere spiegabile e attivabile/disattivabile dall'ufficio; le fasi corrispondono alle sezioni del back-office; i test unitari sono per fase. Alternativa scartata: motore di regole generico con espressioni (tipo `jsonlogic`) — flessibile ma opaco per l'ufficio e difficile da validare; le **complicazioni** sono l'unica parte che ha bisogno di regole dati, e sono volutamente a struttura fissa (P3).

### P2. Cutting stock 1D: costruzione greedy + miglioramento esaustivo limitato

`cutting-stock.ts` `planCuts(demands: {id, length}[], stock: {length, priceCents}[], opts: {kerf, endTrim, minReusableOffcut}): CuttingPlan`, per gruppo (specie, qualità, sezione).

Algoritmo deterministico:
1. Lunghezza utile di una barra = `length − 2·endTrim`; un pezzo "costa" `length + kerf` tranne l'ultimo della barra.
2. **Baseline**: First-Fit Decreasing e Best-Fit Decreasing su ogni lunghezza di barra singola e su "tutte le lunghezze" (barra scelta per minor costo del residuo); si tiene la soluzione a costo minimo.
3. **Miglioramento**: per gruppi fino a 12 pezzi, ricerca branch-and-bound esatta sui costi (bound = costo baseline; ordine di esplorazione fisso ⇒ deterministico, con limite di 200 000 nodi che garantisce il tempo). Per gruppi più grandi: ricerca locale "svuota una barra e redistribuisci" (first improvement, iterazioni limitate) a partire dalla baseline; il risultato non è mai peggiore della baseline per costruzione.
4. Costo = Σ prezzo barre; a parità, meno barre; a parità, meno sfrido non riutilizzabile. Lo sfrido riutilizzabile è riportato ma la decisione sul recupero (percentuale) sta nel listino (fase `timber`).

**Perché** non un solver ILP (es. `javascript-lp-solver`) o colonne di pattern: dipendenza in più, meno deterministico tra versioni, overkill per gruppi di decine di pezzi. L'approccio FFD/BFD + B&B limitato dà l'ottimo sulle istanze piccole (quelle reali: una pergola ha 2–6 sezioni con 2–20 pezzi ciascuna) e resta sotto i 200 ms sui 200 pezzi dei test. Alternativa scartata: solo FFD — sfridi stimati per eccesso, il cliente paga sfridi che Lovato non ha.

### P3. Fattori di cantiere e regole di complicazione a struttura fissa

`site-factors.ts` `siteFactors(envelope, assembly, declared): SiteFactors { planDeviationDeg, wallDeviationDeg, floorSlopePct, floorRangeMm, obstaclesCount, maxHeightMm, clearHeightMm, embedmentMm, access: "facile" | "medio" | "difficile", anchoring: "terra" | "muro" | "misto" }` — tutti numeri o enum, calcolati dal dominio (pianta P4, `floorFunction` campionata ai piedi dei pilastri e agli angoli dell'impronta, ostacoli la cui AABB interseca l'impronta della pergola estesa in Z).

`ComplicationRule { id, label, enabled, conditions: { factor: keyof SiteFactors, op: ">" | ">=" | "==" | "in", value }[], effect: { kind: "ore" | "percento-ore" | "fisso" | "percento-legno", value }, explain? }`. Condizioni in AND; regole valutate nell'ordine del listino; `percento-ore` si applica alle ore base (non cumulativo sulle precedenti) per restare spiegabile. Il form admin è una frase ("Se … allora …"), nessun parser.

**Perché**: l'ufficio deve capire e modificare le complicazioni senza supporto; le condizioni reali (fuorisquadra > x°, dislivello > y mm, altezza > z, ostacoli ≥ n, accesso difficile) rientrano tutte in soglie su fattori numerici. Il fattore `access` è dichiarato (dal cliente nel wizard, dall'ufficio nel configuratore), non calcolabile.

### P4. Fuorisquadra: pianta quadrilatera nell'ingombro, piano del muro come `BuildOption`

- `Envelope.plan?: { corners: [fl, fr, br, bl] as Vec2[] }` (ordine antiorario in pianta: anteriore sinistro, anteriore destro, posteriore destro, posteriore sinistro). Default assente = rettangolo del box; `parseEnvelope` verifica convessità e che il rettangolo contenitore coincida con `box` (tolleranza 1 mm), altrimenti **normalizza il box** alla pianta (il box resta la bounding box: così `toAbsoluteBox` dei lati pavimento/soffitto e il viewer non cambiano).
- `envelope/plan.ts`: `planOf(envelope): Plan` (sempre definita, rettangolo di default), `sideSegment(plan, side)`, `sidePlane(envelope, side): Plane` (verticale, normale verso l'interno), `wallPlane(envelope)`, `planDeviations(plan)` (per lato, gradi), `planFromDiagonals({front, back, left, right, d1, d2}, tol)` (risoluzione in chiuso: fissato il fronte su X, l'angolo posteriore sinistro dalla terna `left, front, d2`, quello destro da `right, front, d1`; verifica `|back − distanza calcolata| ≤ tol`), `pointInPlan`, `planPenetration(point)` (distanza con segno dal lato più violato).
- **Ostacoli sui lati inclinati**: `toAbsoluteBox` resta AABB per i lati `pavimento/soffitto`; per i lati verticali restituisce un **OBB** allineato al lato reale (`AbsoluteObstacle.box` diventa `OBB`; con pianta rettangolare è l'AABB di oggi). `checkCollisions` passa a test OBB–OBB (SAT già in `math/obb.ts`, da estendere con `obbObbPenetration`) e per l'ingombro usa `planPenetration` sui vertici più Z (altezza/pavimento) — con pianta rettangolare i risultati coincidono (test di equivalenza sulle fixture).
- **Templates**: `BuildOptions.wallPlane?: Plane` → `ctx.wallPlane` (default: piano implicito calcolato dal template, così le fixture non cambiano). `addossata-monofalda`: banchina ruotata in pianta parallela al muro (posa con asse X lungo il muro), travetti con lunghezza individuale = distanza tra gronda e intersezione asse–piano del muro, taglio di testa da `headCutFromPlane(piece, wallPlane, "testa-fine")` (già composto: `angle` dalla pendenza, `angle2` dal fuorisquadra). `addossata-sandwich`, `pensilina-sbalzo`, `a-elle` (due piani: `wallPlane` e `wallPlane2` per il secondo muro) usano `wallAttachment` con il piano reale. Le tipologie autoportanti ignorano l'opzione.
- `fitToEnvelope`: nessun cambio di algoritmo, usa `checkCollisions`; per le addossate la profondità cercata è misurata al punto del muro più vicino (il template riceve il piano e si arrangia).
- Wizard: il cliente non vede angoli; inserisce le diagonali (o sceglie "non so" ⇒ rettangolo + nota "da verificare in sopralluogo").

**Perché** quadrilatero e non poligono generico: copre il caso reale (muro non in squadra, terrazzo trapezoidale) con misure che un cliente sa prendere; mantiene box, pavimento e ostacoli esistenti. Alternativa scartata: solo `wallAngle` scalare — non rappresenta il lato opposto o i due lati non paralleli e non si misura con le diagonali.

### P5. Persistenza: Postgres + Drizzle, documenti JSON versionati validati dal dominio

- Driver: `pg` (node-postgres) in produzione con URL del provider (pooler); `@electric-sql/pglite` con `drizzle-orm/pglite` in sviluppo (`.data/pglite/`) e test (in memoria). Scelta per **`DATABASE_URL`**: assente ⇒ PGlite. Le migrazioni (`drizzle-kit generate`, cartella `drizzle/`) sono le stesse per i due driver (`migrate` di drizzle per entrambi).
- Schema (`src/db/schema.ts`): `users (id, email, name, role, active, createdAt)`, tabelle Auth.js (`accounts`, `sessions`, `verification_tokens`), `dataset_versions (id, dataset: "listino" | "regole" | "tipologie" | "preset", version, status, effectiveFrom, data jsonb, notes, createdBy, createdAt, publishedBy, publishedAt)` con indice univoco `(dataset, version)` e vincolo "una sola bozza per dataset" (indice parziale), `audit_log (id, at, userId, dataset?, entity, entityId, action, diff jsonb)`, `leads (id, code, status, assigneeId, customer jsonb, consent jsonb, photos jsonb, notes, createdAt, anonymizedAt)`, `quotes (id, leadId, kind: "indicativo" | "definitivo", config jsonb, priceListVersionId, ruleSetVersionId, siteFactors jsonb, quote jsonb, manualLines jsonb, totalCents, createdBy, createdAt)`, `lead_events (id, leadId, at, userId, from, to, note)`, `customer_tokens (token, leadId, expiresAt)`, `email_outbox (id, to, template, payload jsonb, status, attempts, lastError, sentAt)`.
- I **documenti** (listino, regole, impostazioni tipologie, preset) sono `jsonb` validati con gli schemi zod del dominio alla scrittura e alla lettura (`parsePriceList`, `loadRuleSet`, …). Versioning a documento intero: semplice, diff calcolabile (`diffDocuments(a, b)` → elenco di percorsi) e nessuna normalizzazione relazionale di tabelle che cambieranno forma con l'ufficio.
- `src/server/repositories/*.ts` espongono funzioni tipizzate (`getActiveDataset("listino", date)`, `saveDraft`, `publishDraft`, `createLead`, …) usate da server actions, route handler e seed. Nessun accesso a `db` fuori da `src/server`.
- Seed (`src/db/seed.ts`, `npm run db:seed`): idempotente per chiave naturale (dataset+version 1, email admin da `ADMIN_EMAIL`).

**Perché** Drizzle e non Prisma: schema in TS senza generatore, migrazioni SQL leggibili, driver PGlite ufficiale (test senza Docker), bundle piccolo per il runtime Node su Vercel. Perché documenti e non tabelle normalizzate: la forma del listino è destinata a cambiare con il feedback dell'ufficio; con `jsonb` cambia solo lo schema zod e una migrazione dati nel dominio (`migratePriceList(v→v+1)`), non lo schema SQL.

### P6. Autenticazione: Auth.js v5 con collegamento via email e sessione JWT, dietro un adattatore

- `next-auth@5` (Auth.js) con provider **Resend** (magic link) e `@auth/drizzle-adapter` per utenti/token; `session.strategy = "jwt"` con `role` e `active` nel token (rinnovato a ogni richiesta server dal DB solo per pagine admin: la disattivazione è immediata per pagine/API protette perché `requireUser()` rilegge `users.active`).
- Divisione `auth.config.ts` (senza adapter, importabile dal middleware edge: solo verifica JWT e redirect) / `auth.ts` (con adapter, Node). `middleware.ts` protegge `/(app)` (`/dashboard`, `/configuratore`, `/ai`) e `/admin`; le API interne usano `requireUser(role)` nel handler (401/403). Il `matcher` esclude il sito pubblico, `/api/preventivo/**`, `/api/auth/**`, asset.
- `src/server/auth/index.ts` espone `getSession()`, `requireUser(roles?)`, `can(user, permission)` (tabella permessi × ruolo in `permissions.ts`): le pagine e le action usano solo questo modulo, così Auth.js è sostituibile (es. Clerk) toccando un file.
- Solo utenti creati dall'admin possono accedere: `signIn` callback rifiuta email non in `users` o `active = false` senza inviare email (risposta neutra).

**Perché** Auth.js e non un provider gestito del Marketplace (Clerk/WorkOS): nessun costo né lock-in per 3–10 utenti interni, stesso provider email delle notifiche, dati utente nel nostro DB (audit con `userId`). Perché magic link e non password: niente policy/reset da gestire, l'ufficio ha già l'email. **Da confermare**: il cliente preferisce password o SSO Google? Entrambi sono provider aggiuntivi di Auth.js senza cambiare il resto.

### P7. Email, foto, PDF, analytics: adattatori con implementazione locale

- `src/server/email/`: `EmailSender { send(message) }` con `resendSender` (prod) e `consoleSender`/`memorySender` (dev/test). Template HTML+testo in TS (`templates/{conferma-cliente,notifica-ufficio,accesso}.ts`). Invii **in outbox** (`email_outbox`): la richiesta è salvata prima, l'invio avviene dopo nella stessa request con retry dall'admin ("Reinvia") — niente code esterne nell'MVP.
- `src/server/storage/`: `FileStorage { put, getUrl, delete }` con `vercelBlobStorage` (prod, `@vercel/blob`, accesso privato con URL firmati) e `localDiskStorage` (`.data/uploads/`, servito da `/api/uploads/[id]` con autorizzazione). Validazione immagini: tipo MIME reale (magic bytes), ≤ 8 MB, max 5; ridimensionate lato client prima dell'upload (canvas, lato max 2000 px) per restare leggeri.
- `src/server/pdf/`: `@react-pdf/renderer` in runtime Node (`export const runtime = "nodejs"`, `maxDuration = 30`), documento `QuotePdf` dalla vista cliente + immagine PNG della scena catturata dal viewer al momento dell'invio (`canvas.toDataURL`, caricata insieme alla richiesta) con ripiego alla miniatura SVG isometrica (`thumbnails/isometric.ts` di `tipologie-estese`) convertita in PNG con `resvg`? No: `@react-pdf/renderer` supporta SVG nativo ⇒ si incorpora l'SVG direttamente, nessuna dipendenza in più.
- Analytics: `@vercel/analytics` montato solo se `NEXT_PUBLIC_ANALYTICS=1` (senza cookie). Da confermare.

### P8. Sito pubblico: route group `(site)` con tema scoped e componenti propri

- Struttura: `src/app/(site)/{layout.tsx, page.tsx, pergole/page.tsx, pergole/[slug]/page.tsx, galleria/page.tsx, contatti/page.tsx, privacy/page.tsx, preventivo/[[...step]]/page.tsx, preventivo/grazie/page.tsx, p/[token]/page.tsx, sitemap.ts, robots.ts, opengraph-image.tsx}`. `src/app/page.tsx` (redirect) viene sostituito dalla home in `(site)`.
- **Tema**: `src/app/(site)/site.css` definisce `.theme-site { --background, --primary, … }` (ridefinizione dei token shadcn con palette legno: fondo crema `40 30% 97%`, testo bruno `25 20% 12%`, primario rovere scuro `25 45% 28%`, accento verde bosco `150 25% 30%`, bordi sabbia) e `.theme-site.dark` (noce `25 15% 8%`, testo avorio) più token propri `--site-display-font`, `--site-radius`, `--site-measure`. Il layout `(site)` applica `className="theme-site"` e `data-theme` da `prefers-color-scheme` (script inline anti-flash, senza cookie). I componenti shadcn esistenti ereditano il tema senza modifiche; i componenti del sito (`src/components/site/`: `SiteHeader`, `SiteFooter`, `Hero`, `TypologyCard`, `Section`, `Steps`, `Testimonial`, `Gallery`, `Cta`) sono nuovi. Font con `next/font/google`: display `Fraunces` (variabile, ottico) + testo `Inter` già presente; scala tipografica fluida con `clamp()`.
- Contenuti dinamici (titoli, descrizioni, immagini, "a partire da") da `dataset tipologie` attivo via server component con `revalidate = 300` e `revalidateTag("tipologie")` alla pubblicazione; miniature SVG isometriche dal dominio (già deterministiche) come immagine di ripiego; immagini caricate dall'admin con `next/image`. **Da confermare**: fotografie reali di Lovato (nell'MVP segnaposto generati, mai foto di terzi).
- SEO: `generateMetadata`, JSON-LD `LocalBusiness` (home) e `Product` (tipologia, con `offers.price` = "a partire da"), `sitemap.ts` dalle tipologie visibili, `robots.ts` con `disallow` di `/admin`, `/dashboard`, `/configuratore`, `/ai`, `/api`, `/accesso`, `/preventivo/*` oltre il primo passo (`noindex` nel layout del wizard).
- Verifiche: test di bundle (`next build` + lettura di `.next/build-manifest.json`: nessun chunk `three`/`replicad`/`zustand` nelle pagine `(site)` tranne `preventivo`), Lighthouse via Playwright MCP in verifica manuale, `axe` nei test dom dei componenti del sito.

### P9. Wizard: store proprio che produce una `ConfiguratoreConfig`, prezzo dal server

- `src/stores/wizard-store.ts` (zustand, `persist` su `sessionStorage`, chiave `lovato-wizard-v1`): `answers` per passo (tipologia, misure in cm, spazio: `{ contromuro, squadra: "dritto" | "diagonali" | "nonso", diagonali, pavimento: {piano | dislivello, verso}, ostacoli semplificati[], accesso }`, finiture) e `derived` calcolato in modo sincrono con il dominio: `toConfig(answers): ConfiguratoreConfig` (parametri in mm, ingombro con `plan` da `planFromDiagonals`, ostacoli tradotti in `Obstacle` con default per tipo, `embedment`), poi `fitToEnvelope` + `autoSize` **sempre applicati** (il cliente non sceglie sezioni), `generate`, `checkCollisions`, `evaluateRules` e `noteSemplici(violations, collisions, fitLimits)` (traduzione in frasi, `wizard/notes.ts` puro e testato).
- Le regole costruttive per il wizard arrivano dal server con la pagina (`ruleSet` attivo serializzato: non è sensibile) così il dominio gira nel browser; il **prezzo no**: `POST /api/preventivo/stima { config, declared }` (runtime Node, rate-limited, zod) → `customerView(priceAssembly(...))` con il listino attivo letto dal repository (cache in memoria 60 s). Debounce 400 ms lato client; `AbortController` sulle richieste superate. Il server **rigenera** l'assieme dalla config (non si fida dell'assieme del client).
- 3D: `viewer/` esistente in modalità box (nessun kernel avviato); pulsante "Mostra dettagli" avvia il kernel solo su richiesta (desktop, `navigator.connection` non `saveData`). L'immagine per il PDF è catturata con `gl.domElement.toDataURL` (canvas con `preserveDrawingBuffer` solo per questo scatto).
- Passo contatti: `POST /api/preventivo` (multipart: JSON + foto) → `createLeadWithQuote` (transazione), outbox email, risposta `{ code, token }` → `/preventivo/grazie?c=PRV-…`.

**Perché** uno store separato e non il `configuratoreStore`: il wizard ragiona in domande e centimetri, con auto-dimensionamento e adattamento sempre attivi; il configuratore interno ragiona in parametri. Il punto di contatto è `ConfiguratoreConfig` (stesso `ConfigFileSchema`, `schemaVersion` 1 + campo `envelope.plan` opzionale + `finiture` in `params`? No: le finiture non sono parametri del template ⇒ **`ConfiguratoreConfig.commercial?: { species, quality, treatment, covering, access, anchoring }`**, nuovo campo opzionale nel `ConfigFileSchema`, `schemaVersion` resta 1 perché è additivo e con default).

### P10. Back-office: server actions tipizzate + form generati per sezione, non editor JSON

- `src/app/(admin)/admin/**` riusa `Sidebar`/`NavHeader` dell'app interna (voce "ADMIN" visibile ai ruoli abilitati) con sotto-navigazione a schede per le sezioni del listino. Ogni sezione è un **form dedicato** (tabella editabile `EditableTable` generica su colonne tipizzate, con `Input` numerici, `Select`, `Switch`, validazione per cella da zod) che legge e scrive **una porzione** del documento bozza tramite server actions (`saveDraftSection(dataset, path, value)`) con lock ottimistico (`version` + `updatedAt` della bozza).
- Pubblicazione: `publishDraft(dataset)` → validazione completa + prova su tutte le tipologie visibili (regole) o preventivo di prova su tutti i preset (listino: nessun `prezzo-mancante` per le voci usate dai preset) → transazione (attiva nuova, archivia precedente, audit) → `revalidateTag`.
- CSV: `src/domain/pricing/csv.ts` (puro): `exportTable(priceList, table)` / `importTable(priceList, table, csvText) → { next, diff, errors }` con lo stesso dialetto della distinta (`;`, BOM, virgola decimale). Anteprima diff prima di applicare.
- Simulatore: pagina `/admin/simula` con scelta preset/richiesta, fattori di cantiere modificabili, confronto bozza vs attiva (due `priceAssembly` lato server, tabella affiancata).
- Audit: ogni server action passa da `withAudit(action, meta)` che registra `diff` (`diffDocuments`) — niente trigger SQL.

**Perché** form per sezione e non un editor del documento JSON: "back semplice per impostare le regole" — l'ufficio deve vedere tabelle con unità, non chiavi. Perché server actions e non API REST per l'admin: meno superficie, tipizzazione end-to-end, già nel runtime Node; le API restano solo dove serve un client esterno al form (stima pubblica, upload, PDF, download).

### P11. Integrazione nel configuratore interno

- `computeDerived` aggiunge `quote: Quote | null` (vista ufficio) calcolato con `priceAssembly` quando `priceList` è disponibile nello store (slice `catalog { priceList, ruleSet, versions, source: "archivio" | "default" }`, caricata all'avvio da `GET /api/admin/dataset/attivi`); ripiego ai dati di default con avviso. Il calcolo del prezzo (con cutting stock) è dell'ordine dei ms: resta sincrono con `derived`.
- `pricing-panel.tsx` (vista ufficio con dettaglio legno/piano di taglio, complicazioni, anteprima vista cliente) nel pannello esiti/esportazioni; `envelope-form.tsx` aggiunge la pianta (`rettangolare | angoli | diagonali`), accesso e ancoraggio; il viewer aggiunge la pianta reale a `envelope-layer.tsx`.
- `?richiesta=<id>`: la pagina server legge la richiesta (auth) e passa `initialConfig` + intestazione; `loadConfig` esistente; "Salva preventivo definitivo" apre un dialogo con righe manuali e sconti → `saveFinalQuote(leadId, config, manualLines)`.

### P12. Deploy su Vercel

- Progetto Vercel collegato al repo; build command `npm run build` (il `prebuild` copia il WASM in `public/occt/` — su Vercel `postinstall` gira già; `public/` è servita come statico). `next.config.js` `headers()` per `/occt/:path*`: `Cache-Control: public, max-age=31536000, immutable` e `Content-Type: application/wasm`; per invalidare, `scripts/copy-occt-wasm.mjs` copia in `public/occt/<versione-pacchetto>/` e `initOcct` usa l'`assetBase` versionato (piccolo cambio).
- Migrazioni: `vercel.json` `buildCommand: "npm run db:migrate && npm run build"` con `DATABASE_URL` dell'ambiente (produzione: branch principale Neon; anteprima: branch Neon per deployment creato dall'integrazione Vercel–Neon, che fornisce `DATABASE_URL` per ambiente). Se la migrazione fallisce la build fallisce e la versione precedente resta attiva. Seed eseguito **a mano** una volta (`npm run db:seed` con `DATABASE_URL` di produzione) — non in build.
- Runtime: tutte le route handler/pagine server `export const runtime = "nodejs"` dove serve `pg`/PDF (default Node in Next 14 comunque); `maxDuration = 30` per PDF e invio. Nessuna `edge` tranne `middleware.ts`.
- Env (`.env.example` aggiornato, validato da `src/server/env.ts` con zod all'avvio del server): `DATABASE_URL` (prod obbligatoria), `AUTH_SECRET`, `AUTH_URL`/`NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `OFFICE_EMAIL`, `BLOB_READ_WRITE_TOKEN` (opz.), `ADMIN_EMAIL` (seed), `NEXT_PUBLIC_ANALYTICS` (opz.), `RATE_LIMIT_*` (opz.). Rate limiting della stima/invio: in memoria per istanza (Map con finestra scorrevole) — sufficiente per il traffico atteso; **Da confermare** se serve `@vercel/kv`.
- Verifiche di rilascio: `npm run lint && npm test && npm run test:db && npm run build` in CI (GitHub Actions o Vercel checks), Lighthouse sull'anteprima, prova di ripristino DB documentata in `docs/deploy.md`.

### P13. Test

- Progetto vitest **`db`** (`src/**/*.db.test.ts`, ambiente node, PGlite in memoria, migrazioni applicate in `beforeAll`), script `npm run test:db`; `npm test` resta `unit + dom` (rapido). I repository, le server actions (chiamate come funzioni con un utente finto) e il seed sono testati qui.
- Pricing e cutting stock: test unitari per fase + golden del preventivo dei preset (`__fixtures__/preventivo-*.json`, rigenerabili con `UPDATE_GOLDEN=1`), test di proprietà riproducibili (100 istanze con seed fisso) per il cutting stock.
- Sicurezza delle risposte pubbliche: test che la vista cliente serializzata non contiene chiavi di una lista nera (`margin`, `hourly`, `cents` interni, `bars`, `waste`) e che la risposta di `/api/preventivo/stima` è esattamente `CustomerQuoteSchema`.
- UI: test dom per wizard (passi, traduzione in config), admin (tabella editabile, form complicazioni), pannello preventivo; verifica manuale con Playwright MCP a fine sezione come nelle change precedenti.

## Risks / Trade-offs

- [Prezzi e regole di complicazione inventati: il prezzo indicativo può essere lontano dal reale] → tutti i valori in un unico documento seed marcato `DA VALIDARE`, back-office per correggerli senza rilascio, fascia di indicatività e dicitura "soggetto a sopralluogo" nel PDF; task finale di sessione con il commerciale.
- [Il cliente misura male le diagonali] → verifica di coerenza con tolleranza, opzione "non so", nota automatica "muro da verificare in sopralluogo" nel preventivo; il fuorisquadra ricade comunque nelle complicazioni solo oltre soglia.
- [Magic link bloccato da filtri antispam aziendali] → dominio mittente verificato (SPF/DKIM su Resend), testo semplice, link breve; ripiego: provider password aggiuntivo in Auth.js (un file).
- [Auth.js v5 ancora `beta` su npm] → API stabile da tempo, usata in produzione da molti progetti; isolata in `src/server/auth`; alternativa (Lucia-style sessioni proprie) se emergono problemi, con la stessa interfaccia `getSession/requireUser`.
- [PGlite e Postgres gestito possono differire in dettagli SQL] → solo SQL standard via Drizzle, nessuna estensione; test `db` su PGlite e smoke test di migrazione sull'anteprima Neon prima della produzione.
- [WASM 23 MB sul sito pubblico] → mai caricato di default; solo su richiesta esplicita nel riepilogo e nel configuratore interno; cache immutabile.
- [Rate limit in memoria per istanza su serverless] → limite per IP conservativo e protezione aggiuntiva con campo honeypot e tempo minimo di compilazione; `@vercel/kv` se il traffico lo richiederà.
- [Documenti `jsonb` interi: due utenti modificano la stessa bozza] → lock ottimistico con `updatedAt`, messaggio "la bozza è stata modificata da … ricarica"; una sola bozza per dataset per costruzione.
- [Dimensione dell'istantanea `quote` in DB] → poche decine di kB per preventivo; nessun blob (PDF rigenerato on demand, foto su storage).
- [`fitToEnvelope` su pianta inclinata può oscillare] → il prisma convesso mantiene la monotonia in larghezza/profondità per pergole rettangolari; test dedicato con trapezio.
- [Tre change in parallelo sullo stesso branch] → questa change tocca i template addossati solo tramite `ctx.wallPlane` (default identico) e i file dati solo per aggiungere il seed; i task UI sono ordinati dopo quelli di `tipologie-estese` (11.x) e dichiarano i prerequisiti.

## Migration Plan

1. Dominio e DB sono additivi; `ConfigFileSchema` accetta i nuovi campi opzionali (`envelope.plan`, `commercial`) senza cambiare `schemaVersion`.
2. Primo rilascio: provisioning DB (Marketplace), variabili d'ambiente, `db:migrate` in build, `db:seed` manuale (crea admin da `ADMIN_EMAIL`), primo accesso dell'admin via magic link, creazione utenti, revisione del listino nel back-office, pubblicazione.
3. **Rottura** controllata: `/` passa dal redirect alla home pubblica e `(app)` richiede il login — da comunicare agli utenti interni (hanno già l'email per accedere). Le configurazioni salvate in `localStorage` restano valide.
4. Rollback: ridistribuzione della versione precedente su Vercel; le migrazioni sono solo additive in questa change (nessun `DROP`), quindi la versione precedente convive con lo schema nuovo.

## Open Questions

- Fotografie e testi definitivi del sito (nell'MVP segnaposto e miniature generate): solo contenuti, modificabili dall'admin.
- Elenco definitivo di specie/qualità, trattamenti e coperture offerti e relativi prezzi; soglie delle complicazioni; zone di trasporto per CAP: solo dati del listino.
- Aliquota IVA agevolata (10%) per ristrutturazioni: oggi selezionabile dall'ufficio nel preventivo definitivo, 22% di default nel wizard.
- Numerazione dei preventivi allineata al gestionale Lovato: oggi `PRV-AAAA-NNNNN`, cambia solo il generatore del codice.

## Da confermare

Scelte prese con un default sostituibile, da confermare con l'utente senza bloccare il piano:

- **Hosting e account Vercel**: progetto nel team/account di Lovato o di Lemonjuice; dominio da collegare.
- **Database**: Neon Postgres via Vercel Marketplace (branching per le anteprime); alternative Supabase o Vercel Postgres — cambia solo `DATABASE_URL` e l'integrazione.
- **Autenticazione**: Auth.js con magic link via email (P6); alternativa password o Google Workspace come provider aggiuntivo; alternativa gestita (Clerk) se si preferisce un pannello utenti esterno.
- **Email**: Resend (integrazione Marketplace, dominio mittente da verificare con DNS); alternative Postmark/SES dietro lo stesso adattatore.
- **Foto dei clienti**: Vercel Blob privato; alternativa S3/R2 o nessun upload nell'MVP.
- **Dati reali**: listino legno/lavorazioni/ferramenta/trattamenti/coperture, tariffe e tempi di montaggio, complicazioni, zone di trasporto, margini, minimo d'ordine, fascia di indicatività, aliquote; lunghezze commerciali e sfrido minimo per sezione; tutto nel seed come segnaposto `DA VALIDARE`.
- **Contenuti del sito**: fotografie, testi, logo e colori ufficiali Lovato Legnami (la palette P8 è una proposta).
- **Analytics**: Vercel Analytics attivabile da variabile; nessun tracciamento con cookie.

## Note di implementazione

- **Dipendenze (1.1)**: installate `drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg`, `@electric-sql/pglite`, `next-auth@beta` (5.0.0-beta), `@auth/drizzle-adapter`, `resend`, `@react-pdf/renderer`, `@vercel/blob`. `@vercel/analytics` è fissato a **`~1.3.1`**: dalla 1.4 dichiara peer opzionali (`@sveltejs/kit`, `svelte`, `vue`, …) che fanno fallire la risoluzione di npm contro il `vite` 7 di vitest (ERESOLVE); la 1.3 ha solo `next`/`react` come peer e offre la stessa API `<Analytics />` usata da P7. Cartelle vuote versionate con `.gitkeep` (route group, componenti, `drizzle/`, `docs/`, `pricing/{phases,data}`); i moduli `src/server/*` e `src/domain/pricing` hanno un `index.ts` con `export {}` da riempire nei task successivi.
- **Progetto vitest `db` (1.2)**: `src/**/*.db.test.ts`, ambiente node, timeout test/hook 30 s; escluso esplicitamente dal progetto `unit` (che include `*.test.ts`). `tsx` aggiunto in `devDependencies` per gli script TS (`db:migrate` → `tsx src/db/migrate.ts`, `db:seed` → `tsx src/db/seed.ts`): i due file nascono con i task 6.2 e 6.6, fino ad allora gli script falliscono per file mancante. `db:generate`/`db:studio` usano `drizzle-kit` (configurazione in 6.1).
- **Ambiente (1.3)**: `src/server/env.ts` `parseEnv(source)` (puro, testato) e `getEnv()` (legge `process.env` alla prima chiamata, mai al caricamento del modulo: `next build` gira con `NODE_ENV=production` e non deve richiedere le variabili). Il task marca `DATABASE_URL?` ma P12 la dichiara obbligatoria in produzione: scelta P12 — senza `DATABASE_URL` in produzione PGlite scriverebbe su un disco effimero di Vercel e i dati andrebbero persi. In produzione anche `AUTH_SECRET` ≥ 32 caratteri. `RESEND_API_KEY` e `BLOB_READ_WRITE_TOKEN` restano facoltative anche in produzione, con ripiego locale e voce in `env.warnings` (da loggare all'avvio). Stringhe vuote = variabile assente (così `.env.example` copiato così com'è funziona in sviluppo). `EnvError.variables` elenca tutte le variabili mancanti/non valide, il messaggio le nomina. `services { database, email, storage }` dice agli adattatori quale implementazione usare.
- **Denaro (2.1)**: `Cents = number` intero (verificato da `cents()` in ogni operazione: un float lancia `MoneyError`). `roundHalfUp` arrotonda la metà **lontano da zero** (−0,5 → −1), così sconti e recuperi negativi sono speculari agli addebiti, e ripulisce il rumore binario a 1e-6 prima di arrotondare (`1,005 €` → 101). API: `cents`, `isCents`, `roundHalfUp`, `add(...)`, `sum([])`, `sub`, `mul(cents, factor, round?)`, `percent(cents, pct)`, `fromEuro`, `roundToStep(cents, step)` (al più vicino), `formatEuro`. `formatEuro` è scritto a mano (non `Intl`) per un output identico in Node/browser/PDF: punto delle migliaia anche sotto 10 000, virgola, due decimali e **spazio non separabile** (`EURO_SEPARATOR`, U+00A0) prima di `€` — i test confrontano `"4.730,00 €"` normalizzando lo spazio. `add` collide con `add` di `math/vec3` nel barile `@/domain`: `pricing/index.ts` espone il modulo come namespace `money` (più `formatEuro`, `roundToStep`, `Cents` diretti). `canonicalJson` (+ `canonNumber`) spostato in `domain/math/canonical.ts` e riesportato da `geometry/cache.ts` (`stableHash` resta in geometria).
- Nota sui test: sotto carico (macchina condivisa) `configuratore-store.test.ts` "l'assieme si genera sempre" può superare il timeout di 5 s nel run completo (da solo ~1,4 s); è preesistente e non legato a questa change.
- **Schema del listino (2.2)**: `pricing/types.ts`. Convenzioni: importi e prezzi unitari in centesimi interi ≥ 0 (`pricePerM3` = cent/m³, `pricePerMl` = cent/ml, `pricePerM2Cents`), lunghezze in mm, tempi in minuti (`…Min`) o ore, percentuali come numeri (15 = 15%, margini fino a 1000, il resto ≤ 100); chiavi di sezione in forma canonica `"b×h"` (`80x160` è rifiutata); id in kebab minuscolo. Aggiunte rispetto all'elenco del task: `currency: "EUR"` (default), `stockLengths[sez][i].qualities?` (lunghezza disponibile solo per alcune qualità: è così che il 13 500 vale "solo lamellare"), priorità del prezzo della barra **`priceCents` della lunghezza > `pricePerMl[sez]` > `pricePerM3[specie][qualità]` × volume**; `panelsPerM2` è indicizzato per **tipo di pezzo** (oggi `grigliato`) con area = lunghezza × lato maggiore della sezione; `treatments`/`coverings` = `{id, label, pricePerM2Cents}`; `discounts` = catalogo `{id, label, kind: percento|fisso, value}` richiamabile dalle opzioni per id (o sconto manuale inline); `vatRates` = `{id, label, pct}` con `defaultVat` = id; zone con `capPrefixes` di 1–5 cifre, prefisso duplicato tra zone rifiutato (in uso vincerà il più lungo), `fallbackZone` = nome di una zona esistente. Le chiavi di `perType`, `minPerPiece`, `minPerJoint`, `minPerHardware` sono validate contro `MACHINING_TYPES`, `PIECE_FAMILIES`, `JOINT_TYPES`, `HARDWARE_KINDS` ma sono **parziali** (voce assente ⇒ avviso `tariffa-mancante` nel motore, non errore di schema). Regole di complicazione: fattori numerici solo con `>`, `>=`, `==` e valore numerico; `access`/`anchoring` solo con `==` (valore) o `in` (elenco) tra i valori ammessi; `effect.value` ≥ 0 (centesimi interi per `fisso`); `enabled` default `true`. I nomi dei fattori (`NUMERIC_SITE_FACTORS`, `ACCESS_LEVELS`, `ANCHORING_KINDS`, tipo `SiteFactors`) sono definiti qui perché lo schema li valida; il calcolo resta a 4.1. Errori: `parsePriceList` lancia `PriceListError` (sottoclasse di `ValidationError`, issue `{path, message}` con percorsi `formatPath`, es. `transport.zones[1].priceCents`); `safeParsePriceList` restituisce `{ok, value | issues}` per repository e form. `PriceListVersion {id, version, effectiveFrom "AAAA-MM-GG", status bozza|attiva|archiviata}`; `selectVersion(versions, date)` = ultima `attiva` con `effectiveFrom ≤ data`, a parità di data il numero più alto; `versionLabel` → `listino v1 del 2026-01-01`. In `types.ts` stanno anche `PricingOptionsSchema` (`species, quality, treatment?, covering?, vat?, discounts?, cap?, km?, access = facile, anchoring?, date?`), i tipi del piano di taglio (`CutDemand`, `StockOption`, `CutOptions`, `CutBar`, `CuttingPlan`) e del preventivo (`QuoteLine`, `QuoteGroup`, `QuoteTotals`, `PricingWarning {code, message, ref?, blocking}`, `Quote`; categoria `iva` aggiunta all'elenco di P1 per una riga IVA esplicita). `Quote` è una bozza di forma: il gruppo 4 può estenderla (piano di taglio, fattori).
