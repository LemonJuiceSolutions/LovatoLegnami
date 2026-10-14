# Spec Delta

## Purpose

Mostra all'utente, in tempo reale, la pergola configurata nel contesto dell'ingombro del cliente: pezzi, ostacoli, pavimento, collisioni e violazioni, con navigazione libera e selezione dei pezzi.

## ADDED Requirements

### Requirement: Rendering dell'assieme
Il visualizzatore SHALL rendere tutti i pezzi dell'assieme con la loro posa, usando le mesh dei solidi quando disponibili e, in attesa o in caso di errore del kernel, dei box semplificati sezione × lunghezza. I pezzi MUST essere colorati per famiglia (pilastri, travi, travetti, puntoni, colmo, controventi, banchina) con legenda.

#### Scenario: Assieme aggiornato
- **WHEN** l'utente cambia un parametro e l'assieme viene rigenerato
- **THEN** la scena si aggiorna mostrando i nuovi pezzi entro 100 ms in modalità box e sostituendo con le mesh reali appena pronte

#### Scenario: Fallback senza kernel
- **WHEN** il kernel non è disponibile
- **THEN** tutti i pezzi sono mostrati come box e un avviso indica la modalità semplificata

### Requirement: Ingombro, ostacoli e pavimento
Il visualizzatore SHALL mostrare il box dell'ingombro come wireframe, gli ostacoli come volumi semitrasparenti distinguibili per tipo, e il pavimento come superficie interpolata (griglia) con le quote agli angoli. Ognuno di questi livelli MUST poter essere nascosto o mostrato.

#### Scenario: Toggle ostacoli
- **WHEN** l'utente disattiva il livello "ostacoli"
- **THEN** gli ostacoli non sono più visibili ma la pergola e l'ingombro restano

#### Scenario: Pavimento in pendenza
- **WHEN** il pavimento ha quote diverse agli angoli
- **THEN** la superficie del pavimento è inclinata e i pilastri appoggiano visivamente su di essa

### Requirement: Evidenziazione collisioni e violazioni
I pezzi coinvolti in collisioni o in violazioni di severità `errore` SHALL essere evidenziati con un colore dedicato; al passaggio del puntatore o alla selezione MUST comparire un'etichetta con id, tipo, sezione, lunghezza e i messaggi associati.

#### Scenario: Pezzo in collisione
- **WHEN** un travetto interseca la grondaia
- **THEN** il travetto è reso in rosso e la selezione mostra "collisione con grondaia"

#### Scenario: Selezione da elenco
- **WHEN** l'utente clicca una violazione nel pannello
- **THEN** i pezzi coinvolti vengono evidenziati e la camera li inquadra

### Requirement: Navigazione e viste
Il visualizzatore SHALL offrire orbita, pan, zoom con mouse/touch, viste predefinite (prospettica, fronte, lato, pianta), un pulsante "inquadra tutto" e una griglia di riferimento con assi. L'unità visualizzata MUST essere il millimetro.

#### Scenario: Vista pianta
- **WHEN** l'utente seleziona "pianta"
- **THEN** la camera si posiziona dall'alto in proiezione ortografica inquadrando l'intero ingombro

#### Scenario: Inquadra tutto
- **WHEN** l'utente preme "inquadra tutto"
- **THEN** la camera inquadra l'unione dei bounding box di pergola e ingombro

### Requirement: Quote principali
Il visualizzatore SHALL mostrare, attivabili, le quote principali: larghezza, profondità, altezza sotto trave, altezza massima e pendenza.

#### Scenario: Quote attive
- **WHEN** il livello "quote" è attivo
- **THEN** le cinque quote principali sono visibili e aggiornate ai valori correnti
