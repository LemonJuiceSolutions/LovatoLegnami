# Style guide video espeirIA × Lovato Legnami

Fonti analizzate il 2026-10-15 (HTML e CSS scaricati in `raw/`):

- https://www.lemonjuicesolutions.it (homepage, CSS `/_next/static/chunks/1522551geyfcf.css`)
- https://www.lemonjuicesolutions.it/it/products/aidra (pagina prodotto, stessa grafica)
- https://espeiria.lemonjuicesolutions.it/it (sito prodotto ESPEIRIA, CSS `/_next/static/chunks/0voz1-u2vdfg2.css`)
- https://www.lovatosrl.it (Squarespace, `site.css`)
- skill locale `marketing-cad-automation-e-manuele-top-voice` (regole di brand ESPEIRIA per video e numeri)

## 1. Identità Lemonjuice (riferimento di stile del video)

### Colori (token CSS reali, `:root` del sito)

| Token | Hex | Uso nel video |
| --- | --- | --- |
| `--ink` | `#0B0C14` (espeiria: `#0D1020`) | fondo scuro principale, testo su chiaro |
| `--ink-2` | `#1C1E2E` (espeiria: `#1F2340`) | card/pannelli su fondo scuro |
| `--night` | `#0A0A14` | fondo dei frame di apertura/chiusura |
| `--paper` | `#FFFFFF` | fondo chiaro, testo su scuro |
| `--cream` | `#F6F5F1` (espeiria: `#F7F5F1`) | sezioni chiare "calde" (ottimo per il legno) |
| `--cyan` | `#00B8E0` | accento primario, cursori, evidenziazioni |
| `--purple` | `#6E20C2` | accento secondario |
| `--magenta` | `#C230D6` | accento terziario, fine gradiente |
| `--muted` | `#0B0C14` al 68% (`#0b0c14ad`) | testo secondario |
| `--line` | `#0B0C14` al 10% (`#0b0c141a`) | filetti, bordi card |
| `--line-strong` | `#0B0C14` al 20% | bordi enfatizzati |
| accent-gradient (chiaro) | `linear-gradient(100deg, #0096C9 0%, #6E2BD0 55%, #C230D6 100%)` | parola chiave nel titolo, barra di avanzamento |
| accent-gradient (scuro) | `linear-gradient(100deg, #38D6FF 0%, #9D7BFF 55%, #EE6BFF 100%)` | stessa cosa su fondo `ink` |
| icone ESPEIRIA (inline) | `#00D4FF`, `#7FF2FF`, `#B388FF`, `#E040FB` | glow, particelle, dettagli del logo espeirIA |

Supporto UI (Tailwind sul sito): verde `#0F9D6B` / emerald `#00BB7F` per KPI positivi, rosso `#E40014` per alert ("Markup negativo").

### Tipografia

| Ruolo | Lemonjuice | ESPEIRIA |
| --- | --- | --- |
| Display / titoli | **Bricolage Grotesque** (200–800, `--font-display`) | **DM Serif Display** (`--font-serif`) |
| Testo | **DM Sans** (variabile 100–1000) | **DM Sans** |
| Etichette, numeri, codice | **JetBrains Mono** | **JetBrains Mono** |

Tutti e tre sono Google Fonts (OFL), caricabili in Remotion con `@remotion/google-fonts`.
Scelta per il video: titoli in **Bricolage Grotesque** 700, `letter-spacing: -0.03em` (classe reale `tracking-[-0.03em]`);
un'unica parola in **DM Serif Display** italico o con accent-gradient per richiamare espeirIA; corpo DM Sans 400/500;
"eyebrow" e numeri in JetBrains Mono MAIUSCOLO con `letter-spacing: 0.22em` (classe più usata sul sito: `tracking-[0.22em]`).

### Motivi di layout

- **Eyebrow mono** sopra ogni titolo: piccolo, maiuscolo, spaziato (`IL SISTEMA OPERATIVO DEI DATI`, `MESSA IN PRODUZIONE`).
- **Numerazione a passi**: `01 / 04`, `02 / 04`… in mono; usata per "Come funziona" e "Operativo in 5 giorni".
- **Titolo in due tempi** con punto finale: "Parti dalla domanda, non dal software." / "Non promesse. Numeri." / "I tuoi dati restano tuoi."
  Il sito spezza i titoli parola per parola (ogni parola in uno span) per l'animazione di comparsa.
- **Card arrotondate** `rounded-2xl` (16 px) con filetto `--line` 1 px; pill `rounded-full` per badge ("SaaS o on-premise", "Zero migrazione dati").
- **Alternanza di sezioni** `ink` (scure) e `cream` (chiare); molto spazio bianco, griglia centrata, container max 80 rem.
- **Mock UI nel hero**: card KPI flottanti ("Ricavi · ultimi 6 mesi +8,3%", "Commessa C-2041 Markup negativo · Rivedi") sovrapposte allo schermo prodotto.
- **Logo**: icona quadrata 32 px con angoli `rounded-lg` e ring sottile, seguita dalla parola "LEMONJUICE" in maiuscolo spaziato.
- Decorazioni: "orb" sfocati colorati (blur 24–64 px) e grana "noise", disattivati con reduced motion; `backdrop-blur-md` sulle barre.

### Animazione

- Easing di brand: `cubic-bezier(.22, 1, .36, 1)` (`--ease`, un ease-out "expo" morbido) per tutte le entrate.
- Parole del titolo che salgono di 12–20 px con fade, sfalsate di 40–60 ms.
- **Marquee** orizzontale continuo (`lj-marquee 30s linear infinite`, translate 0 → -50%): per loghi/parole chiave.
- **Caret lampeggiante** (`lj-caret`, 0–49% visibile): effetto "digitazione" nei campi e nelle domande.
- `ping`/`pulse` sui punti di stato ("live").
- Contatori numerici che salgono (es. `00%` → `100%` sul sito ESPEIRIA "Scorri").
- Niente rotazioni 3D appariscenti, niente transizioni a tendina: tagli puliti, dissolvenze brevi (8–12 frame a 30 fps).

### Tono di voce

- Italiano diretto, frasi brevi, seconda persona plurale o impersonale. Titoli che partono dal problema del cliente
  ("Come genero una variante senza rifare il progetto?").
- Promessa concreta e misurabile, mai hype: "Non promesse. Numeri.", "Operativo in 5 giorni.", "Senza migrazione, senza scrivere codice."
- Principio ESPEIRIA citabile: **"Non si automatizza il CAD, si automatizza la progettazione."**
- Lessico di settore (carpenteria): commessa, distinta, pezzo, sezione, lavorazione, sfrido, cantiere, fuorisquadra.
- Regole dalla skill di brand: ogni numero ha una fonte, altrimenti non si dice; niente immagini stock (ingranaggi, robot,
  ologrammi); in ogni scena **succede qualcosa sullo schermo**; sottotitoli sempre impressi; preferire l'interfaccia reale.
- Nome prodotto: scrivere sempre **espeirIA** (come nel menu di lemonjuicesolutions.it; il sito prodotto usa il maiuscolo ESPEIRIA nel logo testuale).

## 2. Identità Lovato Legnami (cliente, apre il video)

- Ragione sociale nel logo: **Alessandro LOVATO LEGNAMI** (sul sito anche "Alessandro Lovato Legnami S.r.l."; nel footer
  "Lovato Alessandro S.r.l."). Nel video: **Alessandro Lovato Legnami** con sottotitolo "Settimo di Pescantina · Verona".
- Attività: dal 1991 semilavorati e arredo urbano in legno (fioriere, staccionate, giochi, rivestimenti, pavimenti da esterno);
  **centro taglio a controllo numerico** e carpenteria per imprese, studi tecnici e privati: case in legno, tetti in legno
  pre-tagliati, **pergolati, gazebi**, con posa e trasporto a Verona e provincia; lamellari certificati, legno impregnato in autoclave.
- Colori del logo (estratti dalla palette del PNG): verde **`#1B5A41`**, oro/legno **`#BA8B49`**, nero **`#231F20`**.
- Colori del sito Squarespace: verde `#1B5A41` (dominante), verde scuro `#174F39` / `#123B2A`, verde salvia `#9EC2AF`,
  grigi `#272727` `#3E3E3E` `#F2F2F2`, accento corallo `#F0523D`. Font del sito: Archivo, effra, baker-signet-web.
- Uso nel video: il logo Lovato compare **solo nell'intro e nell'outro**, su fondo `cream #F6F5F1` (il logo è pensato su chiaro,
  ha lettere nere). Il verde `#1B5A41` può comparire come filetto/accento nelle scene "legno" (preventivo, sito pubblico),
  il resto segue la palette Lemonjuice.

## 3. Regole operative per il video

- Formato principale 1920×1080 a 30 fps; variante 1080×1920.
- Margini di sicurezza: 96 px laterali (16:9), 64 px laterali e 220 px sopra/sotto (9:16, zona UI dei social).
- Registrazioni dello schermo dentro una "finestra" `rounded-2xl` con ombra morbida su fondo `ink`; zoom lenti (1.0 → 1.08) sul punto d'interesse.
- Sottotitoli: DM Sans 600, 44 px (16:9) / 52 px (9:16), bianco su pill `ink` all'85%, max 2 righe, 42 caratteri per riga.
- Eyebrow di scena in alto a sinistra in JetBrains Mono: `02 / 08 · CONFIGURATORE 3D`.
- Una sola parola per titolo con accent-gradient.
