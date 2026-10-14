# Spec Delta

## Purpose

Definisce come l'applicazione viene pubblicata e mantenuta in produzione: ambiente di esecuzione, variabili di configurazione, asset pesanti, migrazioni al rilascio e limiti prestazionali verificabili.

## ADDED Requirements

### Requirement: Ambiente di esecuzione
Le pagine e le API con accesso al database, generazione PDF o invio email SHALL essere eseguite nel runtime Node (non edge); l'unica logica edge ammessa è il reindirizzamento di autenticazione, che MUST NOT accedere al database. Il kernel geometrico MUST essere eseguito solo nel browser.

#### Scenario: Configurazione delle route
- **WHEN** viene ispezionata la configurazione delle route API e delle pagine server
- **THEN** nessuna dichiara il runtime edge, salvo il middleware di autenticazione

### Requirement: Variabili d'ambiente documentate
Tutte le variabili richieste (connessione al database, segreto di sessione, provider email e mittente, email dell'ufficio, URL pubblico, storage foto, amministratore iniziale) SHALL essere elencate in un file di esempio con descrizione e obbligatorietà, e MUST essere validate all'avvio: una variabile obbligatoria mancante in produzione MUST far fallire l'avvio con un messaggio che la nomina.

#### Scenario: Variabile mancante
- **WHEN** in produzione manca il segreto di sessione
- **THEN** l'applicazione non si avvia e il log indica il nome della variabile

#### Scenario: Sviluppo locale senza variabili
- **WHEN** in sviluppo non è impostata nessuna variabile
- **THEN** l'applicazione usa database in-process, email su console e storage su disco locale

### Requirement: Asset WASM e cache
Il kernel geometrico SHALL essere servito come asset statico generato in fase di build, con intestazioni di cache lunga (≥ 1 anno) e versione nel percorso o nel nome, così che un aggiornamento non serva file vecchi. Il WASM MUST essere scaricato solo quando una pagina lo richiede esplicitamente.

#### Scenario: Intestazioni di cache
- **WHEN** viene richiesto il file WASM in produzione
- **THEN** la risposta ha `Cache-Control` immutabile con durata ≥ 1 anno e tipo `application/wasm`

### Requirement: Migrazioni al rilascio
Il rilascio in produzione SHALL applicare le migrazioni del database prima di attivare la nuova versione; un fallimento delle migrazioni MUST interrompere il rilascio lasciando attiva la versione precedente. Gli ambienti di anteprima MUST usare un database separato da quello di produzione.

#### Scenario: Migrazione fallita
- **WHEN** una migrazione fallisce durante il rilascio
- **THEN** il rilascio è interrotto e il sito continua a servire la versione precedente

### Requirement: Budget prestazionale e monitoraggio
Il sito pubblico MUST rispettare i budget della capability `sito-pubblico` anche in produzione, verificati su un ambiente di anteprima prima della promozione; il tempo di risposta dell'API di stima MUST restare sotto 500 ms al 95° percentile. L'analisi del traffico, se attivata, MUST essere priva di cookie e configurabile da variabile d'ambiente.

#### Scenario: Verifica in anteprima
- **WHEN** viene misurata la home in un ambiente di anteprima
- **THEN** i punteggi di prestazioni e accessibilità sono ≥ 90 e la stima risponde sotto 500 ms

### Requirement: Backup e ripristino
I dati del database di produzione MUST essere coperti da backup giornalieri del provider con conservazione di almeno 7 giorni; la procedura di ripristino e di rollback dell'applicazione MUST essere documentata e provata almeno una volta su un ambiente di anteprima.

#### Scenario: Prova di ripristino
- **WHEN** viene eseguita la procedura documentata su un'anteprima
- **THEN** il database ripristinato contiene listini e richieste del punto di ripristino
