# Script video "espeirIA per Lovato Legnami" (IT, ~116 s)

Formato: 1920×1080, 30 fps (variante 1080×1920 in `tech-plan.md`). Stile: vedi `style-guide.md`.
Voce: una sola voce narrante, ritmo ~2,4 parole/s, tono calmo e concreto. Musica: bed elettronico/acustico leggero a -22 LUFS sotto la voce.

Fonti dei contenuti: `README.md` (sezione "Configuratore pergole") e `openspec/changes/{configuratore-pergole,tipologie-estese,sito-preventivi}/proposal.md`.
Numeri usati nel parlato: solo conteggi verificabili nel codice (10 tipologie, 27 preset, dal 1991). Nessuna percentuale di risparmio: non c'è una fonte misurata.

Nota pronuncia TTS: nel testo da sintetizzare scrivere **"Espèiria"** (a schermo resta sempre **espeirIA**); "SAT" si legge "sat", "STEP" "step", "CNC" "ci-enne-ci", "IVA" "iva".

Stato delle schermate (al 2026-10-15, branch `feat/configuratore-pergole`): `/configuratore` esiste; motore prezzi, cutting stock e fuorisquadra
esistono nel dominio (`src/domain/pricing`, `src/domain/envelope/plan.ts`) ma **pannello preventivo, sito pubblico, wizard e `/admin` non sono ancora
implementati** (task 9–12 di `sito-preventivi`). Le scene 6–8 hanno quindi una registrazione "target" (quando le pagine esistono) e un ripiego in
motion graphics costruito con dati reali del dominio (vedi `tech-plan.md` §3.3).

---

## Scena 1 — Intro: Lovato + espeirIA (0:00–0:08, 8 s)

- **Voce**: «Alessandro Lovato Legnami: dal 1991 il legno su misura, a Verona. Oggi i suoi progetti hanno una nuova piattaforma: espeirIA.»
- **Testo a schermo**:
  - 0:00 logo Lovato (`assets/lovato-logo.png`, ricostruito in vettoriale) su `cream #F6F5F1`, sotto in mono: `SETTIMO DI PESCANTINA · VERONA · DAL 1991`
  - 0:04 taglio su fondo `ink #0B0C14`: icona espeirIA (`assets/espeiria-icon-512.png`) + parola **espeirIA** (Bricolage Grotesque 800, "IA" con accent-gradient), sotto: `Configuratore, preventivi e CNC per pergole in legno`
- **Schermata app**: nessuna.
- **Note visive**: logo Lovato entra con fade + scala 0.96→1 (easing `.22,1,.36,1`, 18 frame); filetto verde `#1B5A41` che si disegna sotto il logo. Transizione: wipe verticale cream→ink. Le lettere di "espeirIA" salgono una per una (stagger 2 frame), caret `lj-caret` che lampeggia dopo l'ultima lettera. Piccola riga in basso a destra: `by LEMONJUICE` con logo limone 32 px.

## Scena 2 — Il problema (0:08–0:20, 12 s)

- **Voce**: «Ogni pergola è diversa. Il muro non è in squadra, il pavimento pende, c'è sempre una finestra di mezzo. E ogni variante ripartiva da zero: misure, calcoli, disegno, file per la macchina.»
- **Testo a schermo**: eyebrow `01 / 08 · IL PROBLEMA`; titolo «Ogni variante ripartiva **da zero**.» Poi quattro pill che compaiono in fila: `Rilievo` → `Regole in testa` → `CAD a mano` → `File CNC`, con una freccia che torna indietro all'inizio (loop).
- **Schermata app**: nessuna (motion graphics). In alternativa foto reale di un cantiere Lovato (dalla pagina Realizzazioni, solo con autorizzazione del cliente). Niente stock.
- **Note visive**: fondo `cream`. Parole del titolo in stagger 50 ms. Disegno tecnico a linee sottili (`--line-strong`) di una pianta storta che si "deforma": rettangolo che diventa trapezio (il fuorisquadra) e pavimento inclinato.

## Scena 3 — Configuratore 3D (0:20–0:40, 20 s)

- **Voce**: «Con espeirIA si sceglie tra dieci tipologie: addossata, bifalda, sandwich, giunti metallici, carport ad arco lamellare, gazebo a quattro, sei o otto lati, pensilina a sbalzo, pergola a L. Oppure si parte da uno dei ventisette modelli di catalogo. Cambi una misura, e la struttura si ridisegna in 3D, pezzo per pezzo.»
- **Testo a schermo**: eyebrow `02 / 08 · CONFIGURATORE 3D`; contatori in mono `10 TIPOLOGIE` · `27 PRESET`; label finale «Una misura cambia, **tutto** si ricalcola.»
- **Schermata app**: `/configuratore` — registrazione **R1** + **R2** (vedi tech-plan): selettore "Scegli la tipologia" con miniature isometriche (scorrere la griglia `typology-grid`, filtro categoria), poi "Esempi dal catalogo" → "Gazebo ottagonale Ø4000", poi "Carport 5×3", infine "Pergola libera 4×4" e trascinare/variare `Larghezza` e `Profondità` nel form "Tipologia e dimensioni" mentre il 3D si aggiorna; orbita lenta della camera; toggle quote.
- **Note visive**: schermo dentro finestra `rounded-2xl` su `ink`; zoom 1.0→1.08 sul viewer quando cambia la misura. Il nome di ogni tipologia scorre in un **marquee** in basso (JetBrains Mono, `--muted`) mentre la voce le elenca.

## Scena 4 — Regole e ingombro fuorisquadra (0:40–0:56, 16 s)

- **Voce**: «Le regole costruttive di Lovato lavorano in tempo reale: luci, interassi, sbalzi, sezioni minime. Inserisci l'ingombro del cliente, con ostacoli, pavimento in pendenza e muro fuori squadra: la pergola si adatta da sola, e ogni collisione viene segnalata.»
- **Testo a schermo**: eyebrow `03 / 08 · REGOLE E INGOMBRO`; tre chip che si accendono in sequenza: `Luce max ✓` `Interasse ✓` `Sbalzo ✓`; poi badge rosso `Collisione: finestra` → verde `Adattata all'ingombro`.
- **Schermata app**: `/configuratore` — **R3** + **R4**: aumentare la luce fino a far comparire l'errore in "Esiti" → "Auto-dimensiona" (sezione proposta, tabella Attuale/Proposto). Poi "Ingombro del cliente": aggiungere ostacolo "Finestra" sul "Lato muro", modificare "Quote pavimento" (Anteriore destro più basso), cliccare "Adatta all'ingombro"; layer collisioni rosso nel 3D che si spegne. Fuorisquadra: caricare il JSON `video-fuorisquadra.json` (pianta quadrilatera, muro a ~3°) con "File di configurazione" finché il form "pianta/diagonali" (task 10.3) non esiste; mostrare la banchina tagliata sul piano reale del muro (vista dall'alto ortografica).
- **Note visive**: overlay grafico sopra il 3D in vista dall'alto: rettangolo ideale tratteggiato vs pianta reale piena, angolo `87,0°` in mono con accent cyan. Evidenziare in `--magenta` il pezzo in collisione.

## Scena 5 — Solidi reali ed export CNC (0:56–1:08, 12 s)

- **Voce**: «Ogni pezzo è un solido vero, con tenoni, mortase, fori e tagli. Un clic, e il file SAT va al centro di lavoro CNC, insieme allo STEP e alla distinta con tutta la ferramenta.»
- **Testo a schermo**: eyebrow `04 / 08 · EXPORT CNC`; tre file che "cadono" in una cartella: `pergola.sat` · `pergola.step` · `distinta.csv`; badge verde `Struttura SAT valida`.
- **Schermata app**: `/configuratore` — **R5**: attesa "Solidi pronti" (barra `kernel-progress`), clic su un pezzo nel 3D (info pezzo con lavorazioni), zoom su un incastro tenone-mortasa; pannello esportazioni: "Assieme unico (.sat)", "Un file per pezzo (.zip)", STEP, distinta CSV; mostrare `sat-verification` "Struttura SAT valida" e la tabella "Ferramenta" (Codice/Descrizione/Q.tà).
- **Note visive**: inserto picture-in-picture con le prime righe del file `.sat` aperto in un editor (font JetBrains Mono, sfondo `ink-2`) che scorrono. Nessun software CAM di terzi in video (EULA): solo i file.

## Scena 6 — Preventivo con sfridi reali (1:08–1:24, 16 s)

- **Voce**: «Il preventivo nasce dalla stessa configurazione. Il motore ottimizza il taglio sulle barre commerciali e conta gli sfridi reali; poi aggiunge lavorazioni CNC, ferramenta, trattamenti, copertura, montaggio con le complicazioni del cantiere, trasporto, margini e IVA. Ogni riga è spiegata.»
- **Testo a schermo**: eyebrow `05 / 08 · PREVENTIVO`; titolo «Sfridi **reali**, non stimati.»; poi colonna di voci che si accumula con importi che contano verso l'alto: Legno · Sfrido · Lavorazioni CNC · Ferramenta · Trattamenti · Copertura · Montaggio · Complicazioni (fuorisquadra, pendenza, ostacoli, altezza) · Trasporto · Margini · IVA → Totale.
- **Schermata app**: target **R6** `/configuratore` pannello "Preventivo" (vista ufficio: righe con motivazione, piano di taglio, fattori di cantiere, "Listino vN"). Ripiego attuale: motion graphics **M1** generato dal JSON di `priceAssembly` sul preset `addossata-3x4` con l'ingombro fuorisquadra (barre commerciali disegnate come rettangoli in scala, pezzi colorati per famiglia, sfrido tratteggiato, spezzoni riutilizzabili in verde).
- **Note visive**: barre su fondo `cream` con filetto `#1B5A41` (ponte con il brand Lovato); le percentuali di sfrido in JetBrains Mono. Importi solo se il listino è validato, altrimenti mostrare righe senza cifre o con watermark `LISTINO DIMOSTRATIVO` (i valori di `default-listino.ts` sono "DA VALIDARE").

## Scena 7 — Sito pubblico e wizard (1:24–1:36, 12 s)

- **Voce**: «Sul sito, il cliente configura la sua pergola con un percorso guidato: tipologia, misure, spazio disponibile, finiture. Vede il 3D, un prezzo indicativo, e invia la richiesta.»
- **Testo a schermo**: eyebrow `06 / 08 · SITO E WIZARD`; indicatore passi `01 Tipologia · 02 Misure · 03 Spazio · 04 Finiture · 05 Riepilogo · 06 Contatti`; badge `Prezzo indicativo`.
- **Schermata app**: target **R7** in viewport mobile (390×844) e desktop: `/` (home) → `/pergole` → `/preventivo` passi 1–6 (scelta "Addossata", cursori misure, "muro storto" con diagonali, pavimento in pendenza, finitura, riepilogo 3D in modalità box con prezzo, form contatti con consenso). Ripiego attuale: mock in Remotion dei 6 passi con il viewer reale ripreso da `/configuratore` incollato nella card di riepilogo.
- **Note visive**: telefono che entra da destra in 16:9 (in 9:16 è a tutto schermo). Il sito Lovato ha identità propria (legno/verde): mostrarlo "dentro" una cornice browser, senza ricolorarlo.

## Scena 8 — Back-office (1:36–1:46, 10 s)

- **Voce**: «In back-office l'ufficio aggiorna listini e regole senza toccare il codice: bozza, pubblicazione, versioni con data di validità e registro delle modifiche.»
- **Testo a schermo**: eyebrow `07 / 08 · BACK-OFFICE`; badge di stato `BOZZA` → `ATTIVA dal 01/11`; riga di registro in mono `ufficio-tecnico · listino legno · modificato`.
- **Schermata app**: target **R8** `/admin/listino/legno` (modifica di una cella prezzo, "Pubblica" con diff prima/dopo e data di validità), `/admin/regole`, `/admin/registro`, `/admin/richieste`. Ripiego attuale: motion graphics di una tabella modificabile in stile shadcn con il diff evidenziato.
- **Note visive**: fondo `ink`, tabella chiara; la cella modificata pulsa (`pulse`) in cyan, il diff appare come due colonne rosso/verde.

## Scena 9 — Outro / CTA (1:46–1:56, 10 s)

- **Voce**: «Dal rilievo alla macchina, una sola configurazione. espeirIA: non si automatizza il CAD, si automatizza la progettazione.»
- **Testo a schermo**: eyebrow `08 / 08`; «Dal rilievo alla **macchina**. Una sola configurazione.»; poi lockup finale: logo Lovato + `×` + icona e wordmark **espeirIA**; sotto `Lemonjuice Solutions · Verona · espeiria.lemonjuicesolutions.it`; CTA pill `Prenota una demo`.
- **Schermata app**: ultimi 3 s di R2 (pergola che ruota) sfocati in fondo.
- **Note visive**: easing di brand, accent-gradient che attraversa la parola "macchina"; marquee di tutte le tipologie in basso che rallenta e si ferma. Fade a nero sugli ultimi 12 frame.

---

## Testo completo per il TTS (282 parole; Alice -r 175 = 116 s)

```
Alessandro Lovato Legnami: dal 1991 il legno su misura, a Verona. Oggi i suoi progetti hanno una nuova piattaforma: Espèiria.

Ogni pergola è diversa. Il muro non è in squadra, il pavimento pende, c'è sempre una finestra di mezzo. E ogni variante ripartiva da zero: misure, calcoli, disegno, file per la macchina.

Con Espèiria si sceglie tra dieci tipologie: addossata, bifalda, sandwich, giunti metallici, carport ad arco lamellare, gazebo a quattro, sei o otto lati, pensilina a sbalzo, pergola a L. Oppure si parte da uno dei ventisette modelli di catalogo. Cambi una misura, e la struttura si ridisegna in 3D, pezzo per pezzo.

Le regole costruttive di Lovato lavorano in tempo reale: luci, interassi, sbalzi, sezioni minime. Inserisci l'ingombro del cliente, con ostacoli, pavimento in pendenza e muro fuori squadra: la pergola si adatta da sola, e ogni collisione viene segnalata.

Ogni pezzo è un solido vero, con tenoni, mortase, fori e tagli. Un clic, e il file SAT va al centro di lavoro CNC, insieme allo STEP e alla distinta con tutta la ferramenta.

Il preventivo nasce dalla stessa configurazione. Il motore ottimizza il taglio sulle barre commerciali e conta gli sfridi reali; poi aggiunge lavorazioni CNC, ferramenta, trattamenti, copertura, montaggio con le complicazioni del cantiere, trasporto, margini e IVA. Ogni riga è spiegata.

Sul sito, il cliente configura la sua pergola con un percorso guidato: tipologia, misure, spazio disponibile, finiture. Vede il 3D, un prezzo indicativo, e invia la richiesta.

In back-office l'ufficio aggiorna listini e regole senza toccare il codice: bozza, pubblicazione, versioni con data di validità e registro delle modifiche.

Dal rilievo alla macchina, una sola configurazione. Espèiria: non si automatizza il CAD, si automatizza la progettazione.
```

Se la sintesi supera 120 s: togliere «a Verona» (S1), «pezzo per pezzo» (S3) e l'elenco «trattamenti, copertura» (S6).
