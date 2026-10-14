# Spec Delta

## Purpose

Estende l'ingombro del cliente con la pianta non rettangolare (muro fuori squadra, misurato dal cliente con le diagonali o dall'ufficio con gli angoli) e con i fattori di cantiere che alimentano le regole di complicazione del preventivo.

## ADDED Requirements

### Requirement: Pianta quadrilatera dell'ingombro
L'ingombro SHALL ammettere una pianta quadrilatera definita dai quattro angoli in pianta (anteriore sinistro, anteriore destro, posteriore destro, posteriore sinistro), con la pianta rettangolare come default equivalente al box. Il quadrilatero MUST essere convesso, con lati di lunghezza positiva; in caso contrario la validazione fallisce citando l'angolo. Il box base MUST coincidere con il rettangolo che contiene la pianta.

#### Scenario: Pianta di default
- **WHEN** l'ingombro non dichiara una pianta
- **THEN** la pianta è il rettangolo del box e tutte le deviazioni dallo squadro sono 0°

#### Scenario: Muro fuori squadra
- **WHEN** la pianta ha il lato posteriore ruotato di 5° rispetto al fronte
- **THEN** la deviazione del lato posteriore è 5° e la profondità dell'ingombro varia lungo la larghezza

#### Scenario: Pianta non convessa
- **WHEN** un angolo rientra verso l'interno
- **THEN** la validazione fallisce con il nome dell'angolo

### Requirement: Fuorisquadra dalle diagonali
Il sistema SHALL ricavare la pianta dalle misure prese dal cliente: larghezza al fronte, larghezza al muro, profondità ai due lati e le due diagonali. Il sistema MUST verificare la coerenza delle misure (tolleranza configurabile, default 20 mm) e MUST rifiutare misure incoerenti con un messaggio comprensibile.

#### Scenario: Diagonali uguali
- **WHEN** le due diagonali sono uguali e larghezze e profondità coincidono a coppie
- **THEN** la pianta è rettangolare

#### Scenario: Diagonali diverse
- **WHEN** fronte 5000, muro 5000, profondità 3000 e 3000, diagonali 5900 e 5760
- **THEN** la pianta è un parallelogramma con deviazione dallo squadro diversa da 0° e la deviazione è riportata in gradi con un decimale

#### Scenario: Misure incoerenti
- **WHEN** le misure non possono formare alcun quadrilatero entro la tolleranza
- **THEN** il sistema rifiuta con "misure non coerenti: ricontrolla le diagonali"

### Requirement: Piano del muro e lati reali
Il sistema SHALL fornire, per ogni lato della pianta, il piano verticale corrispondente nel sistema dell'assieme, e per il lato muro il piano del muro con la normale verso l'interno. Gli ostacoli riferiti a un lato MUST essere posizionati rispetto al lato reale (eventualmente inclinato), non al lato del box.

#### Scenario: Piano del muro inclinato
- **WHEN** il lato posteriore è fuori squadra di 5°
- **THEN** il piano del muro ha normale inclinata di 5° rispetto a −Y nel piano orizzontale

#### Scenario: Grondaia sul muro inclinato
- **WHEN** una grondaia è dichiarata sul lato posteriore per tutta la larghezza
- **THEN** il suo volume segue il lato inclinato e sporge verso l'interno della sporgenza dichiarata

### Requirement: Collisioni e adattamento sulla pianta
Il controllo delle collisioni SHALL considerare "fuori ingombro" ogni vertice di pezzo esterno al prisma della pianta (oltre che sopra l'altezza o sotto il pavimento), con il lato più sforato come causa; l'adattamento all'ingombro SHALL lavorare sullo stesso prisma. Con pianta rettangolare i risultati MUST coincidere con quelli del box.

#### Scenario: Travetto oltre il muro inclinato
- **WHEN** un travetto attraversa il piano del muro inclinato
- **THEN** viene riportata una collisione con `ingombro` e lato `posteriore`

#### Scenario: Equivalenza con il box
- **WHEN** la pianta è rettangolare
- **THEN** collisioni e adattamento producono gli stessi risultati dei test esistenti

### Requirement: Fattori di cantiere
Il sistema SHALL calcolare da ingombro e assieme i fattori di cantiere: deviazione massima dallo squadro (gradi), deviazione del lato muro, pendenza e dislivello del pavimento, numero di ostacoli che interessano l'impronta della pergola, altezza massima e altezza libera, affondamento, più i fattori dichiarati (difficoltà di accesso, tipo di ancoraggio). Il risultato MUST essere serializzabile e deterministico.

#### Scenario: Cantiere semplice
- **WHEN** l'ingombro è rettangolare, il pavimento piano e senza ostacoli
- **THEN** i fattori sono tutti nulli salvo altezze e accesso dichiarato

#### Scenario: Ostacoli che interessano la pergola
- **WHEN** l'ingombro ha 3 ostacoli ma solo 2 intersecano l'impronta in pianta della pergola estesa in altezza
- **THEN** il numero di ostacoli rilevanti è 2
