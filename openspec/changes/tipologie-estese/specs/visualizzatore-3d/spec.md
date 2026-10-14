# Spec Delta

## ADDED Requirements

### Requirement: Pezzi curvi nel viewer
Il viewer SHALL rendere i pezzi curvi con la mesh del kernel quando disponibile e, in modalità semplificata, come sequenza di box di segmento che segue l'arco.

#### Scenario: Modalità semplificata
- **WHEN** il kernel non è disponibile e l'assieme contiene un arco
- **THEN** l'arco è disegnato come catena di box che copre l'intero sviluppo, colorato con il colore della famiglia `ARC`

### Requirement: Livello ferramenta
Il viewer SHALL offrire un livello attivabile che mostra la ferramenta con simboli semplici (cilindri per i bulloni lungo il loro asse, box per staffe, giunti e cuspidi dalle pose e dagli ingombri dichiarati) e l'etichetta al passaggio del mouse MUST riportare codice e pezzi collegati.

#### Scenario: Bulloni visibili
- **WHEN** il livello ferramenta è attivo su una pergola sandwich
- **THEN** ogni bullone è visibile come cilindro che attraversa tavola, pilastro e tavola

#### Scenario: Livello disattivato
- **WHEN** il livello ferramenta è disattivato
- **THEN** nessun simbolo di ferramenta è renderizzato e i pezzi restano inalterati
