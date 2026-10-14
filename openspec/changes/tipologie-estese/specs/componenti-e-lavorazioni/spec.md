# Spec Delta

## ADDED Requirements

### Requirement: Primitivi estesi del catalogo
Il catalogo dei componenti primitivi SHALL comprendere anche `tavola` (singola tavola di una trave doppia a sandwich), `arco` (membro lamellare curvo), `cantonale` (puntone diagonale di padiglione o compluvio), `monaco` (pezzo di colmo/punta in legno), `mensola` (trave a sbalzo incastrata a muro), `fascia` (frontalino di gronda) e `grigliato` (pannello di tamponatura), ciascuno con una famiglia di id distinta (`TAV`, `ARC`, `CAN`, `MON`, `MEN`, `FAS`, `GRG`).

#### Scenario: Creazione di una tavola
- **WHEN** viene creato un pezzo di tipo `tavola` con sezione 45×120 e lunghezza 4000
- **THEN** il pezzo è accettato con famiglia `TAV` e id nella forma `TAV-nn`

#### Scenario: Famiglie coerenti
- **WHEN** viene serializzato un pezzo `cantonale` con famiglia `PNT`
- **THEN** la validazione lo rifiuta indicando l'incoerenza tra tipo e famiglia

### Requirement: Pezzi ad asse curvo
Un pezzo di tipo `arco` SHALL dichiarare un asse curvo con raggio e angolo sotteso (gradi), nel piano locale lunghezza–altezza, tangente alla direzione della lunghezza all'origine e curvante verso l'alto; la lunghezza del pezzo MUST essere lo sviluppo dell'asse (`raggio · angolo in radianti`). Gli altri tipi MUST rifiutare la curvatura e `arco` MUST richiederla.

#### Scenario: Arco del riferimento
- **WHEN** viene creato un `arco` 90×90 con raggio 2400 e angolo 93°
- **THEN** il pezzo è accettato e la sua lunghezza è 3895 ± 1 mm

#### Scenario: Lunghezza incoerente
- **WHEN** viene creato un `arco` con raggio 2400, angolo 93° e lunghezza 3000
- **THEN** la creazione è rifiutata indicando che la lunghezza non corrisponde allo sviluppo

#### Scenario: Curvatura su una trave
- **WHEN** viene creata una `trave` con curvatura dichiarata
- **THEN** la creazione è rifiutata indicando che solo `arco` ammette la curvatura

### Requirement: Ingombro a segmenti dei pezzi curvi
Per collisioni, limiti dell'assieme e misure, un pezzo curvo SHALL essere rappresentato da una sequenza di box di segmento che contengono interamente il solido (corda allargata della freccia), con un segmento ogni 15° o meno; il box unico del pezzo intero MUST restare disponibile come inviluppo conservativo.

#### Scenario: Collisione con un ostacolo vicino alla corda
- **WHEN** un ostacolo si trova tra la corda dell'arco e l'arco stesso, senza toccare il legno
- **THEN** il controllo collisioni non segnala collisione

#### Scenario: Collisione reale
- **WHEN** un ostacolo interseca il legno dell'arco a metà sviluppo
- **THEN** il controllo collisioni segnala la collisione sul pezzo `ARC-nn`

### Requirement: Lavorazioni ammesse sui pezzi curvi
Sui pezzi curvi SHALL essere ammessi soltanto fori sulle facce laterali (asse del foro parallelo all'asse di curvatura) e tagli di testa con il solo angolo nel piano di curvatura; la posizione `at` MUST essere intesa come coordinata curvilinea lungo l'asse. Ogni altra lavorazione o un taglio di testa con secondo angolo MUST essere rifiutato con un errore che cita il pezzo e il motivo.

#### Scenario: Foro laterale sull'arco
- **WHEN** viene richiesto un foro Ø9 sulla faccia `sinistra` di un arco a `at` 3700
- **THEN** la lavorazione è accettata

#### Scenario: Becco d'uccello sull'arco
- **WHEN** viene richiesto un becco d'uccello sull'arco
- **THEN** la lavorazione è rifiutata con messaggio "non ammessa su pezzi curvi"

#### Scenario: Taglio composto sull'arco
- **WHEN** viene richiesto un taglio di testa con `angle2` diverso da zero su un arco
- **THEN** la lavorazione è rifiutata indicando che sui pezzi curvi è ammesso solo l'angolo nel piano di curvatura

### Requirement: Lavorazione asola per lama
La libreria di lavorazioni SHALL includere `asola-lama`: tasca rettangolare praticata da una faccia di testa, con larghezza (lungo la base), altezza (lungo l'altezza della sezione), profondità (lungo la lunghezza) e scostamento trasversale opzionale. L'asola MUST restare interamente dentro la sezione e non superare la lunghezza del pezzo.

#### Scenario: Asola per lama interna
- **WHEN** viene richiesta un'asola 8×68×180 dalla `testa-inizio` di un pilastro 90×90×2400
- **THEN** la lavorazione è accettata e registrata con la testa come faccia di riferimento

#### Scenario: Asola più larga della sezione
- **WHEN** viene richiesta un'asola di larghezza 100 su un pezzo di base 90
- **THEN** la lavorazione è rifiutata indicando il campo `width`

### Requirement: Lavorazione dardo di Giove
La libreria SHALL includere `dardo-di-giove`: giunzione obliqua di testa tra due pezzi in linea, definita da lunghezza di sovrapposizione, inclinazione del piano obliquo e altezza del dente centrale; il relativo giunto MUST espandersi in due lavorazioni complementari (profili specchiati) sui due pezzi, con la sovrapposizione centrata sul punto di giunzione.

#### Scenario: Giunzione di due correnti sopra un appoggio
- **WHEN** due travi collineari 45×145 si incontrano sopra un traverso e il giunto `dardo-di-giove` ha sovrapposizione 300, inclinazione 15° e dente 30
- **THEN** la testa di ciascuna trave riceve una lavorazione `dardo-di-giove` e i due profili sono complementari (l'uno è lo specchio dell'altro rispetto al punto di giunzione)

#### Scenario: Pezzi non collineari
- **WHEN** il giunto è dichiarato tra due pezzi i cui assi non sono allineati entro la tolleranza
- **THEN** l'espansione è rifiutata con un errore che cita il giunto

### Requirement: Taglio composto ricavato da un piano
Il sistema SHALL fornire una funzione che, dato un pezzo (posa e lunghezza), un piano nel sistema dell'assieme e la testa da tagliare, ricava la lavorazione `taglio-testa` equivalente (posizione e due angoli). Un piano parallelo all'asse del pezzo MUST essere rifiutato.

#### Scenario: Testa a filo muro
- **WHEN** una trave inclinata di 12° termina contro il piano verticale del muro
- **THEN** il taglio ricavato ha angolo pari a 12°, secondo angolo 0 e posizione pari all'intersezione dell'asse con il muro

#### Scenario: Cantonale contro la faccia del monaco
- **WHEN** un cantonale a 45° in pianta e pendenza 18,5° termina contro la faccia verticale di un monaco
- **THEN** il taglio ricavato ha entrambi gli angoli diversi da zero e il piano ricostruito dalla lavorazione coincide con la faccia del monaco entro 1e-6

#### Scenario: Piano parallelo all'asse
- **WHEN** il piano è parallelo all'asse del pezzo
- **THEN** la funzione restituisce un errore esplicito

### Requirement: Compatibilità del formato serializzato
La serializzazione dell'assieme SHALL includere l'elenco ferramenta e la curvatura dei pezzi curvi; la lettura MUST accettare file privi di elenco ferramenta (inteso vuoto) e privi di curvatura (pezzi dritti), così che i file prodotti prima di questa estensione restino validi.

#### Scenario: File precedente
- **WHEN** viene letto un JSON di assieme senza il campo ferramenta
- **THEN** la lettura riesce e l'elenco ferramenta è vuoto

#### Scenario: Round-trip con arco e ferramenta
- **WHEN** un assieme con un arco e tre bulloni è scritto e riletto
- **THEN** l'assieme riletto è strutturalmente identico all'originale
