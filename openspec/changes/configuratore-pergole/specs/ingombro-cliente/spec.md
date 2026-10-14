# Spec Delta

## Purpose

Modella lo spazio disponibile presso il cliente (box base, ostacoli, pavimento non piano) e garantisce che la pergola generata vi stia dentro: lunghezza individuale dei pilastri, controllo collisioni di ogni pezzo e adattamento automatico alla pergola massima inseribile.

## ADDED Requirements

### Requirement: Ingombro base
L'ingombro del cliente SHALL essere definito da un box L×P×H in mm (larghezza lungo il fronte, profondità, altezza massima) con origine coincidente con quella dell'assieme. Per le tipologie addossate l'ingombro MUST indicare quale lato è il muro di appoggio (`posteriore` di default). Valori non positivi MUST essere rifiutati.

#### Scenario: Ingombro valido
- **WHEN** viene definito un ingombro 6000×3500×3000 mm con muro sul lato posteriore
- **THEN** l'ingombro è accettato e il lato muro è `posteriore`

#### Scenario: Dimensione non valida
- **WHEN** viene definito un ingombro con altezza 0
- **THEN** il sistema rifiuta con errore sul campo altezza

### Requirement: Ostacoli come box sottratti
L'ingombro SHALL contenere una lista di ostacoli, ciascuno con id, tipo (`sottomuro`, `finestra`, `grondaia`, `sporgenza`, `generico`), lato di riferimento (`posteriore`, `anteriore`, `sinistro`, `destro`, `pavimento`, `soffitto`), posizione e dimensioni in mm relative al lato. Ogni ostacolo MUST essere convertito in un box assoluto nel sistema di riferimento dell'assieme. Gli ostacoli MUST essere considerati volumi non occupabili.

#### Scenario: Grondaia sul muro posteriore
- **WHEN** viene aggiunta una grondaia sul lato posteriore a quota 2700 mm, sporgente 150 mm, alta 120 mm, per tutta la larghezza
- **THEN** l'ostacolo risulta come box assoluto largo L, profondo 150 mm dal muro, tra quota 2700 e 2820 mm

#### Scenario: Finestra sul lato sinistro
- **WHEN** viene aggiunta una finestra sul lato sinistro con offset 1000 mm dal fronte, larga 1200, alta 1400, a quota 900
- **THEN** l'ostacolo risulta come box aderente al piano del lato sinistro con quelle coordinate

#### Scenario: Ostacolo fuori dall'ingombro
- **WHEN** un ostacolo è posizionato interamente fuori dal box base
- **THEN** il sistema emette un avviso "ostacolo fuori ingombro" e lo ignora nel controllo collisioni

### Requirement: Pavimento interpolato
Il pavimento SHALL essere definito dalle quote (in mm, positive verso l'alto, zero di riferimento) ai 4 angoli del box base più un elenco opzionale di punti aggiuntivi (x, y, quota). Il sistema SHALL fornire una funzione `quotaPavimento(x, y)` che interpola bilinearmente sui 4 angoli e, in presenza di punti aggiuntivi, usa una triangolazione o interpolazione a distanza inversa che passa esattamente per i punti dati.

#### Scenario: Pavimento piano
- **WHEN** i 4 angoli hanno quota 0
- **THEN** `quotaPavimento` restituisce 0 in ogni punto

#### Scenario: Pavimento in pendenza
- **WHEN** gli angoli anteriori hanno quota 0 e quelli posteriori −100 mm
- **THEN** `quotaPavimento` al centro del box restituisce −50 mm

#### Scenario: Punto aggiuntivo rispettato
- **WHEN** viene aggiunto un punto (3000, 1500, −30) su un pavimento altrimenti piano
- **THEN** `quotaPavimento(3000, 1500)` restituisce −30 mm

#### Scenario: Punto fuori dal box
- **WHEN** si interroga `quotaPavimento` fuori dal box base
- **THEN** il valore viene estrapolato dal bordo più vicino e viene segnalato un avviso

### Requirement: Lunghezza individuale dei pilastri
Ogni pilastro SHALL ricevere la propria lunghezza come differenza tra la quota di imposta (sotto trave) e la quota del pavimento sotto il proprio piede, più l'eventuale interramento/affondamento configurato. Le travi MUST restare orizzontali (o alla pendenza di progetto) indipendentemente dal pavimento.

#### Scenario: Pilastri su pavimento in pendenza
- **WHEN** il pavimento scende di 100 mm tra fronte e retro e la quota sotto trave è 2400 mm
- **THEN** i pilastri anteriori misurano 2400 mm e quelli posteriori 2500 mm

#### Scenario: Lunghezze in distinta
- **WHEN** l'assieme è esportato in distinta
- **THEN** ogni pilastro compare con la propria lunghezza e pilastri di lunghezza diversa non vengono accorpati

### Requirement: Controllo collisioni
Il sistema SHALL verificare ogni pezzo dell'assieme (come box orientato o solido) contro il box base (pezzo deve essere interno) e contro ogni ostacolo (intersezione vietata), con tolleranza configurabile in mm (default 0). Ogni collisione MUST essere riportata con id pezzo, id ostacolo (o `ingombro`), e profondità/volume stimato di interferenza.

#### Scenario: Pezzo fuori ingombro
- **WHEN** un travetto sporge oltre l'altezza massima dell'ingombro
- **THEN** viene riportata una collisione tra il travetto e `ingombro` con la quota di sforamento

#### Scenario: Collisione con grondaia
- **WHEN** la banchina a muro interseca il box della grondaia
- **THEN** viene riportata una collisione tra la banchina e l'id della grondaia

#### Scenario: Nessuna collisione
- **WHEN** tutti i pezzi sono interni e non toccano ostacoli
- **THEN** l'elenco collisioni è vuoto

### Requirement: Adattamento automatico all'ingombro
Il sistema SHALL offrire una funzione di adattamento che, dati tipologia, ingombro e vincoli dell'utente (parametri bloccati), cerca la pergola di dimensioni massime (larghezza, profondità, altezza) che non produce collisioni e rispetta le regole costruttive, con un passo di ricerca configurabile (default 50 mm). La funzione MUST restituire i parametri trovati e le ragioni dei limiti raggiunti (quale ostacolo o regola ha fermato la crescita).

#### Scenario: Ingombro libero
- **WHEN** l'ingombro è 6000×3500×3000 senza ostacoli e la tipologia è monofalda con pendenza 15°
- **THEN** la pergola adattata ha larghezza 6000, profondità ≤ 3500 e altezza massima entro 3000 mm, con nessuna collisione

#### Scenario: Grondaia che limita l'altezza
- **WHEN** una grondaia a quota 2700 mm sporge 150 mm dal muro
- **THEN** la pergola adattata ha la banchina sotto quota 2700 mm (o arretrata) e il risultato indica la grondaia come limite

#### Scenario: Nessuna soluzione
- **WHEN** l'ingombro è troppo basso per rispettare l'altezza libera minima
- **THEN** la funzione restituisce "nessuna soluzione" con la regola bloccante
