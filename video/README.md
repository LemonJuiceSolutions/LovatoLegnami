# Video espeirIA × Lovato Legnami — progetto Remotion

Base del video esplicativo (italiano, 16:9 e 9:16). Contenuti in `script.md`, stile in `style-guide.md`, piano in `tech-plan.md`.

```
video/
  remotion/                 progetto Remotion (versioni bloccate, vedi sotto)
    src/data/vo-text.mjs    testo della voce per scena (ortografia TTS "Espèiria")
    src/data/scenes.ts      elenco unico delle scene: eyebrow, titolo, pill, nome della registrazione
    src/data/vo-timing.json GENERATO: durate della voce → durate delle scene, cue dei sottotitoli
    scripts/make-vo.mjs     voce (say + afconvert + afinfo) → timing + SRT
    scripts/stills.sh       fotogrammi di controllo in ../out/
    public/vo/              scene-01…09 .aiff/.wav (generati)
    public/subtitles.srt    sottotitoli impressi nel video (generati, modificabili a mano)
    public/recordings/      QUI vanno le registrazioni dello schermo
    public/assets/          icona espeirIA, logo Lemonjuice, PNG Lovato (solo riferimento)
  out/                      render e still
```

## Versioni

`remotion`, `@remotion/cli`, `@remotion/google-fonts`, `@remotion/media-utils` = **4.0.530** (esatta, pubblicata il 2026-09-29;
la 4.0.535 citata in `tech-plan.md` aveva meno di due settimane). React / React DOM 18.3.1, TypeScript 5.6.3, `@types/react` 18.3.12.
Tutti i pacchetti `@remotion/*` devono restare alla stessa versione di `remotion` (`npm i -E`).

Font: Bricolage Grotesque, DM Sans, JetBrains Mono via `@remotion/google-fonts` (scaricati da Google Fonts al momento del render:
serve la rete; per un render offline copiare i woff2 in `public/fonts/` e caricarli con `@remotion/fonts`).

## Composizioni

| ID | Formato | Note |
| --- | --- | --- |
| `Espeiria16x9` | 1920×1080, 30 fps | master |
| `Espeiria9x16` | 1080×1920, 30 fps | stessa timeline; safe area 220 px sopra/sotto, sottotitoli 52 px |

Le scene vengono da un'unica lista (`src/data/scenes.ts`); la durata di ciascuna = voce + 0,25 s prima + 0,3 s dopo
(minimi: intro 8 s, outro 9,5 s). Durata attuale: **122,4 s (3671 frame)**, di cui 116,1 s di voce.

| # | Scena | Durata | Eyebrow | Registrazione |
| --- | --- | --- | --- | --- |
| 1 | Intro Lovato → espeirIA | 9,3 s | — | (nessuna, grafica) |
| 2 | Il problema | 12,8 s | 01 / 08 | `s02-problema.mp4` (facoltativa) |
| 3 | Configuratore 3D | 21,2 s | 02 / 08 | `s03-configuratore.mp4` |
| 4 | Regole e ingombro | 16,9 s | 03 / 08 | `s04-regole-ingombro.mp4` |
| 5 | Export CNC | 11,9 s | 04 / 08 | `s05-export-cnc.mp4` |
| 6 | Preventivo | 18,7 s | 05 / 08 | `s06-preventivo.mp4` |
| 7 | Sito e wizard | 12,5 s | 06 / 08 | `s07-sito-wizard.mp4` (verticale, frame telefono) |
| 8 | Back-office | 9,6 s | 07 / 08 | `s08-backoffice.mp4` |
| 9 | Outro / CTA | 9,5 s | 08 / 08 | `s09-outro-bg.mp4` (facoltativa, sfocata in fondo) |

La numerazione degli eyebrow segue `script.md` (8 passi dopo l'intro: `01 / 08` … `08 / 08`).

## Come aggiungere le registrazioni

1. Registrare come da `tech-plan.md` §3 (Playwright, 1920×1080, tema chiaro, assistente AI nascosto).
2. Convertire in H.264 a 30 fps:
   `ffmpeg -i R2.webm -c:v libx264 -crf 16 -pix_fmt yuv420p -r 30 -an remotion/public/recordings/s03-configuratore.mp4`
   (più registrazioni per la stessa scena: concatenarle o montarle prima in un unico file).
3. Salvare con il nome esatto della tabella in `remotion/public/recordings/` (accettati anche `.webm` e `.mov`).
4. Rilanciare il render: il file viene trovato da solo (`getStaticFiles()` in `calculateMetadata`) e sostituisce il segnaposto.
   Il video parte dall'inizio della scena, muto, con uno zoom lento 1.00 → 1.08; dovrebbe durare almeno quanto la scena
   (altrimenti resta fermo sull'ultimo fotogramma). Formato: 16:9 per tutte tranne `s07` (9:19,5, viewport 390×844).

### Registrazioni ancora da fare

| File | Scena | Route e azioni (da `tech-plan.md` §3.2) | Stato app |
| --- | --- | --- | --- |
| `s02-problema.mp4` | 2 | nessuna app: foto/video di un cantiere Lovato (solo con autorizzazione) o motion graphics (pianta che diventa trapezio, pavimento inclinato) | — |
| `s03-configuratore.mp4` | 3 | **R1 + R2** `/configuratore`: griglia "Scegli la tipologia" con filtro categoria; "Esempi dal catalogo" → Gazebo ottagonale Ø4000, Carport 5×3, Pergola libera 4×4; Larghezza 4000→5000 a scatti di 250, Profondità 4000→3000; quote; orbita | pronta |
| `s04-regole-ingombro.mp4` | 4 | **R3 + R4** `/configuratore`: preset "Pergola addossata 3×4", profondità oltre la luce → errore in "Esiti" → "Auto-dimensiona" (Attuale/Proposto); "Ingombro del cliente": ostacolo "Finestra" sul "Lato muro", "Quote pavimento" anteriore destro −60 mm, "Adatta all'ingombro"; "File di configurazione" → `fixtures/video-fuorisquadra.json`, vista dall'alto ortografica | pronta (fuorisquadra solo via JSON, task 10.3) |
| `s05-export-cnc.mp4` | 5 | **R5 (+R5b)** `/configuratore`: "Solidi pronti", info pezzo su travetto e pilastro, zoom tenone/mortasa; "Pannello esportazioni": .sat, .zip, STEP, CSV; "Struttura SAT valida"; tabella "Ferramenta"; facoltativo intestazione `.sat` in editor scuro | pronta |
| `s06-preventivo.mp4` | 6 | **R6** `/configuratore` pannello "Preventivo" (vista ufficio, piano di taglio, fattori di cantiere, "Listino vN"); ripiego M1/M2 da `priceAssembly` | **manca** (task 10.2) — watermark "LISTINO DIMOSTRATIVO" già attivo |
| `s07-sito-wizard.mp4` | 7 | **R7** mobile 390×844: `/` → `/pergole` → `/preventivo` passi 1–6, dati finti, senza inviare | **manca** (task 11–12) |
| `s08-backoffice.mp4` | 8 | **R8** `/admin/listino/legno` (modifica €/m³, "Pubblica" con diff e data), `/admin/regole`, `/admin/registro`, `/admin/richieste` | **manca** (task 9) |
| `s09-outro-bg.mp4` | 9 | ultimi 3–8 s di R2 (pergola che ruota), verrà sfocata | pronta |

## Voce e sottotitoli

```bash
cd remotion
npm run vo                     # say -v Alice -r 175 → public/vo/scene-XX.aiff → afconvert → .wav (48 kHz mono)
                               # afinfo → durate → src/data/vo-timing.json, public/subtitles.srt, ../out/espeiria-lovato.it.srt
```

- Il testo è in `src/data/vo-text.mjs` (ortografia di pronuncia **"Espèiria"**); a schermo e nei sottotitoli diventa sempre **espeirIA**.
- I tempi dei sottotitoli sono **stimati** in proporzione ai caratteri dentro ogni scena (non c'è un allineamento parola per parola).
  `public/subtitles.srt` si può correggere a mano: il video legge quel file (attenzione: `npm run vo` lo rigenera).
  Per tempi esatti: Whisper.cpp (`@remotion/install-whisper-cpp`) o i timestamp di ElevenLabs, come in `tech-plan.md` §6.

### Cambiare voce

- Altra voce macOS: `node scripts/make-vo.mjs --voice "Alice (Premium)" --rate 170` (scaricare prima le voci Premium/Enhanced in
  Impostazioni → Accessibilità → Contenuti letti; verificare il nome con `say -v '?'`).
- Voce esterna (ElevenLabs, Azure, voce umana): esportare una traccia per scena, salvarla come `public/vo/scene-01.wav` … `scene-09.wav`
  (48 kHz) e lanciare `node scripts/make-vo.mjs --skip-tts`: ricalcola durate, timeline e SRT senza rigenerare l'audio.
- Musica: non ancora inserita (vedi `tech-plan.md` §7); aggiungere un `<Audio>` con volume ~0.1 in `src/Main.tsx`.

## Render

```bash
cd remotion
npm install                    # versioni esatte da package.json
npm run studio                 # anteprima interattiva
npm run render:16x9            # → ../out/espeiria-draft-16x9.mp4
npm run render:9x16            # → ../out/espeiria-draft-9x16.mp4
bash scripts/stills.sh         # → ../out/*.png (intro, schermata, telefono, outro, 9:16)
npx remotion still src/index.ts Espeiria16x9 ../out/thumbnail.png --frame=262
```

Il render usa Chrome Headless Shell scaricato da Remotion in `node_modules/.remotion` (già presente).

## Segnaposto e cose da sostituire prima della pubblicazione

- **Logo Lovato**: `src/components/LovatoWordmark.tsx` è una **ricostruzione tipografica in SVG** (Bricolage Grotesque, colori #1B5A41 / #BA8B49 /
  #231F20, bande oblique di legno) fatta guardando il PNG di 209×70 px, che non viene ingrandito. Non è il file ufficiale: chiedere a Lovato l'SVG/AI
  del marchio e l'autorizzazione all'uso.
- **Wordmark espeirIA**: composto con il font (Bricolage 800, "IA" in accent-gradient) + icona ufficiale `espeiria-icon-512.png`; confermare con Lemonjuice.
- **Schermate**: tutte le scene 2–8 mostrano ora un segnaposto animato (titolo, skeleton UI, pergola wireframe, nome del file atteso).
- **Scene grafiche dedicate** non ancora fatte: pill in loop e pianta che si deforma (S2), overlay pianta reale/ideale 87,0° (S4), file che cadono
  in cartella e `.sat` che scorre (S5), barre di taglio M1 e righe con importi M2 (S6), mock wizard M3 (S7), tabella con diff M4 (S8).
  Ora queste scene usano il componente generico `ScreenScene` con le pill in sequenza.
- **Voce**: Alice di sistema, prosodia piatta, va bene per bozza e timing.
- **Musica e SFX**: assenti.

## Versione 5 minuti (15/10/2026)

- Copione: `script-5min.md`; testo voce `remotion/src/data/vo-text.mjs` (sintassi `{schermo|parlato}`, pause `[[slnc 260]]` tra le frasi, `extra` = secondi di respiro in più).
- Scene: `remotion/src/data/scenes.ts` (intro, 3 card di capitolo `scenes/Chapter.tsx`, 17 scene schermo, outro). I file 116 s originali sono in `legacy-116s/`.
- Registrazioni reali in `remotion/public/recordings/s02…s18-*.mp4` (script Playwright in `../rec/`: `lib.mjs`, `r-site.mjs`, `r-wizard.mjs`, `r-pdf.mjs`, `r-office.mjs`, `r-conf.mjs`, `r-admin.mjs`; istanza locale su :3140 con PGlite in una copia del repo).
- Durate delle registrazioni: `node scripts/probe-recordings.mjs` → `src/data/recordings.json`; ogni clip è accelerata/rallentata (0,75–2,4×) per durare quanto la scena.
- Voce: `node scripts/make-vo.mjs` (Alice, 175). Render:
  `npx remotion render src/index.ts Espeiria16x9 ../out/espeiria-lovato-5min-16x9.mp4 --codec=h264 --crf=19 --audio-codec=aac` (idem `Espeiria9x16`).
