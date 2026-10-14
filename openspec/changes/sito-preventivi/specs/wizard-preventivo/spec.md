# Spec Delta

## Purpose

Guida il cliente finale, passo dopo passo e con linguaggio semplice, a configurare la propria pergola, a vederla in 3D e a ottenere un prezzo indicativo credibile, riusando il dominio del configuratore senza esporne la complessità.

## ADDED Requirements

### Requirement: Percorso a passi
Il wizard SHALL procedere in passi: tipologia, misure, spazio disponibile, copertura e finiture, riepilogo con prezzo, contatti. Il cliente MUST poter tornare indietro senza perdere i dati, lo stato MUST sopravvivere al ricaricamento della pagina nella stessa sessione e ogni passo MUST indicare avanzamento e passo corrente. Il wizard MUST essere utilizzabile da smartphone.

#### Scenario: Ricaricamento
- **WHEN** il cliente ricarica la pagina al passo 4
- **THEN** ritrova le scelte dei passi precedenti e il passo 4

#### Scenario: Avvio da una tipologia
- **WHEN** il cliente arriva dalla pagina di una tipologia
- **THEN** il passo 1 è già compilato e il wizard parte dal passo 2

### Requirement: Scelta della tipologia
Il passo tipologia SHALL mostrare solo le tipologie visibili, con miniatura, nome commerciale, breve descrizione e indicazione "a partire da", filtrabili per categoria (addossata, autoportante, carport, gazebo, pensilina). La scelta MUST impostare i parametri del preset di riferimento della tipologia.

#### Scenario: Scelta
- **WHEN** il cliente sceglie "Carport ad arco"
- **THEN** i passi successivi partono dalle misure del preset di riferimento

### Requirement: Misure con limiti comprensibili
Il passo misure SHALL chiedere larghezza, profondità (o sbalzo) e altezza sotto trave con cursori e campi in centimetri, entro i limiti della tipologia, e SHALL mostrare subito le conseguenze (numero di pilastri, interasse) e messaggi semplici per i limiti ("Oltre 6 m serve un pilastro in più"). Le opzioni costruttive e di sezione MUST essere scelte automaticamente (auto-dimensionamento) e non mostrate al cliente.

#### Scenario: Misura fuori limite
- **WHEN** il cliente imposta una larghezza oltre il massimo della tipologia
- **THEN** il campo si ferma al massimo con il messaggio "Per misure maggiori contattaci"

#### Scenario: Auto-dimensionamento invisibile
- **WHEN** il cliente aumenta la profondità oltre la luce ammessa dalla sezione di default
- **THEN** la sezione delle travi viene adeguata automaticamente e il cliente vede solo il prezzo aggiornato

### Requirement: Spazio disponibile in termini semplici
Il passo spazio SHALL chiedere, con domande semplici e illustrazioni: se la pergola è contro un muro; se il muro è "dritto" o "fuori squadra" (con inserimento delle due diagonali o di una stima dell'angolo); se il pavimento è in piano o in pendenza (dislivello in cm e verso); eventuali ostacoli da un elenco guidato (grondaia, finestra, porta, pluviale, balcone sopra, altro) con pochi campi; e la facilità di accesso al cantiere. Le risposte MUST essere tradotte nell'ingombro del dominio.

#### Scenario: Fuorisquadra dalle diagonali
- **WHEN** il cliente inserisce fronte 500, muro 500, lati 300 e 300, diagonali 590 e 576 cm
- **THEN** l'ingombro ha una pianta fuori squadra e il riepilogo mostra "muro fuori squadra di circa 2°"

#### Scenario: Grondaia
- **WHEN** il cliente aggiunge "grondaia" a 270 cm di altezza sporgente 15 cm
- **THEN** l'ingombro contiene l'ostacolo e, se la pergola la toccherebbe, il riepilogo propone l'adattamento automatico

### Requirement: Copertura e finiture
Il passo copertura SHALL proporre specie e qualità del legno, trattamento e tinta, tipo di copertura (nessuna, perline e guaina, policarbonato, lamiera, telo) con descrizione e campioni visivi; le voci disponibili MUST provenire dal listino attivo.

#### Scenario: Voci dal listino
- **WHEN** il listino attivo non prevede la copertura in lamiera
- **THEN** la lamiera non compare tra le scelte

### Requirement: Riepilogo con 3D e prezzo indicativo
Il riepilogo SHALL mostrare la pergola in 3D (in modalità box, con la possibilità di caricare il dettaglio su richiesta), le misure finali, la pianta con eventuale fuorisquadra, la vista cliente del prezzo con fascia indicativa e le eventuali note (adattamenti, ostacoli). Il prezzo MUST essere calcolato lato server con il listino attivo e MUST aggiornarsi a ogni modifica entro 1 s. Senza il kernel geometrico il riepilogo MUST funzionare integralmente.

#### Scenario: Prezzo dal server
- **WHEN** il cliente cambia la copertura
- **THEN** la richiesta di stima parte, la risposta aggiorna il prezzo e la pagina non contiene il listino

#### Scenario: Kernel non disponibile
- **WHEN** il WASM non viene caricato
- **THEN** il 3D resta in modalità box e il prezzo è comunque mostrato

### Requirement: Violazioni in linguaggio semplice
Le violazioni delle regole costruttive e le collisioni MUST essere presentate al cliente come note comprensibili ("Abbiamo ridotto la profondità a 2,9 m per passare sotto la grondaia") e MUST essere risolte automaticamente dove possibile (adattamento, auto-dimensionamento); se non risolvibili il wizard MUST proporre di proseguire con la richiesta e un contatto dell'ufficio.

#### Scenario: Adattamento automatico
- **WHEN** la configurazione collide con un ostacolo
- **THEN** il wizard applica l'adattamento e mostra la nota con le misure cambiate

#### Scenario: Non risolvibile
- **WHEN** l'ingombro è troppo basso per la tipologia
- **THEN** il wizard mostra "Questa soluzione richiede una verifica del nostro ufficio" e consente comunque la richiesta
