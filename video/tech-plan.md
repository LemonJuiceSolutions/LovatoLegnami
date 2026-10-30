# Piano tecnico di produzione: video espeirIA × Lovato Legnami

Obiettivo: video in italiano di circa 116 s (`script.md`), stile Lemonjuice (`style-guide.md`), master 1920×1080 a 30 fps
più una variante 1080×1920. Tutto si produce in locale su macOS: Node 26 (`/opt/homebrew/bin/node`) e ffmpeg
(`/opt/homebrew/bin/ffmpeg`) sono già installati, e nella cache di Playwright ci sono già Chromium `chromium-1228` e `ffmpeg-1011`.

Regola: il repository `/Users/manuele/Progetti/LovatoLegnami` si usa solo in lettura, come app da registrare. Il progetto video
vive in questa cartella, `scratchpad/video/`.

```
video/
  assets/            loghi scaricati (vedi §1)
  raw/               HTML e CSS delle fonti, testo della voce (vo.txt)
  recordings/        file .webm/.mp4 di Playwright (R1–R8)
  fixtures/          JSON di configurazione e dati del preventivo per le scene
  audio/             voce.wav, musica.mp3, sfx
  remotion/          progetto Remotion (§4)
  capture/           script Playwright (§3)
  out/               render finali
```

## 1. Asset

| File | Fonte | Note |
| --- | --- | --- |
| `assets/lovato-logo.png` | `https://images.squarespace-cdn.com/content/v1/57c6072fb3db2bd469e3e46c/1504451192963-1MQUDCFDT1P183761I0F/LOVATOsrl.png` (scaricato con `Accept: image/png`, perché senza quell'header la CDN restituisce WebP) | **solo 209×70 px**: è l'originale caricato su Squarespace, e la variante `?format=2500w` non lo ingrandisce. Per il video serve un vettoriale: chiedere l'SVG/AI a Lovato, oppure ridisegnarlo (testo "Alessandro" + "LOVATO" + "LEGNAMI" + le 3 bande oblique oro). Colori: `#1B5A41`, `#BA8B49`, `#231F20`. |
| `assets/lovato-logo-og.png` | og:image `http://static1.squarespace.com/static/57c6072fb3db2bd469e3e46c/t/59ac1a7815d5dbe0dad3172f/1504451193130/LOVATOsrl.png` | stesso file, 209×70 |
| `assets/lovato-favicon.webp` | `https://images.squarespace-cdn.com/content/v1/57c6072fb3db2bd469e3e46c/1503221935075-184T3ARVGNSH1RONH2J8/favicon.ico?format=100w` | il server lo invia in formato WebP |
| `assets/espeiria-icon-512.png` (+ `-192`, `apple-touch-icon`) | `https://espeiria.lemonjuicesolutions.it/icons/icon-512.png` | icona testa/circuito ciano→viola, 512×512 |
| `assets/lemonjuice-logo.png` | `https://www.lemonjuicesolutions.it/images/logo.png` | limone, 500×500 |

Nel repo non ci sono asset di brand espeirIA o Lemonjuice: `public/` contiene solo `favicon.ico` e `occt/`. Il README dice soltanto
"Tema, componenti UI e setup AI ereditati da ESPEIRIA (VRE)" e i token shadcn in `src/app/globals.css` sono quelli predefiniti
(slate). La wordmark "espeirIA" si compone quindi in Remotion con un font (Bricolage Grotesque 800, con "IA" in accent-gradient).
Prima di pubblicare, chiedere a Lemonjuice se esiste un logotipo ufficiale.

Font da `@remotion/google-fonts`: `BricolageGrotesque`, `DMSans`, `DMSerifDisplay`, `JetBrainsMono`.

## 2. App da registrare

```bash
cd /Users/manuele/Progetti/LovatoLegnami
npm run dev        # il predev copia il kernel OCCT in public/occt/ (WASM ~23 MB); app su http://localhost:3000
```

Stato delle schermate al 2026-10-15:

- `/configuratore`: completo, comprende tipologie, preset, ingombro, regole, 3D, kernel OCCT ed export SAT/STEP/CSV.
- Fuorisquadra: c'è nel dominio (`planFromDiagonals`, `Envelope.plan`, `wallPlane`) ma **manca nel form**, che è il task 10.3. Per ora si mostra
  caricando un JSON di configurazione.
- Pannello preventivo (task 10.2), sito pubblico `/`, `/pergole` (task 11), wizard `/preventivo` (task 12) e `/admin/*` (task 9): **non ancora implementati**.
  Il motore prezzi (`priceAssembly`, `officeView`, `customerView`, `planAssemblyCuts`) esiste e ha i suoi test.

Decisione: si registra subito ciò che esiste (R1–R5). Le scene 6–8 si montano con un ripiego in motion graphics alimentato da dati
reali del dominio (§3.3). Quando i task 9–12 sono pronti si registrano R6–R8 e si sostituiscono le clip senza toccare il montaggio,
perché ogni scena è una `<Sequence>` con una prop `clip`.

## 3. Registrazioni con Playwright

### 3.1 Setup

```bash
mkdir -p capture && cd capture
npm init -y
npm i -D @playwright/test@1.64.1 tsx@4
npx playwright install chromium     # salta il download se la build è già in cache
```

`capture/record.ts` (schema):

```ts
import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  headless: false,                                   // WebGL via GPU (Metal); headless usa SwiftShader, più lento e con aliasing
  args: ["--use-angle=metal", "--force-device-scale-factor=1", "--hide-scrollbars"],
  slowMo: 60,
});
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: "light",
  recordVideo: { dir: "../recordings/R1", size: { width: 1920, height: 1080 } },
});
await ctx.addInitScript({ path: "./fake-cursor.js" }); // i video di Playwright non mostrano il puntatore: si inietta un div cursore che segue mousemove e anima il click
const page = await ctx.newPage();
await page.goto("http://localhost:3000/configuratore");
await page.getByText("Solidi pronti").waitFor({ timeout: 60_000 }); // kernel OCCT pronto
// ... passi della registrazione
await ctx.close();  // il .webm viene scritto alla chiusura del contesto
```

Accorgimenti:

- Prima di ogni ripresa: `localStorage.clear()` (la configurazione viene ripristinata dal `localStorage`) e un `waitForTimeout(1500)` di "aria".
- Movimenti del mouse con `page.mouse.move(x, y, { steps: 25 })` per avere traiettorie fluide. Orbita del 3D: `mouse.down()` sul canvas, poi move in 60 step, poi `up()`.
- Qualità: `recordVideo` produce un VP8 a bitrate modesto, sufficiente per le bozze. Per il master usare una di queste due strade:
  (a) CDP `Page.startScreencast` (`format: "png"`, `everyNthFrame: 1`) per salvare i fotogrammi e poi `ffmpeg -framerate 30 -i %05d.png -c:v prores_ks -profile:v 3`;
  (b) la finestra headed a 1920×1080 catturata con `ffmpeg -f avfoundation -capture_cursor 1 -framerate 30 -i "<schermo>"` mentre lo script Playwright guida l'app.
- Conversione per Remotion: `ffmpeg -i in.webm -c:v libx264 -crf 16 -pix_fmt yuv420p -r 30 R1.mp4`.
- Tema: registrare in chiaro. Il viewer usa `use-viewer-palette`. Nascondere l'assistente AI flottante iniettando il CSS `[data-ai-assistant]{display:none}`
  (prima verificare il selettore in `src/components/ai/ai-assistant.tsx`).

### 3.2 Elenco delle registrazioni

| ID | Scena | Route | Passi | Durata grezza |
| --- | --- | --- | --- | --- |
| R1 | 3 | `/configuratore` | "Scegli la tipologia": scorrere lentamente la griglia `typology-grid` con le 10 miniature isometriche, applicare il filtro per categoria (addossata → gazebo → tutte), hover su "Carport ad arco" e "Gazebo a padiglione" | 15 s |
| R2 | 3, 9 | `/configuratore` | "Esempi dal catalogo": cercare e caricare "Gazebo ottagonale Ø4000", attendere i solidi e orbitare; poi "Carport 5×3" (archi lamellari); poi "Pergola libera 4×4"; in "Tipologia e dimensioni" portare la Larghezza da 4000 a 5000 a scatti di 250 mm e la Profondità da 4000 a 3000, con il 3D che si aggiorna; attivare "Mostra o nascondi le quote principali"; chiudere con un'orbita lenta di 8 s, che serve anche come fondo dell'outro | 40 s |
| R3 | 4 | `/configuratore` | Preset "Pergola addossata 3×4": aumentare la profondità oltre la luce ammessa finché in "Esiti" compare un errore; cliccare "Auto-dimensiona" e mostrare la tabella Attuale/Proposto, poi applicare; gli esiti tornano verdi | 15 s |
| R4 | 4 | `/configuratore` | "Ingombro del cliente": impostare il box d'ingombro; aggiungere l'ostacolo "Finestra" sul "Lato muro" (il pezzo in collisione diventa rosso); in "Quote pavimento" abbassare l'"Anteriore destro" di 60 mm (i pilastri cambiano lunghezza); "Adatta all'ingombro"; le collisioni si azzerano. Poi "File di configurazione" → caricare `fixtures/video-fuorisquadra.json`, "Vista dall'alto (ortografica)", zoom sulla banchina tagliata sul muro storto | 25 s |
| R5 | 5 | `/configuratore` | Con "Solidi pronti": clic su un travetto e un pilastro (info pezzo con lavorazioni), zoom su tenone e mortasa; aprire il "Pannello esportazioni": "Assieme unico (.sat)" (verifica `sat-verification` "Struttura SAT valida"), "Un file per pezzo (.zip)", STEP, distinta CSV; mostrare la sezione "Ferramenta" negli esiti (clic su una voce: si selezionano i pezzi collegati) | 20 s |
| R5b | 5 | editor | Aprire il `.sat` scaricato in un editor con tema scuro e JetBrains Mono e far scorrere l'intestazione ACIS e i primi body nominati (registrazione con `ffmpeg avfoundation`, oppure resa in Remotion come testo animato) | 6 s |
| R6 | 6 | `/configuratore` (pannello "Preventivo", **da task 10.2**) | Vista ufficio: espandere i gruppi Legno, Lavorazioni, Ferramenta, Montaggio, Complicazioni; aprire il piano di taglio; mostrare i fattori di cantiere con il fuorisquadra caricato; versione del listino | 20 s |
| R7 | 7 | `/`, `/pergole`, `/preventivo` (**da task 11–12**) | Viewport mobile 390×844 (`devices["iPhone 15"]`) e desktop. Home, poi Pergole, poi "Fai il preventivo"; passo 1 Addossata; passo 2 cursori delle misure; passo 3 "muro storto" con diagonali, pavimento in pendenza, un ostacolo; passo 4 finitura; passo 5 riepilogo 3D (box) con prezzo indicativo; passo 6 contatti con dati finti e consenso, senza inviare | 30 s |
| R8 | 8 | `/admin/listino/legno`, `/admin/regole`, `/admin/registro`, `/admin/richieste` (**da task 9**) | Login con l'utente seed `admin`; modificare il prezzo €/m³ di una specie; "Pubblica" con diff prima/dopo e data di validità; registro delle modifiche; elenco delle richieste | 20 s |

### 3.3 Ripieghi con dati reali (finché R6–R8 non esistono)

- `fixtures/video-fuorisquadra.json`: generarlo con uno script `tsx` eseguito **fuori dal repo**, che importa dal repo solo in lettura
  `planFromDiagonals` (`src/domain/envelope/plan.ts`), `loadPreset("addossata-3x4")` e `serializeConfig` (`src/stores/config-file.ts`).
  Il muro va messo a circa 3° dallo squadro (diagonali diverse di circa 150 mm). In alternativa si compila a mano un JSON conforme a `ConfigFileSchema`.
- `fixtures/preventivo.json`: con lo stesso script, `priceAssembly(...)` sul preset precedente con il listino `default-listino.ts`, poi
  `officeView(quote)` per avere righe, piano di taglio e fattori. Remotion legge il JSON e disegna:
  **M1** barre commerciali in scala con i pezzi assegnati, lo sfrido tratteggiato e gli spezzoni riutilizzabili;
  **M2** colonna delle righe di preventivo con importi che contano verso l'alto.
  I prezzi sono segnaposto `DA VALIDARE`: aggiungere il watermark "LISTINO DIMOSTRATIVO" oppure nascondere le cifre.
- **M3** (wizard) e **M4** (admin): mock in React dentro Remotion con componenti in stile shadcn (card, input, tabella, badge) e la palette del sito Lovato.

## 4. Progetto Remotion

### 4.1 Versioni bloccate (tutte esatte, senza `^`)

```json
{
  "dependencies": {
    "remotion": "4.0.535",
    "@remotion/cli": "4.0.535",
    "@remotion/google-fonts": "4.0.535",
    "@remotion/media-utils": "4.0.535",
    "@remotion/transitions": "4.0.535",
    "@remotion/captions": "4.0.535",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "@types/react": "18.3.12"
  }
}
```

(4.0.535 è l'ultima versione pubblicata su npm al 2026-10-15. Tutti i pacchetti `@remotion/*` devono avere la **stessa** versione di `remotion`.)

```bash
cd remotion && npx create-video@4.0.535 --blank . && npm i -E <pacchetti sopra>
```

### 4.2 Struttura

```
remotion/src/
  Root.tsx              <Composition id="Main169" 1920x1080 30fps> e <Composition id="Main916" 1080x1920 30fps>
  theme.ts              token di style-guide.md (ink, cream, cyan, purple, magenta, gradient, ease bezier(.22,1,.36,1))
  fonts.ts              loadFont() di Bricolage Grotesque, DM Sans, DM Serif Display, JetBrains Mono
  components/           Eyebrow, Title (stagger per parola), Pill, Caret, Marquee, ScreenFrame (rounded-2xl + zoom), Counter, Subtitles
  scenes/S1Intro … S9Outro.tsx   ogni scena riceve { layout: "16:9" | "9:16", clip?: string }
  data/timeline.ts      inizio e durata delle scene in frame (240, 360, 600, 480, 360, 480, 360, 300, 300 = 3480 frame = 116 s)
public/                 recordings/*.mp4, assets/*, audio/voce.wav, audio/musica.mp3, captions.json
```

- Clip dello schermo: `<OffthreadVideo src={staticFile("recordings/R2.mp4")} startFrom={...} />` dentro `ScreenFrame`. Nella variante 9:16 lo `ScreenFrame` diventa a tutta larghezza
  con un crop centrato sul viewer 3D (`objectPosition` per scena) e titoli e sottotitoli si impilano sopra e sotto.
- Timing: la durata di ogni scena si ricava dai timestamp della voce (§5) e non al contrario. `timeline.ts` si rigenera da `captions.json`.
- Transizioni: `@remotion/transitions` con `fade()` di 10 frame; wipe verticale solo nell'intro (cream → ink).

## 5. Voce (TTS)

### 5.1 Locale su macOS (`say`)

Voci italiane installate (`say -v '?' | grep it_IT`): **Alice**, **Eddy**, **Flo**, **Grandma**, **Grandpa**, **Reed**, **Rocko**, **Sandy**, **Shelley**.
Alice compare due volte, quindi è installata in due qualità (compatta e Enhanced/Premium). Le altre sono le voci "Eloquence", più robotiche.

Prova sul testo completo (`raw/vo.txt`, 282 parole):

- **Alice** `-r 175`: **116,2 s**, perfetto per il target. Anteprima salvata in `vo-preview-alice.m4a`.
- Eddy, Flo, Reed, Sandy, Shelley, Rocko: circa 150,6 s anche con `-r 175`, perché ignorano quasi del tutto la velocità. Eddy con `-r 230` arriva a 123,2 s.

```bash
say -v Alice -r 175 -f raw/vo.txt -o audio/voce.aiff
ffmpeg -i audio/voce.aiff -ar 48000 -ac 1 audio/voce.wav
```

Per voci migliori in locale: Impostazioni di Sistema → Accessibilità → Contenuti letti → Voci di sistema → Italiano → scaricare
"Alice (Premium)" o "Federica/Luca (Enhanced)" se disponibili, poi verificare con `say -v '?'`. Si possono usare segnaposti di pausa
`[[slnc 400]]` tra le scene e `[[rate 165]]` per rallentare un passaggio.

Pro: gratis, offline, ripetibile. Contro: prosodia piatta, si sente che è una voce di sintesi in un video commerciale. Va bene per le bozze e per il timing.

### 5.2 Locale neurale (offline, migliore)

- **Piper** (`pip install piper-tts`, voce `it_IT-paola-medium` o `it_IT-riccardo-x_low`): gira sulla CPU, qualità buona, licenza del modello da verificare per ogni voce.
- **Coqui XTTS-v2**: clonazione della voce da 10 s di audio (per esempio la voce di Manuele, con il suo consenso). Licenza CPML, **non commerciale**: va bene solo per prove interne.

### 5.3 Cloud (per il master)

- **ElevenLabs** (multilingual v2/v3): l'italiano più naturale; restituisce anche i timestamp per carattere, utili per i sottotitoli.
- **Azure Neural TTS** (`it-IT-IsabellaNeural`, `it-IT-DiegoNeural`, `it-IT-ElsaNeural`): SSML con `<break>` e `<phoneme>` per "espeirIA".
- **Google Cloud TTS** (voci `it-IT-Neural2-*` / `Chirp3-HD`), **OpenAI TTS** (`gpt-4o-mini-tts`, istruzioni di tono in italiano).
- Alternativa migliore: voce umana registrata (Manuele o uno speaker) seguendo la guida di `say`.

Pronuncia: nel testo TTS scrivere "Espèiria"; a schermo resta **espeirIA**.

## 6. Sottotitoli (SRT) impressi

1. Allineamento: `npx @remotion/install-whisper-cpp` (Whisper.cpp locale, modello `medium` o `large-v3-turbo`, lingua `it`) sul file `audio/voce.wav`,
   poi `toCaptions()` dà timestamp per parola in `public/captions.json`. Con ElevenLabs si usano direttamente i timestamp restituiti.
2. Correzione: sostituire il testo riconosciuto con quello esatto dello script (gli errori tipici sono "espeirIA", "SAT", "sfridi") e tenere solo i tempi.
3. Rendering: componente `Subtitles` con `createTikTokStyleCaptions()` di `@remotion/captions` (pagine di 1–2 righe da massimo 42 caratteri).
   Stile: DM Sans 600, pill `ink` all'85%, parola corrente in cyan `#00B8E0`.
4. File separato: `serializeSrt()` di `@remotion/captions` produce `out/espeiria-lovato.it.srt`, da caricare anche su YouTube e LinkedIn come traccia.

## 7. Musica

- Royalty-free con licenza commerciale scritta: YouTube Audio Library ("nessuna attribuzione richiesta"), Pixabay Music (Content License), oppure
  a pagamento Artlist o Epidemic Sound (abbonamento attivo al momento della pubblicazione). Conservare la licenza o lo screenshot in `audio/LICENZE.txt`.
- Genere: elettronica minimale o acustica leggera, 95–110 BPM, senza voce. Volume a -20/-24 dB sotto la voce, con ducking da `interpolate` sul volume nei tratti parlati e +4 dB nell'intro e nell'outro.
- SFX: un "tick" leggero sui contatori e sui badge (anche questi royalty-free). Mix finale a -14 LUFS integrati per i social: `ffmpeg -af loudnorm=I=-14:TP=-1.5:LRA=11`.

## 8. Render

```bash
cd remotion
npx remotion studio                                            # anteprima e regolazioni
npx remotion render src/index.ts Main169 ../out/espeiria-lovato-1920x1080.mp4 \
  --codec=h264 --crf=18 --pixel-format=yuv420p --audio-codec=aac --audio-bitrate=320k --concurrency=50%
npx remotion render src/index.ts Main916 ../out/espeiria-lovato-1080x1920.mp4 \
  --codec=h264 --crf=18 --pixel-format=yuv420p --audio-codec=aac --audio-bitrate=320k --concurrency=50%
npx remotion still src/index.ts Main169 ../out/thumbnail.png --frame=150   # copertina (lockup Lovato × espeirIA)
ffmpeg -i ../out/espeiria-lovato-1920x1080.mp4 -af loudnorm=I=-14:TP=-1.5 -c:v copy ../out/espeiria-lovato-1920x1080-norm.mp4
```

Output:

- `out/espeiria-lovato-1920x1080.mp4`: 16:9, 30 fps, H.264, per sito, YouTube e presentazioni.
- `out/espeiria-lovato-1080x1920.mp4`: 9:16 per Reels, Shorts e storie LinkedIn. Stessa timeline; in alto gli eyebrow, al centro lo schermo
  ritagliato sul 3D (le schermate del form vengono ingrandite su un solo campo), in basso i sottotitoli sopra la safe area di 220 px.
- `out/espeiria-lovato.it.srt` e `out/thumbnail.png`.
- Facoltativo: 1080×1350 (4:5, LinkedIn feed) con una terza `<Composition>` che riusa il layout 9:16 con una spaziatura diversa.

## 9. Checklist prima della pubblicazione

- [ ] Logo Lovato vettoriale ricevuto o ridisegnato, e autorizzazione di Lovato all'uso del marchio e delle foto.
- [ ] Logotipo espeirIA confermato da Lemonjuice e scritto **espeirIA** ovunque nei testi a schermo.
- [ ] Nessun prezzo reale mostrato finché il listino è segnaposto (`DA VALIDARE`), oppure watermark "dimostrativo".
- [ ] Nessun dato personale vero nel wizard o nelle richieste (usare dati finti).
- [ ] Nessuna interfaccia di CAD/CAM di terzi (EULA): solo l'interfaccia espeirIA e i file.
- [ ] Ogni numero detto ha una fonte nel codice (10 tipologie, 27 preset) o nel sito Lovato (dal 1991).
- [ ] Sottotitoli verificati parola per parola; licenze della musica archiviate.
