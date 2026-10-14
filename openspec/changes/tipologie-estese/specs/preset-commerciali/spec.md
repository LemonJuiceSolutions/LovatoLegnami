# Spec Delta

## Purpose

Catalogo di configurazioni complete (tipologia, parametri, ingombro) tratte dal riferimento commerciale, usabili come punto di partenza nel configuratore e verificate automaticamente contro le distinte rilevate.

## ADDED Requirements

### Requirement: Catalogo di preset
Il sistema SHALL fornire un catalogo dati di preset, ciascuno con id, nome, tipologia, parametri completi, ingombro opzionale, fonte (riferimento alla scheda della ricerca), note e conteggi attesi (pezzi per tipo, ferramenta per codice). Il catalogo MUST includere almeno un preset per ogni tipologia registrata e i modelli commerciali elencati in `ricerca-chepergola.md` §1 con distinta dichiarata.

#### Scenario: Elenco per tipologia
- **WHEN** vengono richiesti i preset della tipologia `portale-sandwich`
- **THEN** l'elenco contiene almeno "Pergola libera 4×6", "Pergola libera 4×2", "MAXI 5×5" e "Pergola camper 3×6"

#### Scenario: Copertura di tutte le tipologie
- **WHEN** viene richiesto l'elenco completo
- **THEN** ogni slug registrato nel registro delle tipologie ha almeno un preset

### Requirement: Caricamento di un preset
Dato un preset, il sistema SHALL produrre una configurazione valida (tipologia, parametri che passano la validazione del template, ingombro che passa la validazione dell'ingombro) pronta per la generazione. Un preset che riferisce una tipologia non registrata o parametri fuori limite MUST essere rifiutato in fase di test del catalogo, non a runtime.

#### Scenario: Generazione da preset
- **WHEN** viene caricato il preset "Pergola libera 4×6"
- **THEN** la generazione produce un assieme senza errori di parametro con `larghezza` 4000, `profondita` 6000, 2 campate e costruzione `bullonata`

#### Scenario: Ingombro del preset
- **WHEN** un preset dichiara un ingombro
- **THEN** l'assieme generato non ha collisioni con l'ingombro né con i suoi ostacoli

### Requirement: Verifica dei preset contro il riferimento
Ogni preset con conteggi attesi SHALL essere verificato da test automatici: l'assieme generato MUST avere i conteggi per tipo di pezzo e per codice di ferramenta dichiarati e MUST non avere violazioni di severità `errore` con il set di regole di default.

#### Scenario: Distinta della pergola libera 4×6
- **WHEN** viene generato il preset "Pergola libera 4×6"
- **THEN** l'assieme contiene 6 pilastri, 6 tavole, 12 travetti e 12 bulloni M12×200

#### Scenario: Distinta della moderna 258×258
- **WHEN** viene generato il preset "Moderna 258×258"
- **THEN** l'assieme contiene 10 aste 90×90, 4 giunti a 3 vie angolari, 4 giunti a 3 vie lineari e 160 viti 6×40

#### Scenario: Preset con deduzione
- **WHEN** un conteggio atteso deriva da una deduzione (non dichiarato dal sito)
- **THEN** il preset lo marca come dedotto nelle note e il test lo verifica comunque
