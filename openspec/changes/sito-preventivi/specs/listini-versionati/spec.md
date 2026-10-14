# Spec Delta

## Purpose

Gestisce gli insiemi di dati configurabili dall'ufficio (listino, regole costruttive, impostazioni delle tipologie, preset) come documenti versionati con stati bozza/attiva/archiviata, data di validità, pubblicazione controllata, registro delle modifiche e scambio CSV.

## ADDED Requirements

### Requirement: Documenti versionati con stati
Ogni insieme di dati configurabile SHALL esistere in versioni numerate con stato `bozza`, `attiva` o `archiviata`, data di inizio validità, note, autore e date di creazione e pubblicazione. Per ogni insieme MUST esistere al più una versione attiva per data di validità; la pubblicazione di una bozza la rende attiva e archivia la versione attiva precedente con la stessa validità.

#### Scenario: Pubblicazione
- **WHEN** l'ufficio pubblica la bozza v3 del listino
- **THEN** v3 diventa attiva, v2 passa ad archiviata e la data di pubblicazione è registrata

#### Scenario: Bozza unica per insieme
- **WHEN** esiste già una bozza e si tenta di crearne un'altra
- **THEN** il sistema apre la bozza esistente invece di crearne una nuova

### Requirement: Validazione prima del salvataggio
Ogni versione SHALL essere validata con lo schema del rispettivo documento al salvataggio della bozza e alla pubblicazione; un documento non valido MUST essere rifiutato con l'elenco dei campi errati e la bozza precedente MUST restare intatta.

#### Scenario: Prezzo negativo
- **WHEN** l'ufficio salva un prezzo del legno negativo
- **THEN** il salvataggio fallisce citando il campo e la bozza resta quella precedente

### Requirement: Registro delle modifiche
Ogni creazione, salvataggio, pubblicazione, archiviazione, import e cancellazione SHALL produrre una voce di registro con utente, data e ora, insieme di dati, versione, azione e differenza rispetto allo stato precedente. Il registro MUST essere consultabile per insieme e per utente e MUST NOT essere modificabile dall'interfaccia.

#### Scenario: Differenza registrata
- **WHEN** l'ufficio cambia il prezzo dell'abete da 650 a 680 €/m³ e salva
- **THEN** il registro contiene una voce con il percorso del campo, valore precedente e nuovo e l'utente

### Requirement: Import ed export CSV del listino
Il listino SHALL essere esportabile per tabelle in CSV (separatore `;`, UTF-8 con BOM, decimali con virgola) e re-importabile nella bozza; l'import MUST mostrare un'anteprima delle differenze (righe aggiunte, modificate, rimosse, errori) e MUST applicarsi solo dopo conferma. Righe con codici sconosciuti o numeri non validi MUST essere rifiutate con numero di riga e motivo.

#### Scenario: Round-trip
- **WHEN** la tabella dei prezzi del legno viene esportata e re-importata senza modifiche
- **THEN** l'anteprima non riporta differenze

#### Scenario: Riga errata
- **WHEN** il CSV contiene "abete;lamellare;12a" come prezzo
- **THEN** l'import è rifiutato con "riga 3: prezzo non numerico"

### Requirement: Confronto tra versioni
Il sistema SHALL mostrare la differenza tra la bozza e la versione attiva (e tra due versioni qualsiasi) come elenco di campi con valore precedente e nuovo, leggibile dall'ufficio prima di pubblicare.

#### Scenario: Diff prima della pubblicazione
- **WHEN** l'ufficio apre "Pubblica" con tre prezzi cambiati
- **THEN** il riepilogo elenca esattamente le tre differenze
