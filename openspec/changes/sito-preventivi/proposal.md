# Proposal

## Why

Il configuratore (`configuratore-pergole`, `tipologie-estese`) genera pergole, le adatta all'ingombro e produce il CAD per la CNC, ma vive solo come strumento interno senza prezzi, senza persistenza e senza accesso dal web. Lovato Legnami vuole **pubblicarlo su un sito**: il cliente finale deve configurare la sua pergola in modo guidato, vedere un prezzo indicativo credibile e lasciare una richiesta; l'ufficio deve ricevere la richiesta già pronta per il configuratore interno e il SAT. Perché il prezzo sia credibile servono regole di costo esplicite — legno con **sfridi reali** da ottimizzazione di taglio sulle lunghezze commerciali, lavorazioni CNC, ferramenta, trattamenti, copertura, **montaggio** con le sue **complicazioni** (fuorisquadra, pavimento in pendenza, ostacoli, altezza, accesso), trasporto, margini e IVA — gestite da un **back-office semplice** in cui l'ufficio imposta e pubblica listini e regole senza toccare il codice.

## What Changes

- **Motore di preventivazione** puro TS (`src/domain/pricing`): da assieme + ingombro + opzioni commerciali produce un preventivo deterministico a righe spiegabili (quantità, unità, prezzo unitario, importo, motivazione), con doppia vista: dettagliata per l'ufficio, semplificata per il cliente. Valori tutti **dati versionati** (listino con data di validità), nessun numero cablato.
- **Ottimizzazione di taglio 1D** (`cutting-stock`): i pezzi sono assegnati a barre commerciali (lunghezze configurabili per sezione, spessore lama, rifili di testa, sfrido minimo riutilizzabile) con un algoritmo di bin packing migliorato; il preventivo addebita le barre consumate e riporta la percentuale di sfrido e gli spezzoni riutilizzabili.
- **Fuorisquadra** come estensione del dominio: l'ingombro acquisisce una **pianta quadrilatera** (muro non ortogonale, misurata dal cliente con le due diagonali o dall'ufficio con gli angoli); le tipologie addossate tagliano banchina e teste dei travetti sul piano reale del muro (`headCutFromPlane`); collisioni e adattamento lavorano sul prisma della pianta. Il preventivo legge da ingombro e assieme i **fattori di cantiere** (deviazione dallo squadro, pendenza e dislivello del pavimento, numero di ostacoli, altezza massima, accesso) su cui agiscono le regole di complicazione.
- **Persistenza** con Postgres via Drizzle ORM (produzione: provider dal Marketplace Vercel; sviluppo e test: PGlite in-process, nessun servizio esterno), migrazioni, seed dai file dati attuali (`default-lovato.ts`, catalogo ferramenta, sezioni, preset).
- **Autenticazione e ruoli** (`admin`, `ufficio-tecnico`, `commerciale`) per l'area interna e l'area admin; l'app interna oggi aperta diventa protetta. **BREAKING**: `/` non reindirizza più a `/dashboard` ma mostra il sito pubblico; le pagine interne richiedono il login.
- **Back-office `/admin`** semplice: tabelle e form shadcn per listini (legno, lunghezze commerciali, lavorazioni, ferramenta, trattamenti, coperture, manodopera, complicazioni, trasporto, margini/IVA), regole costruttive (l'attuale `default-lovato`), visibilità e testi delle tipologie sul sito, preset, utenti; import/export CSV dei listini; "Simula preventivo"; versioni **bozza → attiva** con data di validità; registro modifiche (chi, cosa, quando); elenco richieste e preventivi.
- **Sito pubblico `(site)`** con identità visiva propria (brand Lovato Legnami, legno e artigianato, tipografia curata) costruita sugli stessi token Tailwind/shadcn: home, pagine tipologie con miniature/3D, galleria, privacy; SEO, accessibilità, prestazioni; in italiano.
- **Wizard preventivo** per il cliente finale: tipologia → misure → spazio disponibile (muro, fuorisquadra, pavimento, ostacoli in termini semplici) → copertura e finiture → riepilogo 3D con prezzo indicativo e scomposizione semplificata → richiesta. Riusa dominio e viewer; funziona senza WASM (modalità box), il kernel è opzionale e su richiesta.
- **Richieste di preventivo**: form contatti con consenso GDPR e foto opzionali, salvataggio in DB con istantanea di configurazione, listino e scomposizione; PDF riepilogo; email a cliente e ufficio tramite provider sostituibile; l'ufficio apre la richiesta nel configuratore interno (`/configuratore?richiesta=<id>`) e produce SAT e preventivo definitivo. Il sito pubblico **non espone mai** SAT/STEP, costi interni, margini o listini.
- **Configuratore interno**: pannello "Preventivo" con vista ufficio (righe, piano di taglio, complicazioni), regole costruttive e listino caricati dalla versione attiva in DB (file TS come seed e ripiego).
- **Deploy** su Vercel (runtime Node, nessuna edge function salvo il redirect di autenticazione), variabili d'ambiente documentate, WASM OCCT servito come asset statico con cache lunga, budget prestazionale, analytics opzionale.

## Capabilities

Dipendenze: `configuratore-pergole` (completata) e `tipologie-estese` (in corso: ferramenta `Assembly.hardware`, metadati `category`/`tags` dei template, preset). Nessuna spec è ancora archiviata in `openspec/specs`, quindi anche le estensioni di capability esistenti usano solo requisiti **ADDED** con nomi distinti, come in `tipologie-estese`.

### New Capabilities

- `preventivazione`: motore di prezzo deterministico e spiegabile (legno, sfridi, lavorazioni CNC, ferramenta, trattamenti, copertura, montaggio, complicazioni, trasporto, sconti, margini, IVA, arrotondamenti, minimo d'ordine) con viste cliente/ufficio e listini versionati con data di validità.
- `ottimizzazione-taglio`: assegnazione dei pezzi alle lunghezze commerciali (cutting stock 1D) con lama, rifili e sfrido minimo riutilizzabile; piano di taglio, barre consumate, sfrido percentuale.
- `listini-versionati`: insiemi di dati configurabili (listini, regole costruttive, regole di complicazione, impostazioni tipologie, preset) con versioni bozza/attiva/archiviata, data di validità, pubblicazione, registro modifiche, import/export CSV.
- `persistenza-dati`: schema Postgres (Drizzle), migrazioni, seed dai dati di dominio, PGlite per sviluppo e test, istantanee riproducibili dei preventivi.
- `autenticazione-ruoli`: accesso degli utenti interni con ruoli e protezione di area interna, area admin e API.
- `back-office-admin`: area `/admin` con form e tabelle per tutti i dati configurabili, simulazione preventivo, gestione richieste/preventivi e utenti.
- `sito-pubblico`: sito marketing con identità visiva propria, pagine tipologie e galleria, SEO, accessibilità, prestazioni e separazione da ogni dato interno.
- `wizard-preventivo`: configuratore guidato per il cliente finale con riepilogo 3D e prezzo indicativo.
- `richieste-preventivo`: raccolta, salvataggio, notifica e lavorazione delle richieste di preventivo fino al preventivo definitivo dell'ufficio.
- `hosting-e-distribuzione`: deploy su Vercel, variabili d'ambiente, asset WASM, migrazioni in rilascio, budget prestazionale.
- `ingombro-cliente` (estensione della capability di `configuratore-pergole`): pianta quadrilatera / muro fuori squadra, fattori di cantiere.
- `tipologie-copertura` (estensione): tipologie addossate che seguono il piano reale del muro.
- `regole-costruttive` (estensione): set di regole caricato dalla versione attiva con ripiego sul file dati.
- `configuratore-ui` (estensione): pannello preventivo con vista ufficio e apertura di una richiesta.

### Modified Capabilities

Nessuna: non esistono spec archiviate in `openspec/specs`.

## Impact

- **Codice nuovo**: `src/domain/pricing/**` (tipi listino, cutting stock, fattori di cantiere, motore, viste), `src/domain/envelope/plan.ts`, `src/db/**` (schema Drizzle, migrazioni, seed, client), `src/server/**` (auth, email, upload, pdf, repository, azioni server), `src/app/(site)/**`, `src/app/(admin)/admin/**`, `src/app/api/{preventivo,admin}/**`, `src/components/site/**`, `src/components/admin/**`, `src/components/preventivo/**` (pannello interno), `src/stores/wizard-store.ts`, `middleware.ts`, `drizzle.config.ts`, `vercel.json`.
- **Codice modificato**: `src/app/page.tsx` (home pubblica), `src/app/(app)/layout.tsx` (sessione), `src/domain/envelope/{types,collisions,fit}.ts` (pianta), `src/domain/typologies/templates/{addossata-*,a-elle}.ts` e `template.ts` (`BuildOptions.wallPlane`), `src/stores/{config,configuratore-store}.ts` (quote, caricamento richiesta, regole da DB), `src/components/configuratore/**` (pannello preventivo), `next.config.js` (header cache `/occt/*`), `vitest.config.ts` (progetto `db`), `package.json`.
- **Dipendenze nuove**: `drizzle-orm`, `drizzle-kit`, `pg`, `@electric-sql/pglite`, `next-auth@5` (Auth.js) con `@auth/drizzle-adapter`, `resend` (email, sostituibile), `@react-pdf/renderer` (PDF, runtime Node), `@vercel/blob` (foto, opzionale), `@vercel/analytics` (opzionale), font via `next/font`.
- **Sistemi esterni**: Vercel (hosting), Postgres gestito (Neon via Marketplace, da confermare), provider email (Resend, da confermare), storage foto (Vercel Blob, da confermare). Tutti dietro adattatori sostituibili con implementazioni locali per sviluppo/test.
- **Dati**: tutti i valori di listino e le regole di complicazione sono **segnaposto plausibili** marcati `DA VALIDARE CON UFFICIO TECNICO`/commerciale; il back-office esiste proprio per sostituirli senza rilasci.
- **Sicurezza/privacy**: dati personali dei clienti in DB (GDPR: consenso registrato, informativa, cancellazione su richiesta dall'admin); nessun dato interno nelle risposte pubbliche (test automatici sulla forma della risposta).
