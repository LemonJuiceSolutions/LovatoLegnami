# espeirIA × Lovato Legnami — video esplicativo, versione 5 minuti

Lingua: italiano. Voce: macOS `say -v Alice -r 175` (pause di 0,26 s tra le frasi). Formati: 16:9 1920×1080 e 9:16 1080×1920, 30 fps.
Testo per scena (fonte unica: `remotion/src/data/vo-text.mjs`; `{schermo|parlato}` = grafia nei sottotitoli | pronuncia TTS).
Durata stimata: ~4:51 (voce ~4:27). Parole parlate: ~690.

Versione commerciale: nessun watermark né dicitura "demo". I prezzi sono calcolati dal listino gestito nel back-office;
il SAT è presentato come pronto per il centro di taglio CNC. "(demo)" nelle registrazioni è coperto da maschere (scratchpad/ocr).

## 0. Intro

| # | Scena | Voce | A schermo |
| --- | --- | --- | --- |
| 01 | Lemonjuice → espeirIA → progetto Lovato | Lemonjuice Solutions presenta espeirIA: la piattaforma che porta la progettazione dal rilievo alla macchina. Il primo progetto: Alessandro Lovato Legnami, che a Settimo di Pescantina lavora il legno dal 1991. Pergole, gazebo, carport, tetti pre-tagliati. | wordmark Lovato su cream, "SETTIMO DI PESCANTINA · VERONA · DAL 1991" → wipe → espeirIA, "by LEMONJUICE" |

## A. Lato sito (cliente)

| # | Scena | Voce | Registrazione |
| --- | --- | --- | --- |
| c1 | Capitolo "Lato sito" | Prima il sito di Lovato, dalla parte del cliente. | card capitolo |
| 02 / 01 | Home e tipologie | Il cliente arriva sulla home e sfoglia le tipologie: addossate, autoportanti, carport, gazebo, pensiline. Ogni modello ha il suo disegno e un prezzo «a partire da», calcolato dal listino di Lovato, gestito dal back-office. | `s02-home-tipologie` — `/` e `/pergole` (desktop) |
| 03 / 02 | Wizard: modello e misure | Poi apre il preventivo in sei passi. Uno: sceglie il modello. Due: le misure, con il cursore o in centimetri. Il sito gli dice subito quanti pilastri servono, e il modello si può cambiare in ogni momento. | `s03-wizard-modello` — `/preventivo`, filtro, Addossata monofalda, larghezza 550 cm (telefono) |
| 04 / 03 | Wizard: spazio | Tre: lo spazio. Il muro è fuori squadra? Il cliente misura i quattro lati e le due diagonali, e l'angolo lo calcola espeirIA. Il pavimento scende di sei centimetri verso il fronte. Sul muro c'è una grondaia. Infine il CAP del cantiere, per il trasporto. | `s04-wizard-spazio` — "Non proprio", 6 misure, dislivello 6 cm, grondaia, CAP 37026 |
| 05 / 04 | Wizard: finiture | Quattro: le finiture, prese dal listino. Larice lamellare, impregnante colorato, copertura in policarbonato. | `s05-wizard-finiture` |
| 06 / 05 | Wizard: riepilogo | Cinque: il riepilogo. La pergola in 3D, già adattata allo spazio: l'altezza scende per passare sotto la grondaia. Il prezzo indicativo ha una forbice, e ogni nota è scritta in parole semplici. Senza registrazione, senza impegno. | `s06-wizard-riepilogo` — 3D girato a mano, "Da sapere", prezzo e forbice |
| 07 / 06 | Wizard: contatti e invio | Sei: i contatti. Nome, telefono, email, qualche foto del muro e il consenso privacy. Un clic, e la richiesta è inviata. | `s07-wizard-contatti` — Mario Rossi, foto, consenso, invio, pagina "grazie" |
| 08 / 07 | Email, PDF e pagina /p/ | Il cliente riceve subito un'email con il riepilogo in PDF e un link personale: la sua pagina, con la pergola, le misure e il prezzo indicativo, valida novanta giorni. | `s08-pdf-pagina` — testo reale dell'email (outbox locale), `/p/<token>`, PDF reale |

## B. Lato configuratore (ufficio tecnico)

| # | Scena | Voce | Registrazione |
| --- | --- | --- | --- |
| c2 | Capitolo "Lato configuratore" | Poi il lato dell'ufficio tecnico di Lovato. | card capitolo |
| 09 / 08 | Accesso e richieste | Il tecnico entra con email e password. In Richieste trova quella di Mario Rossi, con misure, foto e note, uno stato e un responsabile. «Apri nel configuratore»: la pergola del cliente è già caricata. | `s09-richieste` — `/accesso`, `/admin/richieste`, dettaglio, "Prendi in carico", "Apri nel configuratore" |
| 10 / 09 | Tipologie e preset | Il configuratore conosce dieci tipologie, dalla monofalda al gazebo a otto lati, fino al carport ad arco lamellare. Un filtro per categoria, una miniatura per ciascuna, generata dal modello stesso. E ventisette modelli di catalogo, pronti da caricare. | `s10-tipologie-preset` — "Cambia tipologia", filtri, "Esempi dal catalogo" → Gazebo ottagonale Ø4000 |
| 11 / 10 | Regole e auto-dimensionamento | Ogni parametro ha i suoi limiti. Le regole costruttive controllano luci, interassi, sbalzi e sezioni minime. Se una trave non basta, «Auto-dimensiona» propone la sezione giusta. | `s11-regole` — profondità 5000 → "Luce eccessiva" (travetti rossi) → Auto-dimensiona 80×160 → 120×240 |
| 12 / 11 | Ingombro e collisioni | Poi l'ingombro reale: ostacoli, quote del pavimento, pianta fuori squadra. Ogni pezzo che tocca la grondaia diventa rosso. «Adatta all'ingombro», e la pergola rientra nello spazio. Anche con il muro storto: banchina e travetti seguono il piano reale. | `s12-ingombro` — preset "Monofalda con grondaia", altezza 2700 → collisioni, pianta fuori squadra (diagonali), "Adatta all'ingombro" |
| 13 / 12 | Solidi e lavorazioni | Ogni pezzo è un solido vero, calcolato dal kernel OpenCascade: tenoni e mortase, mezzo legno, becchi d'uccello, fori per la ferramenta. Anche l'arco lamellare del carport. Si gira, si clicca un pezzo, e si leggono sezione e lunghezza. | `s13-solidi` — zoom sui giunti, clic su un pezzo, Carport ad arco |
| 14 / 13 | Preventivo vista ufficio | Il preventivo, in vista ufficio, parte dai pezzi. Il taglio è ottimizzato sulle barre commerciali, con gli sfridi reali. Poi lavorazioni CNC, ferramenta, montaggio, complicazioni di cantiere, trasporto per CAP, margini e IVA. Ogni riga ha la sua spiegazione. | `s14-preventivo` — righe, piano di taglio, complicazioni, anteprima cliente |
| 15 / 14 | Preventivo definitivo | Da qui l'ufficio salva il preventivo definitivo: voci manuali, sconto, IVA. E lo invia al cliente per email, con il PDF. | `s15-definitivo` — dialogo "Preventivo definitivo PRV-2026-00001" |
| 16 / 15 | Export CNC | Poi la produzione. Con un clic il sistema esporta il file SAT per il centro di taglio CNC, lo STEP e la distinta CSV con tutta la ferramenta. Dal modello alla macchina, senza ridisegnare. | `s16-export` — Esporta SAT / STEP / CSV, "Verifica file", contenuto reale di .sat e .csv |

## C. Back-office

| # | Scena | Voce | Registrazione |
| --- | --- | --- | --- |
| c3 | Capitolo "Back-office" | Infine, il back-office. | card capitolo |
| 17 / 16 | Listino versionato | Il listino è diviso per sezioni: legno, lavorazioni, ferramenta, montaggio, trasporto, margini. Ogni modifica va in bozza. Il simulatore confronta la bozza con la versione attiva; poi si pubblica, con le differenze e la data di validità. E si importa ed esporta in CSV. | `s17-listino` — prezzo Larice, "Salva nella bozza", Simula, "Pubblica" con differenze e data |
| 18 / 17 | Complicazioni, regole, utenti, registro | Le complicazioni di cantiere si scrivono come frasi: se il dislivello è di almeno dieci centimetri, tre ore di montaggio in più. Poi le regole costruttive, le tipologie visibili sul sito, gli utenti con i loro ruoli. E il registro dice chi ha cambiato cosa, e quando. | `s18-backoffice` — `/admin/listino/complicazioni`, `/admin/regole`, `/admin/tipologie`, `/admin/utenti`, `/admin/registro` |

## D. Outro

| # | Scena | Voce | A schermo |
| --- | --- | --- | --- |
| 19 / 18 | Outro / CTA | Dal rilievo alla macchina. Una sola configurazione. espeirIA, by Lemonjuice Solutions. | titolo "Dal rilievo alla macchina. Una sola configurazione." → lockup Lovato × espeirIA, "LEMONJUICE SOLUTIONS", "Parliamone →" |
