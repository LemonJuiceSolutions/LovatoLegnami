# Spec Delta

## Purpose

Definisce il catalogo dei componenti primitivi in legno e la libreria delle lavorazioni/giunti parametrici, cioè il modello dati di un "pezzo lavorato" che tutte le altre capability (tipologie, regole, geometria, export) consumano senza dipendere dal kernel geometrico o dall'interfaccia.

## ADDED Requirements

### Requirement: Catalogo dei componenti primitivi
Il sistema SHALL fornire un catalogo chiuso di tipi di componente primitivo: `pilastro`, `trave`, `travetto` (arcareccio), `puntone`, `colmo`, `controvento` (saetta), `banchina`. Ogni pezzo istanziato da un tipo MUST avere un identificativo univoco nell'assieme, una sezione rettangolare (base × altezza in mm), una lunghezza in mm, una posa (origine + orientamento) nello spazio dell'assieme e un'etichetta leggibile.

#### Scenario: Creazione di un pezzo valido
- **WHEN** viene creato un pezzo di tipo `trave` con sezione 160×200 mm, lunghezza 4000 mm e posa definita
- **THEN** il pezzo è accettato e espone id, tipo, sezione, lunghezza, posa ed etichetta

#### Scenario: Tipo non in catalogo
- **WHEN** viene richiesto un pezzo con tipo non presente nel catalogo
- **THEN** il sistema rifiuta la creazione con un errore che indica il tipo non supportato

#### Scenario: Dimensioni non positive
- **WHEN** viene creato un pezzo con sezione o lunghezza minore o uguale a zero
- **THEN** il sistema rifiuta la creazione con un errore che indica il campo non valido

### Requirement: Catalogo sezioni commerciali
Il sistema SHALL fornire un elenco dati di sezioni commerciali disponibili (es. 100×100, 120×120, 140×140, 160×160, 80×160, 100×200, 120×240, 160×200, 60×120, 60×80) modificabile come dati senza toccare la logica. Ogni sezione MUST essere identificata da base e altezza in mm.

#### Scenario: Selezione sezione da catalogo
- **WHEN** l'utente o l'auto-dimensionamento richiede la sezione "120×240"
- **THEN** il sistema restituisce la sezione con base 120 mm e altezza 240 mm

#### Scenario: Ordinamento per resistenza
- **WHEN** viene richiesto l'elenco delle sezioni compatibili con un orientamento (altezza utile a flessione)
- **THEN** il sistema restituisce le sezioni ordinate per altezza crescente, poi base crescente

### Requirement: Libreria di lavorazioni parametriche
Il sistema SHALL fornire una libreria di lavorazioni applicabili ai pezzi: `mezzo-legno`, `tenone`, `mortasa`, `becco-uccello` (taglio gronda/appoggio inclinato), `foro` (ferramenta, cilindrico passante o cieco), `taglio-testa` (taglio di testa inclinato, uno o due angoli). Ogni lavorazione MUST avere un tipo, parametri numerici in mm e gradi, una posizione lungo l'asse del pezzo e la faccia di riferimento, e MUST riferire il pezzo a cui appartiene.

#### Scenario: Lavorazione con parametri completi
- **WHEN** a un `travetto` viene aggiunto un `becco-uccello` con profondità 30 mm, angolo 18° a 350 mm dall'inizio sulla faccia inferiore
- **THEN** la lavorazione è registrata sul pezzo e consultabile con i suoi parametri

#### Scenario: Lavorazione fuori dal pezzo
- **WHEN** una lavorazione è posizionata oltre la lunghezza del pezzo o con profondità maggiore della sezione
- **THEN** il sistema segnala un errore di lavorazione non applicabile indicando pezzo e lavorazione

#### Scenario: Lavorazione con tipo sconosciuto
- **WHEN** viene richiesta una lavorazione con tipo non presente nella libreria
- **THEN** il sistema rifiuta la richiesta con un errore esplicito

### Requirement: Giunti come coppie di lavorazioni coerenti
Il sistema SHALL permettere di definire un giunto tra due pezzi come insieme di lavorazioni coerenti su entrambi (es. tenone sul puntone e mortasa sulla trave; mezzo legno su entrambe le travi). Il giunto MUST riferire i due pezzi e MUST generare lavorazioni con dimensioni complementari (il tenone entra nella mortasa con il gioco configurato).

#### Scenario: Giunto tenone-mortasa
- **WHEN** viene definito un giunto `tenone-mortasa` tra un `puntone` e una `trave` con tenone 40×80×60 mm e gioco 1 mm
- **THEN** il puntone riceve un `tenone` 40×80×60 e la trave una `mortasa` 41×81×61 nella posizione di incrocio

#### Scenario: Giunto mezzo legno
- **WHEN** viene definito un giunto `mezzo-legno` tra due travi che si incrociano
- **THEN** ogni trave riceve una lavorazione `mezzo-legno` profonda metà della propria altezza nella zona di sovrapposizione

### Requirement: Serializzazione del pezzo lavorato
Il sistema SHALL serializzare e deserializzare pezzi, lavorazioni e giunti in JSON stabile (chiavi documentate, unità mm/gradi) in modo che un assieme possa essere salvato, ricaricato e confrontato nei test.

#### Scenario: Round-trip JSON
- **WHEN** un assieme con pezzi e lavorazioni viene serializzato in JSON e poi deserializzato
- **THEN** il risultato è strutturalmente identico all'originale

#### Scenario: JSON non valido
- **WHEN** viene deserializzato un JSON con campo obbligatorio mancante o tipo errato
- **THEN** il sistema restituisce un errore di validazione che indica il percorso del campo
