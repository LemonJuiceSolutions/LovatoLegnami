# Proposal

## Why

Il configuratore introdotto dalla change `configuratore-pergole` copre due tipologie di carpenteria tradizionale (addossata monofalda, autoportante bifalda). Il mercato di riferimento (vedi `ricerca-chepergola.md`, rilievo del catalogo chepergola.it) vende invece soprattutto pergole a **portali con trave doppia "sandwich" bullonata**, telai a **giunti metallici**, carport con **arco lamellare**, coperture alte per camper a **pilastri scalari**, **gazebo a padiglione** a 4/6/8 falde e **pensiline a sbalzo senza pilastri**. Lovato Legnami vuole preventivare e produrre su CNC anche queste tipologie e "tutte le tettoie immaginabili": serve estendere il catalogo di primitivi, lavorazioni e ferramenta e aggiungere i template, mantenendo la promessa architetturale "una tipologia = un file dati".

## What Changes

- **Nuovi primitivi** nel catalogo chiuso: `tavola` (singola tavola di una trave sandwich), `arco` (membro lamellare curvo), `cantonale` (puntone diagonale di padiglione/compluvio), `monaco` (pezzo di colmo/punta in legno per gazebo), `mensola` (trave a sbalzo incastrata a muro), `fascia` (frontalino di gronda), `grigliato` (pannello di tamponatura). I pezzi possono essere **curvi** (`curve: {radius, sweep}`), con ingombro a segmenti per collisioni e misure.
- **Nuove lavorazioni**: `asola-lama` (fresata di testa per lame a scomparsa / portapilastro a lama interna), `dardo-di-giove` (giunzione obliqua a dente tra correnti in linea). Il **taglio composto** dei cantonali e il **foro passante su più strati** non richiedono nuovi tipi: il primo è `taglio-testa` con entrambi gli angoli ricavati da un piano con un helper `headCutFromPlane`, il secondo è un giunto di ferramenta che espande `foro` su ogni strato attraversato.
- **Libreria ferramenta e ancoraggi** (dati): bulloni passanti, viti, tasselli, staffe a muro (listoni paralleli, inclinate 15°/25°, supporto a scomparsa 17°, scarpe), staffe a terra (bicchiere, P greco, lama interna, zanca), giunti metallici a 2/3/4/5 vie 90°/75°/105°, cuspidi 4/6/8 falde, piastre gazebo. Ogni voce dichiara ingombri e **regole di foratura/fresatura** che il template applica ai pezzi di legno. L'assieme acquisisce un elenco `hardware` con id stabili e la **distinta CSV** acquisisce la tabella della ferramenta.
- **Parametri a scelta** (`enum`) e **visibilità condizionata** dei parametri nei template; ogni tipologia dichiara l'**opzione costruttiva** `bullonata` (riferimento commerciale) o `carpenteria` (giunti Lovato: tenone-mortasa, mezzo legno, becco d'uccello, dardo di Giove) dove entrambe hanno senso.
- **Nuovi template**: `portale-sandwich` (libera piana/monofalda, copre standard, MAXI e pergola camper), `addossata-sandwich` (addossata con staffa a muro o banchina), `telaio-giunti` (moderna a giunti metallici, piana o 15°), `carport-arco` (arco lamellare a sbalzo), `gazebo-padiglione` (4/6/8 lati, 4 o 8 falde, cuspide metallica o monaco in legno), `pensilina-sbalzo` (mensole a muro senza pilastri), `monofalda-scalare` (pilastri a quote decrescenti e correnti giuntati), `a-elle` (due ali addossate con compluvio). La bifalda esiste già; esagonale/ottagonale sono casi di `gazebo-padiglione`.
- **Catalogo preset commerciali** derivato dalla ricerca (es. "Pergola libera 4×6", "MAXI 5×5", "Moderna 427×318", "Carport arco 5×3", "Copertura camper 404×799", "Gazebo 3,1×3,1 4 falde 25°"): configurazioni complete caricabili come punto di partenza, verificate da test contro le distinte rilevate.
- **Kernel e export**: solido dei pezzi curvi per rivoluzione della sezione (facce piane e cilindriche, già supportate dal writer SAT), utensili per `asola-lama` e `dardo-di-giove`; vincoli espliciti sulle lavorazioni ammesse sui pezzi curvi affinché il SAT resti su piane/cilindriche; la ferramenta non entra nel SAT/STEP ma nella distinta.
- **Regole**: tabelle luci/sezioni per i nuovi tipi e per le sezioni commerciali del riferimento (45×90, 45×120, 45×145, 70×70, 90×90, 38×300), coperture piane ammesse dalla regola di pendenza, pezzi curvi esclusi dalle misure di luce.
- **UI**: selettore di tipologia a schede con **miniatura isometrica generata** dall'assieme di default, filtro per categoria, selettore dei preset, campi a scelta nel form, elenco ferramenta negli esiti, pezzi curvi e simboli della ferramenta nel viewer.

Nessuna modifica breaking: le due tipologie esistenti, il formato JSON (nuovi campi opzionali) e gli export esistenti restano validi. Le fixture golden vengono rigenerate per il nuovo campo `hardware` (vuoto).

## Capabilities

Dipendenza: questa change si appoggia alle capability introdotte da `configuratore-pergole`, **non ancora archiviate in `openspec/specs`**. Per questo i delta usano solo requisiti **ADDED** (in capability omonime o nuove) con nomi distinti da quelli già definiti, così che l'archiviazione funzioni in entrambi gli ordini. L'implementazione richiede completati almeno i task 1–9 di `configuratore-pergole` (dominio, kernel, export); i task UI (10–12) sono prerequisito solo per la sezione UI di questa change.

### New Capabilities

- `ferramenta-e-ancoraggi`: libreria dati della ferramenta strutturale (bulloni, viti, tasselli, staffe a muro e a terra, giunti metallici N vie, cuspidi, piastre) con ingombri e regole di foratura/fresatura; giunti di ferramenta che espandono lavorazioni su più pezzi; elenco ferramenta dell'assieme con id stabili.
- `preset-commerciali`: catalogo di configurazioni complete (tipologia + parametri + ingombro) tratte dal riferimento commerciale, caricabili come punto di partenza e verificate contro le distinte rilevate.
- `componenti-e-lavorazioni` (estensione della capability omonima di `configuratore-pergole`): nuovi primitivi, pezzi curvi, lavorazioni `asola-lama` e `dardo-di-giove`, taglio composto ricavato da un piano.
- `tipologie-copertura` (estensione): parametri a scelta e visibilità condizionata, opzione costruttiva, metadati di catalogo, otto nuove tipologie.
- `regole-costruttive` (estensione): coperture piane, tabelle per i nuovi tipi e sezioni, esclusione dei pezzi curvi dalle luci.
- `geometria-solida` (estensione): solido dei pezzi curvi, utensili delle nuove lavorazioni, vincoli di costruibilità.
- `export-cnc` (estensione): SAT dei pezzi curvi, tabella ferramenta nella distinta, esclusione della ferramenta dal CAD.
- `configuratore-ui` (estensione): selettore tipologie con miniature, campi a scelta, selettore preset, elenco ferramenta.
- `visualizzatore-3d` (estensione): pezzi curvi e simboli della ferramenta.

### Modified Capabilities

Nessuna: non esistono ancora spec archiviate in `openspec/specs`.

## Impact

- **Codice nuovo**: `src/domain/hardware/**` (libreria, espansione, id), `src/domain/presets/**`, `src/domain/components/head-cut.ts`, `src/domain/math/{plane,arc}.ts`, otto file in `src/domain/typologies/templates/`, `src/components/configuratore/typology-picker.tsx`, `preset-picker.tsx`, `thumbnails/`.
- **Codice modificato**: `src/domain/components/{types,schemas,machinings,joints,sections,serialize}.ts` (nuovi tipi, `curve`, `hardware`), `src/domain/typologies/template.ts` (`EnumParamSpec`, `visibleWhen`, step `hardware`, metadati), `src/domain/assembly/{bounds,measures}.ts` (pezzi curvi, nuovi appoggi), `src/domain/rules/{types,engine}.ts` e `rules/data/default-lovato.ts`, `src/domain/envelope/collisions.ts`, `src/geometry/occt/build-piece.ts` (rivoluzione, nuovi utensili), `src/geometry/neutral-brep-box.ts` (B-rep di un arco in TS puro per i test SAT), `src/export/csv/distinta.ts`, `src/export/sat/index.ts` (filtro ferramenta), store e form del configuratore, fixture golden.
- **Dipendenze**: nessuna nuova libreria. Le miniature sono SVG generati in TS; nessun asset grafico esterno.
- **Dati da validare**: valori della ferramenta (ingombri dei giunti, lunghezze bulloni, fori) e delle tabelle luci per le sezioni 45×… sono tratti dal catalogo commerciale e marcati `DA VALIDARE CON UFFICIO TECNICO`.
- **Sistemi esterni**: invariati (CNC/CAM via SAT). I pezzi curvi producono facce cilindriche, già previste dalla validazione del SAT campione.
