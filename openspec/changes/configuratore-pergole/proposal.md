# Proposal

## Why

Lovato Legnami oggi progetta pergole e tettoie in legno a mano: rilievo dell'ingombro dal cliente, dimensionamento con regole "in testa" al tecnico, disegno CAD manuale e infine preparazione del file per la macchina CNC. Il processo è lento, dipende da poche persone e ogni variante (pendenza, interasse, ostacoli in cantiere) riparte quasi da zero. Un configuratore web che disegna la pergola in 3D, applica le regole costruttive aziendali, la adatta all'ingombro del cliente ed esporta direttamente il CAD 3D in formato SAT per il centro di lavoro riduce il ciclo preventivo→produzione da giorni a minuti e rende il know-how costruttivo esplicito e riusabile.

## What Changes

- Nuova pagina `/configuratore` nell'app (route group `(app)`, voce in sidebar) con form parametrico, anteprima 3D e pannello esportazioni.
- Nuovo **dominio puro TypeScript** (indipendente da UI e kernel geometrico) che modella:
  - componenti primitivi (pilastro, trave, travetto/arcareccio, puntone, colmo, controvento/saetta, banchina a muro) con sezione e lunghezza;
  - libreria di giunti/lavorazioni (mezzo legno, tenone-mortasa, taglio a becco d'uccello/gronda, fori ferramenta, tagli di testa inclinati);
  - tipologie di copertura come **template dati** che compongono primitivi e giunti; MVP: addossata monofalda e autoportante bifalda; struttura pronta per piana, padiglione, a L, lamellare come sole aggiunte dati.
- **Regole costruttive dichiarative** (dati, non codice sparso): luce massima per sezione, interasse massimo travetti, sbalzo massimo, altezza libera minima, intervallo di pendenza, sezioni minime. Violazioni riportate all'utente; auto-dimensionamento dove possibile.
- **Ingombro del cliente** inserito a mano: box base L×P×H, lista di ostacoli (box sottratti: sottomuri, finestre, grondaie, sporgenze), pavimento come quote ai 4 angoli più punti opzionali interpolati. Ogni pilastro riceve la propria lunghezza dalla quota del pavimento sotto il piede. Controllo collisioni di ogni pezzo contro ostacoli e ingombro; adattamento automatico (pergola massima nell'ingombro).
- **Kernel geometrico** B-rep (replicad / opencascade.js in WASM, dentro un Web Worker) che produce solidi reali con lavorazioni via booleane.
- **Visualizzatore 3D** react-three-fiber + drei con evidenziazione pezzi, ostacoli e collisioni.
- **Export**: SAT (ACIS testuale, writer custom, versione configurabile default 7.0, mm, un body nominato per pezzo con ID, opzione un file per pezzo o assieme intero, MVP facce piane e cilindriche), STEP (da OCCT) e distinta pezzi CSV (ID, tipo, sezione, lunghezza, quantità).
- Salvataggio/caricamento della configurazione come JSON; stato client-side (zustand).
- Introduzione di **vitest** con test unitari su motore regole, ingombro/interpolazione pavimento, generazione assieme e writer SAT. `npm run build` deve continuare a passare.

Nessuna modifica breaking: le pagine esistenti (dashboard, AI) restano invariate.

## Capabilities

### New Capabilities

- `componenti-e-lavorazioni`: catalogo dei componenti primitivi in legno (tipi, sezioni, orientamento, lunghezza) e libreria delle lavorazioni/giunti parametrici applicabili ai pezzi; definisce il modello dati di un pezzo lavorato indipendente dal kernel geometrico.
- `tipologie-copertura`: template dati che descrivono una tipologia di tetto (es. addossata monofalda, autoportante bifalda) e la generazione dell'assieme (lista pezzi posizionati + lavorazioni) a partire dai parametri; estensibilità a nuove tipologie solo per aggiunta dati.
- `regole-costruttive`: motore di regole dichiarative (luci, interassi, sbalzi, altezze, pendenze, sezioni minime), produzione di violazioni leggibili e auto-dimensionamento.
- `ingombro-cliente`: modello dell'ingombro (box, ostacoli, pavimento interpolato), lunghezza individuale dei pilastri, controllo collisioni e adattamento automatico della pergola nell'ingombro.
- `geometria-solida`: costruzione dei solidi B-rep dei pezzi (con lavorazioni booleane) tramite kernel OCCT in Web Worker, con mesh per il viewer e dati B-rep per gli export.
- `visualizzatore-3d`: viewer interattivo dell'assieme, dell'ingombro, degli ostacoli e delle collisioni.
- `export-cnc`: esportazione SAT (ACIS) per la macchina CNC, STEP e distinta CSV, con opzioni configurabili e validazione strutturale del file.
- `configuratore-ui`: pagina `/configuratore`, form parametrico, pannello violazioni, stato client-side e salvataggio/caricamento JSON.

### Modified Capabilities

Nessuna (non esistono spec preesistenti nel progetto).

## Impact

- **Codice nuovo**: `src/domain/**` (core puro TS), `src/geometry/**` (kernel + worker), `src/export/**` (SAT/STEP/CSV), `src/components/configuratore/**`, `src/app/(app)/configuratore/page.tsx`, `src/stores/configuratore-store.ts`.
- **Codice modificato**: `src/components/layout/sidebar.tsx` (nuova voce), `package.json` (dipendenze e script `test`), `next.config.js` (asset WASM e worker), `tsconfig.json` se necessario per `vitest`.
- **Dipendenze nuove**: `replicad`, `replicad-opencascadejs` (WASM), `three`, `@react-three/fiber`, `@react-three/drei`, `zustand`, `vitest`, `@vitest/coverage-v8` (dev).
- **Sistemi esterni**: macchina CNC/CAM (marca ignota) che importa SAT. Le opzioni SAT sono configurabili e il file prodotto deve essere validato contro un SAT campione accettato dalla macchina prima della messa in produzione.
- **Nessun DB né autenticazione**: la configurazione vive nel browser ed è esportabile come JSON.
