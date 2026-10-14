# Spec Delta

## Purpose

Rende esplicite e verificabili le regole costruttive aziendali (luci, interassi, sbalzi, altezze, pendenze, sezioni minime) come dati dichiarativi, le applica a un assieme generato e produce violazioni leggibili e, dove possibile, un auto-dimensionamento.

## ADDED Requirements

### Requirement: Regole come dati dichiarativi
Le regole costruttive SHALL essere definite in un set di dati (non codice sparso) con, per ogni regola: id, nome leggibile, severità (`errore` o `avviso`), tipo di vincolo e parametri. I tipi di vincolo supportati MUST includere: luce massima per sezione, interasse massimo travetti, sbalzo massimo, altezza libera minima, intervallo di pendenza, sezione minima per tipo di pezzo. Il set di regole attivo MUST essere sostituibile (es. nei test) senza modifiche al motore.

#### Scenario: Caricamento set di regole
- **WHEN** viene caricato un set di regole con 6 regole di tipi diversi
- **THEN** il motore le accetta e le elenca con id, nome e severità

#### Scenario: Regola con tipo sconosciuto
- **WHEN** il set contiene una regola con tipo di vincolo non supportato
- **THEN** il caricamento è rifiutato con errore che indica l'id della regola

### Requirement: Valutazione delle regole su un assieme
Il sistema SHALL valutare tutte le regole attive su un assieme e sui suoi parametri e restituire un elenco di violazioni, ciascuna con id regola, severità, messaggio in italiano, pezzi coinvolti (id) e, quando applicabile, valore misurato e limite. L'assieme senza violazioni di severità `errore` MUST essere considerato valido per l'export.

#### Scenario: Luce eccessiva
- **WHEN** una trave 120×240 copre una campata di 5000 mm e la regola limita la luce per quella sezione a 4500 mm
- **THEN** viene restituita una violazione `errore` con valore 5000, limite 4500 e id della trave

#### Scenario: Interasse travetti oltre il massimo
- **WHEN** l'interasse effettivo dei travetti è 900 mm e il massimo è 800 mm
- **THEN** viene restituita una violazione con il valore 900 e il limite 800

#### Scenario: Sbalzo oltre il massimo
- **WHEN** lo sbalzo di gronda è 700 mm e il massimo è 600 mm
- **THEN** viene restituita una violazione che cita lo sbalzo

#### Scenario: Altezza libera insufficiente
- **WHEN** l'altezza libera sotto la trave più bassa è 2050 mm e il minimo è 2100 mm
- **THEN** viene restituita una violazione `errore` con il valore 2050

#### Scenario: Pendenza fuori intervallo
- **WHEN** la pendenza è 4° e l'intervallo ammesso è 8°–30°
- **THEN** viene restituita una violazione che indica l'intervallo

#### Scenario: Assieme conforme
- **WHEN** un assieme rispetta tutte le regole
- **THEN** l'elenco violazioni è vuoto e l'assieme è marcato valido

### Requirement: Tabella luci per sezione
La regola di luce massima SHALL usare una tabella dati sezione → luce massima per ogni famiglia di pezzo (trave, travetto, colmo, puntone). Per una sezione non in tabella il sistema MUST segnalare un avviso "sezione non tabellata" invece di assumere un valore.

#### Scenario: Sezione tabellata
- **WHEN** un travetto 80×160 copre 3200 mm e la tabella indica 3500 mm
- **THEN** nessuna violazione per quel pezzo

#### Scenario: Sezione non tabellata
- **WHEN** un pezzo usa una sezione assente dalla tabella
- **THEN** viene emesso un avviso "sezione non tabellata" con id pezzo

### Requirement: Auto-dimensionamento
Il sistema SHALL offrire una funzione di auto-dimensionamento che, dato un assieme con violazioni risolvibili (luce per sezione, interasse travetti, sezione minima), propone parametri corretti scegliendo la sezione commerciale più piccola che rispetta la luce e riducendo l'interasse al valore massimo ammesso. La funzione MUST restituire la lista delle modifiche proposte e non MUST modificare l'assieme originale.

#### Scenario: Sezione trave aumentata
- **WHEN** una trave 120×200 viola la luce e la prima sezione in tabella che la rispetta è 120×240
- **THEN** l'auto-dimensionamento propone "trave: 120×200 → 120×240"

#### Scenario: Interasse ridotto
- **WHEN** l'interasse 900 mm viola il massimo 800 mm
- **THEN** l'auto-dimensionamento propone un interasse ≤ 800 mm che divide esattamente la larghezza utile

#### Scenario: Violazione non risolvibile automaticamente
- **WHEN** l'unica violazione è l'altezza libera insufficiente
- **THEN** l'auto-dimensionamento non propone modifiche e la violazione resta a carico dell'utente

### Requirement: Set di regole di default Lovato
Il sistema SHALL includere un set di regole di default con valori iniziali plausibili per legno lamellare/massello da pergola (pendenza 5°–35°, altezza libera minima 2100 mm, sbalzo massimo 800 mm, interasse travetti massimo 800 mm, tabella luci per le sezioni di catalogo). I valori MUST essere modificabili nei dati senza ricompilare la logica e MUST essere documentati come "da validare con l'ufficio tecnico".

#### Scenario: Valori di default presenti
- **WHEN** viene caricato il set di default
- **THEN** tutte le sezioni del catalogo hanno una luce massima in tabella per trave e travetto
