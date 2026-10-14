# Spec Delta

## ADDED Requirements

### Requirement: SAT dei pezzi curvi
L'export SAT SHALL scrivere i pezzi curvi con le facce cilindriche come superfici coniche a semiangolo zero e gli spigoli circolari parziali con i propri parametri; il file prodotto MUST passare il validatore interno.

#### Scenario: Carport con archi
- **WHEN** viene esportato in SAT l'assieme del preset "Carport arco 5×3"
- **THEN** il file contiene un body per ogni pezzo, i body degli archi hanno 2 `cone-surface` e 4 `ellipse-curve` ciascuno e il validatore non segnala errori

### Requirement: Tabella ferramenta nella distinta
La distinta CSV SHALL contenere, dopo la tabella dei pezzi e una riga vuota, una tabella della ferramenta con colonne `Codice;Descrizione;Quantità;Pezzi` (una riga per codice, quantità sommate, id dei pezzi collegati separati da virgola), con le stesse convenzioni di separatore, BOM e decimali.

#### Scenario: Distinta della pergola libera 4×6
- **WHEN** viene prodotta la distinta del preset "Pergola libera 4×6"
- **THEN** la tabella ferramenta contiene `bullone-m12x200` con quantità 12 e `vite-6x160` con quantità 36

#### Scenario: Assieme senza ferramenta
- **WHEN** viene prodotta la distinta di una tipologia in carpenteria senza ferramenta
- **THEN** la tabella ferramenta ha solo la riga di intestazione

### Requirement: Ferramenta esclusa dal CAD
Gli export SAT e STEP SHALL contenere solo i pezzi di legno; la ferramenta MUST non produrre body né errori.

#### Scenario: Conteggio body
- **WHEN** un assieme con 20 pezzi e 15 voci di ferramenta è esportato in SAT
- **THEN** il file contiene esattamente 20 body
