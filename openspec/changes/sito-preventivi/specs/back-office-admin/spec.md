# Spec Delta

## Purpose

Offre all'ufficio un'area di amministrazione semplice, con form e tabelle, per impostare tutto ciò che il sito e il preventivo usano (listini, regole, complicazioni, tipologie, preset, utenti) e per seguire le richieste dei clienti, senza toccare codice né file.

## ADDED Requirements

### Requirement: Navigazione dell'area admin
L'area admin SHALL essere raggiungibile da una voce della navigazione interna e SHALL offrire sezioni distinte: Listino (legno e lunghezze, lavorazioni, ferramenta, trattamenti e coperture, montaggio, complicazioni, trasporto, margini e IVA), Regole costruttive, Tipologie sul sito, Preset, Richieste, Utenti, Registro modifiche. Ogni sezione MUST indicare lo stato della versione (attiva, bozza in corso con autore e data).

#### Scenario: Bozza in corso
- **WHEN** esiste una bozza del listino salvata da un collega
- **THEN** la sezione Listino mostra "Bozza v4 – modificata da … il …" e il pulsante "Pubblica"

### Requirement: Modifica con form e tabelle
Ogni tabella del listino e delle regole SHALL essere modificabile in pagina (aggiungi riga, modifica cella, rimuovi riga) con validazione immediata e messaggi in italiano; i valori MUST essere mostrati con unità (€/m³, €/ml, €/m², min, €/h, %, mm). La modifica MUST salvare nella bozza, mai nella versione attiva.

#### Scenario: Aggiunta di una lunghezza commerciale
- **WHEN** l'ufficio aggiunge la barra 13 500 mm per la sezione 120×240 con prezzo
- **THEN** la riga compare nella tabella delle lunghezze e il salvataggio aggiorna la bozza

#### Scenario: Valore non valido
- **WHEN** l'ufficio inserisce "abc" in una percentuale
- **THEN** la cella è evidenziata con "inserire un numero tra 0 e 100" e la bozza non viene salvata

### Requirement: Regole di complicazione comprensibili
Le regole di complicazione SHALL essere modificabili con un form a frasi (fattore, confronto, soglia, effetto, valore, etichetta mostrata al cliente) senza espressioni testuali; l'ufficio MUST poter attivare o disattivare una regola e ordinare le regole.

#### Scenario: Nuova regola
- **WHEN** l'ufficio compone "Se dislivello pavimento ≥ 100 mm allora +2 ore, etichetta 'Pavimento non in piano'"
- **THEN** la regola compare nell'elenco e il simulatore la applica a un cantiere con dislivello 150 mm

### Requirement: Simulatore di preventivo
L'area admin SHALL offrire "Simula preventivo": scelta di un preset o di una configurazione salvata, fattori di cantiere modificabili e confronto affiancato tra bozza e versione attiva del listino, con la vista ufficio completa e la vista cliente.

#### Scenario: Confronto bozza/attiva
- **WHEN** l'ufficio aumenta del 5% la manodopera nella bozza e simula "Pergola libera 4×6"
- **THEN** il simulatore mostra i due totali e la differenza riga per riga

### Requirement: Tipologie e preset sul sito
L'ufficio SHALL poter decidere per ogni tipologia registrata se è visibile sul sito, l'ordine, il titolo commerciale, il sottotitolo, la descrizione, le immagini e il "prezzo a partire da" calcolato dal preset indicato; per i preset SHALL poter modificare nome, descrizione e visibilità. Una tipologia non visibile MUST NOT comparire né nelle pagine pubbliche né nel wizard.

#### Scenario: Tipologia nascosta
- **WHEN** l'ufficio nasconde `monofalda-scalare`
- **THEN** la pagina pubblica delle tipologie e il wizard non la elencano e il suo indirizzo risponde 404

#### Scenario: Prezzo a partire da
- **WHEN** la tipologia indica il preset "Pergola libera 3×3" come riferimento
- **THEN** la scheda pubblica mostra il totale cliente di quel preset con il listino attivo, arrotondato

### Requirement: Elenco richieste e preventivi
L'area admin SHALL elencare le richieste con data, cliente, tipologia, dimensioni, totale indicativo, stato e assegnatario, con filtri per stato e ricerca; l'apertura di una richiesta SHALL mostrare dati del cliente, foto, configurazione, vista ufficio del prezzo e azioni (cambia stato, apri nel configuratore, invia preventivo definitivo, anonimizza).

#### Scenario: Filtro per stato
- **WHEN** l'ufficio filtra per `nuovo`
- **THEN** compaiono solo le richieste non ancora prese in carico

### Requirement: Accessibilità e usabilità di base
Ogni form dell'area admin MUST essere utilizzabile da tastiera, con etichette associate ai campi e messaggi di errore annunciati; le tabelle lunghe MUST avere ricerca e intestazioni fisse.

#### Scenario: Navigazione da tastiera
- **WHEN** l'ufficio compila la tabella del legno solo con la tastiera
- **THEN** può raggiungere ogni cella, salvare e leggere gli errori
