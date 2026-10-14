# Spec Delta

## Purpose

Pagina applicativa `/configuratore` che permette al tecnico di scegliere la tipologia, inserire parametri e ingombro, vedere violazioni e collisioni, applicare auto-dimensionamento e adattamento, salvare/caricare la configurazione ed esportare i file.

## ADDED Requirements

### Requirement: Pagina e navigazione
Il sistema SHALL esporre la pagina `/configuratore` all'interno dell'area applicativa con la stessa sidebar e header delle pagine esistenti, e la sidebar SHALL contenere la voce "CONFIGURATORE" con icona, evidenziata quando attiva.

#### Scenario: Accesso da sidebar
- **WHEN** l'utente clicca "CONFIGURATORE" nella sidebar
- **THEN** viene mostrata la pagina `/configuratore` e la voce risulta attiva

### Requirement: Layout a tre zone
La pagina SHALL mostrare un pannello parametri (sinistra), il visualizzatore 3D (centro, area predominante) e un pannello esiti/esportazioni (destra o in basso su schermi stretti). Su viewport < 1024 px i pannelli MUST essere raggiungibili tramite schede.

#### Scenario: Desktop
- **WHEN** la viewport è ≥ 1280 px
- **THEN** i tre pannelli sono visibili contemporaneamente e il viewer occupa almeno il 50% della larghezza

#### Scenario: Mobile
- **WHEN** la viewport è < 1024 px
- **THEN** parametri, 3D ed esiti sono schede e una sola è visibile alla volta

### Requirement: Form parametrico per tipologia
Il pannello parametri SHALL mostrare la selezione della tipologia e, in base a essa, i campi dichiarati dal template (con unità, min/max e default), i campi dell'ingombro (box, ostacoli, quote pavimento) e le sezioni per famiglia di pezzo. Ogni modifica MUST rigenerare l'assieme e aggiornare viewer ed esiti senza ricaricare la pagina; i valori fuori limite MUST essere segnalati inline.

#### Scenario: Cambio tipologia
- **WHEN** l'utente passa da monofalda a bifalda
- **THEN** i campi del form cambiano secondo il nuovo template mantenendo i parametri comuni compatibili

#### Scenario: Valore fuori limite
- **WHEN** l'utente inserisce una pendenza di 50°
- **THEN** il campo mostra un errore inline con l'intervallo ammesso e l'assieme non viene rigenerato

#### Scenario: Gestione ostacoli
- **WHEN** l'utente aggiunge un ostacolo di tipo grondaia e ne compila lato, posizione e dimensioni
- **THEN** l'ostacolo compare nell'elenco, nel viewer e viene considerato nel controllo collisioni

### Requirement: Pannello esiti
Il pannello esiti SHALL elencare violazioni (raggruppate per severità) e collisioni con messaggio e pezzi coinvolti, e SHALL offrire i pulsanti "Auto-dimensiona" e "Adatta all'ingombro" che applicano al form le proposte restituite dal dominio, mostrando un riepilogo delle modifiche prima di applicarle.

#### Scenario: Applicazione auto-dimensionamento
- **WHEN** l'utente preme "Auto-dimensiona" e conferma
- **THEN** i parametri proposti vengono scritti nel form, l'assieme è rigenerato e le violazioni risolte scompaiono

#### Scenario: Adattamento senza soluzione
- **WHEN** l'adattamento non trova soluzione
- **THEN** il pannello mostra la regola o l'ostacolo bloccante senza modificare il form

### Requirement: Stato e persistenza della configurazione
Lo stato della configurazione (tipologia, parametri, ingombro, opzioni export) SHALL vivere lato client e SHALL poter essere salvato come file JSON versionato (`schemaVersion`) e ricaricato da file. Lo stato MUST essere ripristinato automaticamente dall'ultima sessione (storage locale del browser) quando disponibile.

#### Scenario: Salva JSON
- **WHEN** l'utente preme "Salva configurazione"
- **THEN** viene scaricato un file `.json` con tutti i parametri e `schemaVersion`

#### Scenario: Carica JSON
- **WHEN** l'utente carica un file JSON valido
- **THEN** il form, il viewer e gli esiti riflettono la configurazione caricata

#### Scenario: JSON incompatibile
- **WHEN** l'utente carica un file con `schemaVersion` non supportata o campi non validi
- **THEN** viene mostrato un errore con il dettaglio e lo stato corrente resta invariato

#### Scenario: Ripristino sessione
- **WHEN** l'utente ricarica la pagina
- **THEN** la configurazione precedente viene ripristinata

### Requirement: Pannello esportazioni
Il pannello esportazioni SHALL mostrare le opzioni SAT (versione, modalità file, nome CAM), i pulsanti "Esporta SAT", "Esporta STEP", "Esporta distinta CSV" e lo stato di avanzamento della costruzione geometrica. I pulsanti di export CAD MUST essere disabilitati finché i solidi non sono pronti e MUST richiedere conferma se esistono errori o collisioni.

#### Scenario: Export con solidi pronti
- **WHEN** la costruzione dei solidi è completata senza errori
- **THEN** "Esporta SAT" e "Esporta STEP" sono abilitati e il clic avvia il download

#### Scenario: Export con errori
- **WHEN** esistono collisioni e l'utente preme "Esporta SAT"
- **THEN** compare una finestra di conferma che elenca i problemi e permette "Esporta comunque" o "Annulla"

### Requirement: Esempi precaricati
La pagina SHALL offrire almeno due configurazioni di esempio (una monofalda con grondaia e pavimento in pendenza, una bifalda libera) caricabili con un clic per dimostrare e testare il flusso.

#### Scenario: Carica esempio
- **WHEN** l'utente seleziona l'esempio "Monofalda con grondaia"
- **THEN** form, viewer ed esiti mostrano la configurazione di esempio
