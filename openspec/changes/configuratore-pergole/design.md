# Design

## Context

Vedi `proposal.md` – Why per la motivazione. Stato attuale e vincoli che guidano il design:

- App Next.js 14 App Router + TypeScript strict, Tailwind, shadcn/ui (card, input, select, tabs, dialog, toast, badge, checkbox, popover, command). Route group `(app)` con `Sidebar` (`src/components/layout/sidebar.tsx`, array `navItems`) e `NavHeader` che deriva il titolo dal primo segmento del path. Alias `@/*` → `src/*`.
- Nessun DB, nessuna auth, nessun test runner. Dipendenze già presenti riusabili: `zod` (validazione JSON), `@tanstack/react-query` (non necessario qui), `lucide-react` (icone).
- Il prodotto deve generare geometria B-rep reale (non solo mesh) perché il file SAT verso la CNC descrive solidi con facce analitiche; la macchina/CAM di destinazione non è nota.
- Lavoro svolto in autonomia da subagenti: ogni modulo deve essere piccolo, con confini chiari e test eseguibili in isolamento (`vitest`), e `npm run build` deve restare verde a ogni task.

## Goals / Non-Goals

**Goals:**
- Core di dominio puro TS (`src/domain`) senza dipendenze da React, DOM, Three o OCCT: tipologie, regole, ingombro, assieme, serializzazione. Testabile al 100% in Node.
- Kernel geometrico isolato in un Web Worker, consumato tramite un'interfaccia asincrona a messaggi; l'app funziona (in modalità "box") anche se il kernel non parte.
- Export SAT prodotto da un writer nostro, deterministico e testabile senza kernel (riceve una B-rep neutra), con opzioni configurabili.
- Aggiungere una tipologia = aggiungere un file template in `src/domain/typologies/templates/` e registrarlo.
- Aggiungere/modificare una regola = modificare un file dati in `src/domain/rules/data/`.

**Non-Goals:**
- Calcolo strutturale normativo (NTC/Eurocodice 5): le regole sono tabelle aziendali empiriche, non verifiche agli stati limite.
- Persistenza server o multiutente: la configurazione vive nel browser e in file JSON.
- Rilievo automatico dell'ingombro (foto, LiDAR, import DWG): inserimento manuale.
- Supporto nel writer SAT di superfici diverse da piane e cilindriche (NURBS, tori, sfere) nell'MVP.
- Generazione di programmi CNC (G-code, BTL): si esporta solo il CAD 3D; il CAM della macchina fa il resto.
- Preventivazione/prezzi.

## Decisions

### D1. Architettura a tre strati: dominio puro → geometria → presentazione/export

```
src/domain/           core puro TS (nessun import da react/three/replicad)
  components/         catalogo primitivi, sezioni, lavorazioni, giunti, serializzazione (zod)
  typologies/         registro + templates/ (addossata-monofalda.ts, autoportante-bifalda.ts)
  rules/              motore regole + data/ (default-lovato.ts, tabella luci)
  envelope/           ingombro, ostacoli, pavimento, collisioni (OBB), fit
  assembly/           tipo Assembly, generazione, id, trasformazioni, bounding box
  math/               vettori, matrici 4×4, OBB/AABB, interpolazione
src/geometry/         kernel OCCT: worker, protocollo messaggi, costruzione solidi, mesh, B-rep neutra, cache
src/export/           sat/ (writer ACIS + validatore + confronto), step/, csv/, zip/
src/stores/           zustand store configuratore (persist in localStorage)
src/components/configuratore/   form, viewer (r3f), pannelli, dialoghi
src/app/(app)/configuratore/page.tsx
```

**Perché**: il valore (regole, geometria parametrica, adattamento) deve essere testabile senza browser né WASM; la UI e il kernel sono sostituibili. Alternativa scartata: costruire tutto dentro componenti React/r3f (veloce all'inizio, non testabile, non riusabile per un futuro backend o CLI).

Un lint rule (eslint `no-restricted-imports`) vieta a `src/domain/**` di importare `react`, `three`, `replicad`, `@react-three/*`.

### D2. Modello dati: primitivi + lavorazioni + giunti + template di tipologia

- **Pezzo** (`Piece`): `{ id, type, family, section:{b,h}, length, pose, label, machinings[] }`. Il sistema locale del pezzo ha l'asse X lungo la lunghezza, Y = base della sezione, Z = altezza della sezione; `pose` è una matrice 4×4 (o `{origin, xAxis, zAxis}`) verso il sistema assieme.
- **Lavorazione** (`Machining`): unione discriminata su `type` (`mezzo-legno | tenone | mortasa | becco-uccello | foro | taglio-testa`), con parametri in mm/gradi, `at` (posizione lungo X), `face` (riferimento). Ogni tipo ha uno schema zod e una procedura di costruzione nel kernel.
- **Giunto** (`Joint`): `{ type, pieceA, pieceB, params }` → espande in lavorazioni complementari su entrambi i pezzi (il dominio calcola le posizioni di incrocio dalle pose). I giunti sono dati nell'assieme ma la geometria finale è solo nelle lavorazioni espanse.
- **Template di tipologia**: oggetto TS tipizzato `TypologyTemplate = { slug, name, description, params: ParamSpec[], build(ctx): BuildStep[] }` dove gli step sono dichiarativi (`place`, `repeat`, `joint`, `machining`) e i valori numerici possono essere numeri o funzioni pure `(ctx) => number`.

**Perché funzioni pure invece di un mini-linguaggio di espressioni**: type-safe, zero parser da mantenere, autocompletamento, ancora "un file dati per tipologia". Alternativa scartata: JSON con espressioni stringa (`"{larghezza} - 2*{sbalzo}"`) → parser custom, errori a runtime, nessun tipo. Se in futuro serviranno template modificabili dall'utente si potrà aggiungere un adattatore JSON→step.

**Id stabili**: `<FAM>-<nn>` (`PIL-01`, `TRV-01`, `TVT-07`, `PNT-03`, `COL-01`, `CTV-02`, `BNC-01`) assegnati per ordine deterministico di generazione (fila, posizione). Garantisce diff leggibili in distinta e in SAT.

### D3. Sistema di riferimento e unità

Millimetri ovunque, numeri `number` (double). Origine all'angolo anteriore-sinistro del box ingombro a quota pavimento di riferimento 0; X = fronte (larghezza), Y = profondità (verso il muro per le addossate), Z = alto. Tolleranza geometrica 1e-6 mm per confronti; output SAT con 15 cifre significative. Angoli in gradi nelle API pubbliche, radianti solo internamente in `math/`.

### D4. Regole costruttive dichiarative

`RuleSet = { id, rules: Rule[] }` con `Rule` unione discriminata su `kind`: `max-span-by-section`, `max-joist-spacing`, `max-overhang`, `min-clear-height`, `slope-range`, `min-section`. Il motore (`evaluateRules(assembly, params, ruleSet)`) itera i pezzi e produce `Violation { ruleId, severity, message, pieceIds, measured?, limit? }`. Le misure (luce effettiva, interasse effettivo, altezza libera) sono calcolate da `assembly/measures.ts` a partire da pezzi e pose, non dai parametri di input, così le regole restano valide per qualsiasi tipologia.

**Auto-dimensionamento** (`autoSize`): strategia greedy e locale – per `max-span-by-section` sceglie la sezione commerciale più piccola in tabella (stessa base se disponibile) che rispetta la luce; per `max-joist-spacing` calcola `ceil(utile / max)` campi e l'interasse esatto; per `min-section` alza alla minima. Restituisce `Proposal[]` da applicare ai parametri; non muta l'assieme. Alternativa scartata: ottimizzazione globale (costo/legno minimo) – fuori scope, lasciata a evoluzioni.

**Valori di default** in `rules/data/default-lovato.ts` marcati `// DA VALIDARE CON UFFICIO TECNICO`: pendenza 5–35°, altezza libera minima 2100, sbalzo max 800, interasse travetti max 800, tabella luci per sezioni di catalogo.

### D5. Ingombro, pavimento, collisioni, adattamento

- **Ostacoli** espressi relativi a un lato (`side`) e convertiti in AABB assoluti con `toAbsoluteBox(envelope, obstacle)`.
- **Pavimento**: quote ai 4 angoli + punti extra. Senza punti extra → interpolazione bilineare. Con punti extra → triangolazione Delaunay (Bowyer–Watson, implementata in `math/delaunay.ts`, insieme piccolo di punti) di angoli+extra e interpolazione baricentrica per triangolo. Passa esattamente per i punti, è deterministica e continua. Alternativa scartata: IDW (non passa esattamente, "crateri").
- **Collisioni**: ogni pezzo come OBB (dalla posa e da sezione×lunghezza, lavorazioni ignorate: conservativo); test OBB–AABB con Separating Axis Theorem in `math/obb.ts`; "interno all'ingombro" = tutti gli 8 vertici dentro il box (con tolleranza). Alternativa scartata: booleane OCCT per collisioni esatte – lente, dipendono dal worker, e l'approssimazione a box è conservativa e sufficiente.
- **Adattamento** (`fitToEnvelope`): ricerca per bisezione sulle dimensioni libere nell'ordine altezza → profondità → larghezza, partendo dal box ingombro; a ogni candidato rigenera l'assieme, valuta regole (solo `errore`) e collisioni; passo minimo configurabile (50 mm). Registra la causa dell'arresto (ostacolo/regola). Complessità O(log n) rigenerazioni per dimensione: istantaneo per il dominio puro.

### D6. Kernel geometrico: replicad + opencascade.js in Web Worker

- Dipendenze: `replicad` (API ergonomica) + `replicad-opencascadejs` (build WASM dedicata, ~10 MB). WASM copiato in `public/occt/` e caricato con `locateFile`; lazy al primo uso della pagina configuratore.
- Worker creato con `new Worker(new URL("./kernel.worker.ts", import.meta.url), { type: "module" })` (supporto nativo webpack 5 in Next 14). Protocollo messaggi tipizzato nostro (`{ id, kind: "build", payload }` / `progress` / `result` / `error`) con `AbortController`-like per annullamento: una richiesta nuova invalida la precedente (il worker scarta i risultati con id superato). Alternativa scartata: `comlink` – comodo ma nasconde l'annullamento e il progress streaming.
- Costruzione: `makeBaseBox(section, length)` → per ogni lavorazione un `cut` con il solido-utensile (prisma per mezzo legno/tenone/mortasa/becco d'uccello, cilindro per fori, semispazio per tagli di testa). Le lavorazioni sono costruite in locale pezzo; la posa si applica solo nell'export/viewer (così la cache funziona).
- **Cache**: chiave = hash stabile di `{type, section, length, machinings}`; i travetti identici condividono un solido.
- **Output per pezzo**: `{ pieceId, mesh: {positions, normals, indices}, brep: NeutralBrep, error? }`. `NeutralBrep` è estratta esplorando la `TopoDS_Shape` (TopExp_Explorer face→wire→edge→vertex, `BRepAdaptor_Surface().GetType()` per classificare `Plane`/`Cylinder`, `BRepAdaptor_Curve` per `Line`/`Circle`), con normali orientate secondo `face.Orientation()`.
- **Fallback**: se il worker fallisce l'init, lo store espone `kernelStatus = "unavailable"` e il viewer disegna box; gli export CAD restano disabilitati.
- Test del kernel: suite vitest separata (`npm run test:geometry`) con ambiente Node che carica il WASM; esclusa dal `test` rapido perché lenta (secondi di init).

### D7. Writer SAT (ACIS testuale) proprietario

- Input: `NeutralBrep[]` + pose + opzioni. Nessuna dipendenza da OCCT (OCCT non scrive SAT).
- Struttura file: header 3 righe (`<ver> <nrec> <nbody> <hist>`, `<nent> 0 0 0` o riga prodotto `@N ...`, `1 9.9999999999999995e-007 1e-010`), record entità `-<idx> <type> $<attrib> ... #`, chiusura `End-of-ACIS-data`. Topologia completa `body → lump → shell → face → loop → coedge → edge → vertex → point`, geometria `plane-surface`, `cone-surface` (cilindro = cono con semiangolo 0: `sin=0 cos=1`), `straight-curve`, `ellipse-curve` (cerchio = ellisse rapporto 1). Nome body tramite `string_attrib-name_attrib-gen-attrib` (opzionale).
- **Versione default 7.0**: layout record stabile, ampiamente importato da CAD/CAM legacy e moderni; elenco selezionabile `["4.0","7.0","21.0"]` con differenze (campo history/`$-1` aggiuntivo per ≥ 7.0, formato header) isolate in `sat/versions.ts`. Solo 7.0 è coperta da test strutturali completi nell'MVP.
- Numeri: `toPrecision(15)` senza esponente dove possibile; coordinate trasformate nel sistema assieme prima della scrittura.
- **Validatore interno** (`sat/validate.ts`): parsa il file prodotto, verifica conteggi, integrità dei `$ref`, raggiungibilità dal body, chiusura dei loop (ogni coedge ha `next`/`prev`/`partner` coerenti). Usato nei test e offerto nella UI come "verifica file".
- **Confronto con campione** (`sat/compare.ts`): dato un `.sat` della CNC, estrae versione, unità, tipi di entità e attributi e li confronta con i nostri, suggerendo le opzioni.
- Alternativa scartata: convertitore esterno (es. servizio CAD cloud) – costo, latenza, dipendenza; o esportare solo STEP – la CNC richiede SAT.

### D8. STEP, CSV, ZIP

- STEP via replicad (`exportSTEP` / `blobSTEP`) di un compound con un solido per pezzo, nomi impostati su `TDataStd_Name` quando l'API lo permette; altrimenti nome nel label del prodotto.
- CSV con `;`, UTF-8 BOM, decimali con virgola (Excel italiano). Raggruppamento per chiave `{type, section, length, machinings-hash}`.
- ZIP con `fflate` (piccola, sincrona, senza worker) per la modalità un-file-per-pezzo.

### D9. Viewer react-three-fiber + drei

`@react-three/fiber` + `@react-three/drei` (OrbitControls, Grid, Html per etichette, Bounds per "inquadra tutto", GizmoHelper). Un `<PieceMesh>` per pezzo, `BufferGeometry` costruita dalle mesh del worker; `meshStandardMaterial` colorato per famiglia, rosso per collisioni/errori. Ostacoli come `boxGeometry` trasparenti, ingombro come `edgesGeometry`, pavimento come griglia di triangoli da `quotaPavimento`. Le quote con `Html` + linee. Scene e camera in mm (Three accetta scale arbitrarie; near/far impostati di conseguenza). Dinamico `next/dynamic(..., { ssr:false })` per il canvas.

### D10. Stato client con zustand

`useConfiguratoreStore` con slice: `config` (tipologia, params, envelope, exportOptions, `schemaVersion`), `derived` (assembly, violations, collisions – ricalcolati in modo sincrono a ogni cambio di `config` tramite un selettore memoizzato o `subscribe`), `kernel` (status, progress, results per pieceId). Middleware `persist` su `config` soltanto (localStorage, chiave `lovato-configuratore-v1`). Salva/carica JSON = `JSON.stringify(config)` / parse con schema zod `ConfigFileSchema` (con `schemaVersion` e funzioni di migrazione). Alternativa scartata: `useReducer` + Context – più boilerplate per store cross-componente; React Query non adatto a stato locale derivato.

### D11. Test con vitest

- `vitest` + `@vitejs/plugin-react` non necessario per il dominio (ambiente `node`). Config `vitest.config.ts` con alias `@/*`, `include: ["src/**/*.test.ts"]`, esclusione `*.geometry.test.ts` dal progetto rapido e progetto separato per il kernel.
- Script: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:geometry": "vitest run --project geometry"`.
- Fixture di riferimento: un assieme monofalda e uno bifalda "golden" serializzati in JSON sotto `src/domain/__fixtures__/` per test di regressione della generazione.
- `tsconfig.json`: aggiungere `"types": ["vitest/globals"]` solo se si usano i globals; preferire import espliciti da `vitest`.

### D12. Convenzioni UI

- shadcn/ui esistente + componenti da aggiungere via CLI quando mancanti (`slider`, `switch`, `accordion`, `scroll-area`, `tooltip`, `alert`). Icona sidebar `Ruler` (lucide). Stringhe UI in italiano. Il `NavHeader` mostrerà automaticamente "CONFIGURATORE".
- Form controllato dallo store; validazione inline con i `ParamSpec` del template (min/max/step/unità) senza libreria form aggiuntiva.
- Nomi file download secondo la spec `export-cnc`.

### D13. Build Next.js e asset WASM

- `next.config.js`: nessun flag sperimentale; WASM servito da `public/occt/` tramite script `postinstall`/`prebuild` che copia `replicad-opencascadejs/*.wasm` (script `scripts/copy-occt-wasm.mjs`). Alternativa scartata: `asyncWebAssembly` di webpack – bundle enorme, problemi con il worker.
- Il worker e tutto `src/geometry/**` non devono mai essere importati da componenti server: solo da client component dinamici.
- `three` e r3f aggiungono peso: la pagina configuratore è caricata con `next/dynamic`, le altre pagine restano leggere.

## Risks / Trade-offs

- [CAM della CNC sconosciuto: il SAT prodotto potrebbe non importare] → opzioni configurabili (versione, un file per pezzo, attributi), validatore interno, strumento di confronto con SAT campione; task esplicito di validazione manuale con un file campione prima della produzione; STEP come piano B.
- [Writer SAT scritto a mano senza lettore di riferimento in OCCT] → test strutturali rigorosi (conteggi, riferimenti, chiusura loop), fixture da specifica ACIS pubblica, verifica manuale importando in un CAD gratuito che legge SAT (es. FreeCAD con plugin, Onshape, Fusion 360).
- [Valori delle regole costruttive non confermati] → file dati marcato "da validare"; nessuna logica cablata; task finale di revisione con l'ufficio tecnico.
- [WASM OCCT pesante (~10 MB) e init lento (1–3 s)] → lazy load solo in `/configuratore`, cache HTTP lunga su `public/occt/`, modalità box immediata, progress visibile.
- [Booleane OCCT possono fallire su geometrie coincidenti (facce complanari)] → tolleranza/offset di 0,01 mm sugli utensili di taglio; errore per pezzo non bloccante; test del kernel su ogni tipo di lavorazione.
- [Collisioni a box ignorano le lavorazioni] → conservativo (falsi positivi marginali, nessun falso negativo); documentato; tolleranza configurabile.
- [Template come codice TS, non editabili dall'utente] → accettato nell'MVP; struttura step dichiarativa permette un futuro adattatore JSON.
- [Prestazioni della rigenerazione a ogni keystroke] → dominio puro in microsecondi; il kernel è debounced (300 ms) e annullabile.
- [`npm run build` rotto da import Three/WASM in SSR] → `dynamic(..., {ssr:false})`, test di build in ogni task UI.

## Migration Plan

Funzionalità additiva, nessuna migrazione dati. Deploy standard (`npm run build`). Rollback = revert del branch. La chiave localStorage è versionata (`lovato-configuratore-v1`) e il file JSON ha `schemaVersion`; cambi di schema futuri aggiungono una funzione di migrazione.

## Open Questions

- Valori definitivi delle tabelle luci/interassi/sbalzi e delle sezioni a catalogo (ufficio tecnico Lovato). Non cambiano specs né struttura: sono dati.
- Marca/modello della CNC e del CAM, e un file SAT campione accettato: determinano solo la versione ACIS e le opzioni di default.
- Convenzioni aziendali di nomenclatura dei pezzi in produzione (prefissi, numerazione) da riflettere negli id: oggi `PIL-01` ecc.
- Se servirà STEP AP242 con PMI o basta AP214: oggi AP214 di default.

## Note di implementazione

- **Vitest 3.2** (non 2.x): necessario per i `projects` inline in `vitest.config.ts` che il task 7.3 userà per la suite `geometry` (`--project geometry`). `test.exclude` include `**/node_modules/**` oltre a `**/*.geometry.test.ts`.
- **Lint dominio**: override in `.eslintrc.json` per `src/domain/**` con `paths` (`react`, `react-dom`, `three`, `replicad`, `replicad-opencascadejs`) e `patterns` (`react/*`, `react-dom/*`, `three/*`, `replicad/*`, `@react-three/*`).
- **Cartelle D1**: `index.ts` con `export {};` nei moduli (`domain/{math,components,typologies,rules,envelope,assembly}`, `geometry`, `export/{sat,step,csv,zip}`, `stores`); `.gitkeep` in `typologies/templates`, `rules/data`, `__fixtures__`, `components/configuratore`.
- **`Mat4`**: array di 16 numeri **per righe** (`m[r*4+c]`), vettori colonna (`p' = M·p`), `multiply(a,b)` applica prima `b`. Rotazioni in **radianti** (helper `degToRad`/`radToDeg`); `fromBasis(origin, xAxis, zAxis)` ricava Y = Z × X. `axisOf`/`originOf` estraggono assi e origine della posa.
- **Convenzione locale del pezzo** assunta in `obbFromPose(pose, size, localMin?)`: X da 0 a lunghezza, sezione centrata sull'asse X (`localMin = (0, −b/2, −h/2)`); sovrascrivibile con `localMin` se il task 3.1 sceglie diversamente.
- **Profondità di penetrazione**: minima sovrapposizione sugli assi (AABB) o sui 15 assi SAT (OBB–AABB); > 0 compenetrazione, 0 contatto, < 0 separazione. `aabbIntersects`/`obbIntersectsAabb` sono stretti: il contatto non è collisione (profondità ≤ tol).
- **Interpolazione**: `bilinear` e `interpolateAt` restituiscono `{ value, outside }`. Fuori dal dominio: bilineare clampa sul bordo del rettangolo; Delaunay proietta sullo spigolo di bordo più vicino dell'involucro convesso e interpola lungo lo spigolo. `triangulate` accorpa punti con stesse (x,y) (vince l'ultimo) e lancia errore per < 3 punti o punti allineati.
