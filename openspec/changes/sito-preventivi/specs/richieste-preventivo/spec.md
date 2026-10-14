# Spec Delta

## Purpose

Raccoglie la richiesta di preventivo del cliente al termine del wizard, la conserva con tutto il necessario per riprodurla, avvisa cliente e ufficio e accompagna la richiesta fino al preventivo definitivo prodotto dall'ufficio nel configuratore interno.

## ADDED Requirements

### Requirement: Invio della richiesta
Il passo contatti SHALL raccogliere nome, email, telefono, CAP e comune del cantiere, note, fino a 5 foto opzionali (max 8 MB ciascuna, solo immagini) e il consenso esplicito al trattamento dei dati con collegamento all'informativa. L'invio MUST salvare richiesta e preventivo con istantanea di configurazione, listino, regole, fattori di cantiere e scomposizione, MUST assegnare un codice leggibile (es. `PRV-2026-00042`) e MUST essere protetto da invii automatici e ripetuti.

#### Scenario: Invio riuscito
- **WHEN** il cliente compila i campi obbligatori, accetta il consenso e invia
- **THEN** la richiesta è salvata con stato `nuovo`, il codice è mostrato nella pagina di conferma e la configurazione salvata riproduce il riepilogo

#### Scenario: Consenso mancante
- **WHEN** il cliente invia senza consenso
- **THEN** l'invio è bloccato con il messaggio sul campo consenso

#### Scenario: Invio ripetuto
- **WHEN** lo stesso indirizzo IP invia più di 5 richieste in 10 minuti
- **THEN** le richieste successive sono rifiutate con 429 e un messaggio cortese

#### Scenario: File non immagine
- **WHEN** il cliente allega un PDF come foto
- **THEN** il file è rifiutato con "sono ammesse solo immagini"

### Requirement: Riepilogo PDF
Per ogni preventivo il sistema SHALL generare un PDF in italiano con dati del cliente, codice, data, tipologia, misure, pianta, immagine della pergola, vista cliente del prezzo con fascia indicativa, note e condizioni ("prezzo indicativo, soggetto a sopralluogo"). Il PDF MUST essere riproducibile dall'istantanea e MUST NOT contenere dati interni.

#### Scenario: PDF dall'istantanea
- **WHEN** il PDF viene rigenerato dopo la pubblicazione di un nuovo listino
- **THEN** riporta gli stessi importi della prima generazione

### Requirement: Notifiche email
All'invio il sistema SHALL inviare al cliente un'email di conferma con il PDF allegato e all'ufficio un'email con i dati essenziali e il collegamento alla richiesta nell'area admin. L'invio delle email MUST avvenire tramite un adattatore sostituibile; un errore del provider MUST NOT impedire il salvataggio della richiesta e MUST essere registrato per il nuovo tentativo.

#### Scenario: Provider non disponibile
- **WHEN** il provider email risponde con errore
- **THEN** la richiesta risulta salvata, la pagina di conferma è mostrata e la richiesta è marcata "email da reinviare"

#### Scenario: Reinvio dall'admin
- **WHEN** l'ufficio preme "Reinvia email" su una richiesta
- **THEN** le email vengono reinviate e l'esito registrato

### Requirement: Stati e presa in carico
Le richieste SHALL avere stati `nuovo`, `in-lavorazione`, `preventivo-inviato`, `accettato`, `rifiutato`, `archiviato`, un assegnatario e una cronologia di cambi di stato con autore e data. Il passaggio a `preventivo-inviato` MUST richiedere un preventivo definitivo salvato.

#### Scenario: Presa in carico
- **WHEN** un utente apre una richiesta `nuovo` e preme "Prendo in carico"
- **THEN** lo stato diventa `in-lavorazione` e l'assegnatario è l'utente

### Requirement: Apertura nel configuratore interno
Dalla richiesta l'ufficio SHALL poter aprire il configuratore interno con la configurazione del cliente caricata (tipologia, parametri, ingombro con pianta e ostacoli, finiture), modificarla, produrre gli export CNC e salvare un preventivo definitivo collegato alla richiesta, con righe aggiuntive manuali (sopralluogo, extra) e sconti, che sostituisce quello indicativo nella comunicazione al cliente.

#### Scenario: Caricamento della configurazione
- **WHEN** l'ufficio preme "Apri nel configuratore"
- **THEN** il configuratore mostra la stessa pergola del riepilogo del cliente, con pianta e ostacoli

#### Scenario: Preventivo definitivo
- **WHEN** l'ufficio salva il preventivo definitivo con una riga manuale "sopralluogo"
- **THEN** la richiesta ha due preventivi (indicativo e definitivo), il PDF del definitivo include la riga e il totale aggiornato

### Requirement: Collegamento per il cliente
L'email al cliente SHALL contenere un collegamento con token non indovinabile per rivedere il riepilogo e scaricare il PDF, valido 90 giorni; il collegamento MUST NOT dare accesso ad altre richieste né a dati interni.

#### Scenario: Token scaduto
- **WHEN** il cliente apre il collegamento dopo 90 giorni
- **THEN** la pagina invita a contattare l'ufficio e non mostra il preventivo
