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
distinta CSV), salvataggio/caricamento della configurazione in JSON (ripristinata anche dal `localStorage`).

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
| `src/domain/` | TypeScript puro, senza React/three/replicad (vincolo di lint): `math`, `components` (pezzi, lavorazioni, giunti, sezioni, JSON), `assembly`, `typologies` (template e registro), `rules` (motore, auto-dimensionamento, dati Lovato), `envelope` (ingombro, pavimento, collisioni, adattamento). Vedi `src/domain/README.md`. |
| `src/geometry/` | Kernel CAD in Web Worker (`replicad` + OpenCascade WASM): protocollo, client, cache dei solidi, costruzione dei pezzi lavorati, mesh e B-rep neutra. |
| `src/export/` | `sat/` (writer ACIS testuale, validatore, confronto con un campione: vedi `src/export/sat/README.md`), `step/` (solo nel worker), `csv/` (distinta), `zip/`, nomi file e download. |
| `src/stores/` | Store zustand: configurazione, dati derivati, kernel, esempi, file JSON; `viewer-store.ts` per il 3D. |
| `src/components/configuratore/` | UI (form parametri e ingombro, esiti, esportazioni, barra configurazione) e `viewer/` (react-three-fiber). |
| `src/app/(app)/configuratore/` | Pagina Next (componente caricato solo lato client). |
| `openspec/changes/configuratore-pergole/` | Proposta, design (con le note di implementazione), specifiche e task. |

### Aggiungere una tipologia

1. Nuovo template in `src/domain/typologies/templates/<slug>.ts` (`TypologyTemplate`: `slug`, `name`, `params` con
   default e limiti, `build(ctx)` a step `place`/`repeat`/`machining`/`joint`), riusando `templates/shared.ts` e i
   nomi di parametro comuni (`larghezza`, `profondita`, `altezza`, `pendenza`, `interasse`, `sezione<Tipo>`), che
   regole, auto-dimensionamento e adattamento all'ingombro usano per convenzione.
2. Aggiungerlo a `BUILTIN_TEMPLATES` in `templates/index.ts`: compare da solo nel selettore della UI.
3. Test del template ed eventuale fixture golden (`UPDATE_GOLDEN=1 npx vitest run src/domain/typologies/golden.test.ts`);
   facoltativo un esempio in `src/stores/examples.ts`.

### Modificare o aggiungere regole

- I valori sono dati in `src/domain/rules/data/default-lovato.ts` (tabella luci per tipo e sezione, interasse,
  sbalzo, altezza libera, pendenza, sezioni minime): cambiarli non richiede toccare il motore.
- Un nuovo *tipo* di vincolo richiede: variante in `rules/types.ts` (tipo e schema zod), valutazione in
  `rules/engine.ts` ed eventualmente la risoluzione in `rules/autosize.ts`, con i test.

### Limiti noti (MVP)

- Regole e catalogo sezioni con valori **da validare con l'ufficio tecnico**.
- SAT verificato solo dal validatore interno: va provato nel CAM della CNC con un file campione (checklist in
  `src/export/sat/README.md`); solo superfici piane e cilindriche, nessuna `pcurve`.
- STEP in AP242 (impostato da replicad), un solido nominato per pezzo.
- Mortase sempre ortogonali alla faccia (puntoni inclinati approssimati); nessun calcolo strutturale: le regole
  sono tabelle empiriche.
- Senza WASM (kernel non disponibile) il 3D mostra i box dei pezzi e gli export SAT/STEP sono disabilitati; la
  distinta CSV e il JSON restano disponibili.
- Due tipologie: addossata monofalda e autoportante bifalda.
