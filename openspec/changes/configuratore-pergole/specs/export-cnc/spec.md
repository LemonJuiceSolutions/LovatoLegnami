# Spec Delta

## Purpose

Produce i file che escono dal configuratore verso la produzione: il CAD 3D in formato SAT (ACIS) per il centro di lavoro CNC, il modello STEP per interscambio e la distinta pezzi CSV, con opzioni configurabili e controlli di validità strutturale.

## ADDED Requirements

### Requirement: Export SAT dell'assieme
Il sistema SHALL esportare l'assieme in formato SAT testuale (ACIS) con un body nominato per ogni pezzo, dove il nome del body è l'id del pezzo e la geometria è espressa in millimetri nel sistema di riferimento dell'assieme. L'export MUST essere bloccato se l'assieme contiene violazioni di severità `errore` o collisioni, salvo conferma esplicita dell'utente ("esporta comunque").

#### Scenario: Export assieme valido
- **WHEN** l'utente esporta un assieme senza errori con 20 pezzi
- **THEN** viene prodotto un file `.sat` contenente 20 body, ognuno con attributo nome uguale all'id del pezzo

#### Scenario: Export bloccato
- **WHEN** l'assieme ha una collisione e l'utente non conferma
- **THEN** l'export non viene eseguito e viene mostrato il motivo

#### Scenario: Export forzato
- **WHEN** l'assieme ha avvisi (non errori)
- **THEN** l'export procede senza richiedere conferma

### Requirement: Opzioni SAT configurabili
Le opzioni dell'export SAT SHALL includere: versione del formato (default `7.0`, selezionabile tra un elenco supportato), modalità file (`assieme-unico` oppure `un-file-per-pezzo` consegnati in un archivio ZIP), unità (`mm`, fissa nel MVP ma dichiarata nell'header), inclusione o meno del nome body come attributo, e un campo libero "produttore/CAM" salvato nell'header. Le opzioni MUST essere persistite con la configurazione.

#### Scenario: Un file per pezzo
- **WHEN** l'utente sceglie `un-file-per-pezzo` per un assieme di 20 pezzi
- **THEN** viene prodotto uno ZIP con 20 file `.sat`, ciascuno nominato con l'id del pezzo e contenente un solo body

#### Scenario: Versione selezionata
- **WHEN** l'utente sceglie la versione `21.0`
- **THEN** l'header del file dichiara la versione 21.0 e la sintassi delle entità è quella richiesta da tale versione

### Requirement: Struttura valida del file SAT
Il file SAT prodotto SHALL rispettare la struttura ACIS testuale: header a 3 righe (versione, conteggi, unità/tolleranze), elenco di entità indicizzate con riferimenti tramite indice (`$n`) o `$-1`, terminatore `End-of-ACIS-data`. La topologia di ogni body MUST essere completa (body → lump → shell → face → loop → coedge → edge → vertex → point, con geometria `plane-surface`, `cone-surface` per i cilindri, `straight-curve`, `ellipse-curve` per i cerchi).

#### Scenario: Conteggio entità coerente
- **WHEN** viene esportato un parallelepipedo
- **THEN** il file contiene esattamente 1 body, 1 lump, 1 shell, 6 face, 6 loop, 24 coedge, 12 edge, 8 vertex, 8 point, 6 plane-surface e 12 straight-curve

#### Scenario: Integrità dei riferimenti
- **WHEN** il file viene analizzato
- **THEN** ogni riferimento `$n` punta a un'entità esistente e di tipo compatibile con il campo, e nessun'entità è irraggiungibile dal body

#### Scenario: Faccia cilindrica
- **WHEN** viene esportato un pezzo con un foro passante
- **THEN** il file contiene una `cone-surface` con semiangolo zero (cilindro) e gli spigoli circolari sono `ellipse-curve`

#### Scenario: Superficie non supportata
- **WHEN** un solido contiene una faccia di tipo non piano né cilindrico
- **THEN** l'export SAT fallisce per quel pezzo con un messaggio che indica pezzo e tipo di superficie, e gli altri pezzi vengono esportati

### Requirement: Validazione contro SAT campione della CNC
La documentazione dell'export SHALL indicare che il formato va validato importando un file prodotto nel CAM della macchina CNC e confrontandolo con un SAT campione accettato dalla macchina; il sistema SHALL fornire uno strumento di confronto che riporta differenze in versione header, unità, entità usate e attributi.

#### Scenario: Confronto con campione
- **WHEN** viene fornito un SAT campione con versione 7.0 e il nostro usa 21.0
- **THEN** il confronto riporta la differenza di versione e suggerisce l'opzione da cambiare

### Requirement: Export STEP
Il sistema SHALL esportare l'assieme in formato STEP (AP214 o AP242) tramite il kernel geometrico, con un solido per pezzo nominato con l'id del pezzo, in millimetri.

#### Scenario: Export STEP
- **WHEN** l'utente esporta in STEP un assieme di 20 pezzi
- **THEN** viene prodotto un file `.step` leggibile che contiene 20 solidi nominati

### Requirement: Distinta pezzi CSV
Il sistema SHALL esportare una distinta CSV (separatore `;`, codifica UTF-8 con BOM, decimali con virgola) con colonne `ID;Tipo;Sezione;Lunghezza;Quantità;Lavorazioni`. I pezzi identici per tipo, sezione, lunghezza e lavorazioni MUST essere raggruppati con quantità > 1 elencando gli id; i pilastri di lunghezza diversa MUST restare righe separate.

#### Scenario: Raggruppamento travetti
- **WHEN** l'assieme ha 11 travetti identici
- **THEN** la distinta ha una riga per i travetti con quantità 11 e gli 11 id elencati

#### Scenario: Pilastri di lunghezze diverse
- **WHEN** 3 pilastri misurano 2400, 2400 e 2500 mm
- **THEN** la distinta ha due righe: quantità 2 (2400) e quantità 1 (2500)

### Requirement: Download e nomi file
I file esportati SHALL essere scaricati dal browser con nome `pergola-<tipologia>-<AAAAMMGG-HHMM>.<ext>` e, per lo ZIP, con i file interni nominati `<id-pezzo>.sat`.

#### Scenario: Nome file
- **WHEN** l'utente esporta una monofalda il 14/10/2026 alle 09:30
- **THEN** il file si chiama `pergola-addossata-monofalda-20261014-0930.sat`
