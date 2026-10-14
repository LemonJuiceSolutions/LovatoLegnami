# Spec Delta

## Purpose

Protegge l'area interna, l'area admin e le relative API con l'accesso degli utenti Lovato, assegnando ruoli che limitano le operazioni sensibili (pubblicazione di listini, gestione utenti) e lasciando pubbliche solo le pagine del sito e le API del wizard.

## ADDED Requirements

### Requirement: Accesso senza password con collegamento via email
Gli utenti interni SHALL accedere tramite un collegamento monouso inviato all'indirizzo email registrato; un indirizzo non registrato MUST ricevere la stessa risposta neutra di uno registrato senza inviare email. Il collegamento MUST scadere entro 15 minuti e MUST essere utilizzabile una sola volta. La sessione MUST durare al più 30 giorni e MUST poter essere terminata dall'utente.

#### Scenario: Accesso riuscito
- **WHEN** un utente registrato richiede l'accesso e apre il collegamento ricevuto
- **THEN** è autenticato e reindirizzato alla pagina richiesta in origine

#### Scenario: Indirizzo non registrato
- **WHEN** viene richiesto l'accesso per un indirizzo non presente
- **THEN** la pagina mostra "Se l'indirizzo è registrato riceverai un'email" e nessuna email viene inviata

#### Scenario: Collegamento riusato
- **WHEN** un collegamento già usato viene riaperto
- **THEN** l'accesso è rifiutato con invito a richiederne uno nuovo

### Requirement: Ruoli degli utenti
Ogni utente SHALL avere esattamente uno dei ruoli `admin`, `ufficio-tecnico`, `commerciale`. Tutti i ruoli MUST poter usare il configuratore interno e leggere richieste e preventivi.

#### Scenario: Lettura comune
- **WHEN** un utente `ufficio-tecnico` apre l'elenco delle richieste
- **THEN** l'elenco è visibile in sola lettura per le azioni commerciali

### Requirement: Permessi per ruolo
`ufficio-tecnico` e `admin` MUST poter modificare e pubblicare regole costruttive, lunghezze commerciali e tariffe di lavorazione; `commerciale` e `admin` MUST poter modificare e pubblicare listini prezzi, complicazioni, trasporti, margini e gestire le richieste; solo `admin` MUST poter gestire utenti, impostazioni del sito e cancellare dati personali. Un'operazione non permessa MUST essere rifiutata con 403 e un messaggio che indica il ruolo richiesto.

#### Scenario: Commerciale pubblica il listino
- **WHEN** un utente `commerciale` pubblica una bozza di listino
- **THEN** l'operazione riesce

#### Scenario: Commerciale modifica le regole costruttive
- **WHEN** un utente `commerciale` tenta di salvare le regole costruttive
- **THEN** l'operazione è rifiutata con stato 403 e messaggio "operazione riservata all'ufficio tecnico"

#### Scenario: Gestione utenti
- **WHEN** un utente non `admin` apre la gestione utenti
- **THEN** la pagina non è accessibile

### Requirement: Protezione di pagine e API interne
Le pagine delle aree interna e admin e le API sotto i relativi percorsi SHALL richiedere una sessione valida; una richiesta anonima a una pagina MUST essere reindirizzata alla pagina di accesso conservando la destinazione, una richiesta anonima a una API MUST ricevere 401. Le pagine del sito pubblico e le API del wizard e delle richieste MUST restare accessibili senza sessione.

#### Scenario: Pagina interna anonima
- **WHEN** un visitatore anonimo apre il configuratore interno
- **THEN** è reindirizzato all'accesso e, dopo l'accesso, torna al configuratore

#### Scenario: API admin anonima
- **WHEN** una richiesta senza sessione chiama una API admin
- **THEN** la risposta è 401 senza dati

#### Scenario: Sito pubblico
- **WHEN** un visitatore anonimo apre la home o invia il wizard
- **THEN** le pagine e le API rispondono normalmente

### Requirement: Gestione utenti
Gli amministratori SHALL poter creare, disattivare e cambiare ruolo agli utenti; un utente disattivato MUST perdere immediatamente l'accesso alle API e alle pagine protette. L'ultimo amministratore attivo MUST NOT poter essere disattivato né degradato.

#### Scenario: Disattivazione
- **WHEN** un amministratore disattiva un utente con sessione aperta
- **THEN** la successiva richiesta di quell'utente riceve 401 o il reindirizzamento all'accesso

#### Scenario: Ultimo amministratore
- **WHEN** si tenta di disattivare l'unico amministratore attivo
- **THEN** l'operazione è rifiutata
