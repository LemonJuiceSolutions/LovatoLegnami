# Spec Delta

## Purpose

Conserva in un database relazionale i dati configurabili, gli utenti, le richieste e i preventivi, con migrazioni ripetibili, un seme ricavato dai dati di dominio e un ambiente di sviluppo e test che non richiede servizi esterni.

## ADDED Requirements

### Requirement: Schema con migrazioni ripetibili
Lo schema del database SHALL essere definito nel codice e applicato tramite migrazioni versionate, eseguibili più volte senza effetti sul database già aggiornato. Un'istanza vuota MUST essere portata allo schema corrente con un solo comando.

#### Scenario: Database vuoto
- **WHEN** le migrazioni vengono eseguite su un database vuoto
- **THEN** tutte le tabelle esistono e una seconda esecuzione non produce modifiche

### Requirement: Seme dai dati di dominio
Il sistema SHALL popolare un database vuoto con la prima versione attiva di listino, regole costruttive (dall'attuale set di default), impostazioni delle tipologie (tutte le tipologie registrate, visibilità iniziale configurabile), preset e un utente amministratore iniziale indicato da variabili d'ambiente. Il seme MUST essere idempotente.

#### Scenario: Seme iniziale
- **WHEN** il seme viene eseguito su un database migrato e vuoto
- **THEN** esistono una versione attiva di listino e di regole, una riga per ogni tipologia registrata e l'utente amministratore

#### Scenario: Seme ripetuto
- **WHEN** il seme viene eseguito una seconda volta
- **THEN** non vengono create nuove versioni né duplicati

### Requirement: Ambiente locale senza servizi esterni
Sviluppo locale e test automatici SHALL poter usare un database Postgres in-process su file o in memoria, selezionato da configurazione, con le stesse migrazioni della produzione. La suite di test del database MUST completarsi in meno di 30 secondi.

#### Scenario: Test in memoria
- **WHEN** i test del database vengono eseguiti senza variabili di connessione
- **THEN** usano il database in memoria, applicano le migrazioni e passano

### Requirement: Istantanee riproducibili dei preventivi
Ogni preventivo salvato SHALL conservare la configurazione completa, la versione di listino e di regole usate, i fattori di cantiere e la scomposizione dei prezzi al momento del calcolo, così che possa essere riletto identico anche dopo la pubblicazione di nuove versioni.

#### Scenario: Nuovo listino dopo il preventivo
- **WHEN** viene pubblicato un nuovo listino e si riapre un preventivo precedente
- **THEN** la scomposizione mostrata è quella salvata e l'interfaccia indica che esiste un listino più recente

### Requirement: Dati personali e cancellazione
I dati personali delle richieste SHALL essere conservati con il consenso registrato (testo dell'informativa, versione, data e ora) e MUST poter essere cancellati o anonimizzati su richiesta da un amministratore, mantenendo i dati tecnici del preventivo.

#### Scenario: Anonimizzazione
- **WHEN** un amministratore anonimizza una richiesta
- **THEN** nome, contatti, indirizzo e foto sono rimossi e la configurazione e i prezzi restano
