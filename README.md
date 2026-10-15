# Lovato Legnami

Base app Next.js 14 + Tailwind + shadcn/ui. Tema, componenti UI e setup AI ereditati da ESPEIRIA (VRE).

## Avvio

```bash
npm install
npm run dev
```

Apri http://localhost:3000 → `/dashboard`.

## AI

- Impostazioni in `/ai`: provider (Anthropic, OpenAI, OpenRouter, Ollama, Claude CLI), modello, API key, Groq per la voce.
  Salvate nel `localStorage` del browser (`lovato-ai-settings`).
- Assistente flottante (pulsante in basso a destra) in ogni pagina: `src/components/ai/ai-assistant.tsx`.
- Chat SSE: `src/app/api/ai/chat/route.ts` → provider in `src/lib/llm-providers.ts`.
- System prompt: `src/lib/ai-prompts.ts`.
- Variabili opzionali: vedi `.env.example`.

## Configuratore pergole

Pagina `/configuratore`: tipologia e parametri, ingombro del cliente (box, muro, ostacoli, pavimento), regole
costruttive e collisioni in tempo reale, visualizzatore 3D ed export per la CNC (SAT per pezzo o assieme, STEP,
distinta CSV con tabella ferramenta), salvataggio/caricamento della configurazione in JSON (ripristinata anche dal
`localStorage`). La tipologia si sceglie da un selettore con miniature isometriche e filtro per categoria; "Esempi dal
catalogo" carica i preset commerciali raggruppati per tipologia.

### Tipologie

| Tipologia (`slug`) | Categoria | Note |
| --- | --- | --- |
| Addossata monofalda (`addossata-monofalda`) | addossata | banchina a muro, trave su pilastri, travetti inclinati, saette |
| Autoportante bifalda (`autoportante-bifalda`) | autoportante | colmo su puntoni a tenone e mortasa, travetti speculari |
| Portale sandwich (`portale-sandwich`) | autoportante | portali con trave doppia bullonata (o trave di carpenteria), piana o monofalda |
| Addossata sandwich (`addossata-sandwich`) | addossata | telai ortogonali al muro, travetti paralleli, staffa a muro o banchina |
| Monofalda scalare (`monofalda-scalare`) | autoportante | file di pilastri a quote decrescenti, correnti giuntati a dardo di Giove (camper) |
| Telaio a giunti metallici (`telaio-giunti`) | autoportante | griglia a sezione unica con giunti a manicotto (moderna), piana o 15° |
| Carport ad arco (`carport-arco`) | carport | sbalzo frontale su archi lamellari (pezzi curvi), staffa a P greco |
| Gazebo a padiglione (`gazebo-padiglione`) | gazebo | 4/6/8 lati, cantonali, cuspide metallica o monaco, arcarecci e grigliati |
| Pensilina a sbalzo (`pensilina-sbalzo`) | pensilina | mensole a muro senza pilastri (supporto a scomparsa, staffe o scarpa) |
| Pergola a L (`a-elle`) | addossata | due ali su due muri ad angolo, un pilastro, cantonale di compluvio |

Le tipologie con il parametro `costruzione` hanno due varianti: **bullonata** (tavole a sandwich, bulloni passanti,
staffe) e **carpenteria** (trave singola, tenoni, mezzo legno, becchi d'uccello: nessun bullone in distinta).

### Preset ed esempi

27 preset in `src/domain/presets/catalog.ts` (`PRESET_CATALOG`, `listPresets(slug?)`, `loadPreset(id)`), presi dalle
distinte di `openspec/changes/tipologie-estese/ricerca-chepergola.md`: pergole libere 3×3…4×6, addossate 2×3…4×6,
MAXI, moderne a giunti, carport 5×3…doppio MAXI 5×6, camper, gazebo a 4/8 falde e ottagonale Ø4000, pensilina,
pergola a L, più gli esempi MVP "Monofalda con grondaia" e "Bifalda libera". Ogni preset ha parametri parziali (gli
omessi prendono il default), ingombro facoltativo, `notes` (le deduzioni iniziano con `[dedotto]`) e `expected`
(pezzi per tipo e ferramenta per codice) verificati da `catalog.test.ts`. La UI li mostra da `src/stores/examples.ts`.

### Ferramenta

`src/domain/hardware/`: catalogo dati (`HARDWARE_CATALOG`, voci DA VALIDARE con la fonte) di bulloni passanti,
viti, tasselli, staffe a muro (staffe inclinate, scarpe d'ancoraggio, supporto a scomparsa), staffe a terra (bicchiere,
lama interna, P greco, zanca), giunti a N vie, cuspidi e piastre. I template la
dichiarano con lo step `hardware`, che genera i fori/asole nei pezzi e le voci di `assembly.hardware` (viti e tasselli
fusi per codice). La ferramenta non è un pezzo: niente body nel SAT/STEP; compare nella sezione "Ferramenta" degli
esiti (clic → selezione dei pezzi collegati), nel livello "Ferramenta" del 3D (bulloni, staffe, giunti) e nella
seconda tabella della distinta CSV (`Codice;Descrizione;Quantità;Pezzi`).

### Comandi

```bash
npm run dev             # copia il kernel OCCT in public/occt/ (predev) e avvia Next
npm test                # unit (dominio, export, store) + dom (componenti React, jsdom)
npm run test:geometry   # kernel OCCT reale in Node: solidi, B-rep, SAT e STEP (~2 s, limite 60 s)
npm run lint
npm run build           # copia il kernel (prebuild) e compila
```

`public/occt/` (WASM ~23 MB) è generata da `scripts/copy-occt-wasm.mjs` e non è versionata.

### Struttura

| Cartella | Contenuto |
| --- | --- |
| `src/domain/` | TypeScript puro, senza React/three/replicad (vincolo di lint): `math`, `components` (pezzi, lavorazioni, giunti, sezioni, JSON), `assembly`, `typologies` (template, mattoni duali in `templates/shared.ts`, registro), `hardware` (catalogo ed espansione della ferramenta), `presets` (catalogo commerciale), `rules` (motore, auto-dimensionamento, dati Lovato), `envelope` (ingombro, pavimento, collisioni, adattamento). Vedi `src/domain/README.md`. |
| `src/geometry/` | Kernel CAD in Web Worker (`replicad` + OpenCascade WASM): protocollo, client, cache dei solidi, costruzione dei pezzi lavorati, mesh e B-rep neutra. |
| `src/export/` | `sat/` (writer ACIS testuale, validatore, confronto con un campione: vedi `src/export/sat/README.md`), `step/` (solo nel worker), `csv/` (distinta), `zip/`, nomi file e download. |
| `src/stores/` | Store zustand: configurazione, dati derivati, kernel, esempi, file JSON; `viewer-store.ts` per il 3D. |
| `src/components/configuratore/` | UI (form parametri e ingombro, esiti, esportazioni, barra configurazione) e `viewer/` (react-three-fiber). |
| `src/app/(app)/configuratore/` | Pagina Next (componente caricato solo lato client). |
| `openspec/changes/configuratore-pergole/` | Proposta, design (con le note di implementazione), specifiche e task. |
| `openspec/changes/tipologie-estese/` | Tipologie estese, ferramenta, preset, pezzi curvi: proposta, design (note di implementazione), specifiche, task e ricerca sul catalogo. |

### Aggiungere una tipologia

1. Nuovo template in `src/domain/typologies/templates/<slug>.ts` (`TypologyTemplate`: `slug`, `name`, `params` con
   default e limiti, `build(ctx)` a step `place`/`repeat`/`machining`/`joint`), riusando `templates/shared.ts` e i
   nomi di parametro comuni (`larghezza`, `profondita`, `altezza`, `pendenza`, `interasse`, `sezione<Tipo>`), che
   regole, auto-dimensionamento e adattamento all'ingombro usano per convenzione.
2. Aggiungerlo a `BUILTIN_TEMPLATES` in `templates/index.ts`: compare da solo nel selettore della UI.
   La miniatura del selettore è generata dall'assieme di default (`thumbnails/isometric.ts`).
3. Metadati obbligatori `category` (`addossata | autoportante | carport | gazebo | pensilina`), `tags`, `reference`;
   per le due varianti dichiarare `constructionParam()` e usare i mattoni duali (`beamOnPosts`, `joistsOnBeams`,
   `wallAttachment`, `groundAnchor`); la ferramenta va solo negli step `hardware`, mai come pezzi.
4. Test del template ed eventuale fixture golden (`UPDATE_GOLDEN=1 npx vitest run src/domain/typologies/golden.test.ts`);
   `registry-estese.test.ts` controlla che con i default non ci siano errori né collisioni. Dettagli in
   `src/domain/README.md`.

### Aggiungere un preset

1. Voce in `PRESET_CATALOG` (`src/domain/presets/catalog.ts`): `id` kebab-case univoco, `name`, `typologySlug`,
   `params` parziali (validati dal template), `envelope` facoltativo, `source` e `notes` (deduzioni con `[dedotto]`).
2. `expected` con i pezzi per tipo e la ferramenta per codice della distinta di riferimento: `catalog.test.ts` verifica
   generazione senza errori, conteggi e assenza di collisioni con l'ingombro.
3. Compare da solo in "Esempi dal catalogo", nel gruppo della sua tipologia.

### Modificare o aggiungere regole

- I valori sono dati in `src/domain/rules/data/default-lovato.ts` (tabella luci per tipo e sezione, interasse,
  sbalzo, altezza libera, pendenza, sezioni minime): cambiarli non richiede toccare il motore.
- Un nuovo *tipo* di vincolo richiede: variante in `rules/types.ts` (tipo e schema zod), valutazione in
  `rules/engine.ts` ed eventualmente la risoluzione in `rules/autosize.ts`, con i test.

### Limiti noti (MVP)

- Regole e catalogo sezioni con valori **da validare con l'ufficio tecnico**.
- SAT verificato solo dal validatore interno: va provato nel CAM della CNC con un file campione (checklist in
  `src/export/sat/README.md`); solo superfici piane e cilindriche, nessuna `pcurve`. Pezzi curvi (archi del carport)
  come rivoluzione a raggio costante, con soli fori laterali e tagli di testa paralleli all'asse (sezione "Pezzi curvi"
  del README SAT): da provare nel CAM.
- STEP in AP242 (impostato da replicad), un solido nominato per pezzo.
- Mortase sempre ortogonali alla faccia (puntoni inclinati approssimati); nessun calcolo strutturale: le regole
  sono tabelle empiriche.
- Senza WASM (kernel non disponibile) il 3D mostra i box dei pezzi e gli export SAT/STEP sono disabilitati; la
  distinta CSV e il JSON restano disponibili.
- Ingombri e inserimenti dei giunti, lunghezze dei bulloni, tabelle luci delle sezioni 45×… e giunti di carpenteria
  per tipologia sono **DA VALIDARE** con l'ufficio tecnico.
- Approssimazioni dichiarate: monaco a sezione quadrata anche per gazebo a 6/8 lati (default 300×300); sede piana
  orizzontale del cantonale sull'angolo (becco d'uccello, non sede a V); dardo di Giove senza chiave centrale; grigliato
  come pannello pieno.
- Cambiando tipologia l'ingombro resta quello precedente: possono comparire collisioni "esce dall'ingombro" finché
  non si usa "Ripristina", un preset o "Adatta all'ingombro".
