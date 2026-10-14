# Spec Delta

## ADDED Requirements

### Requirement: Selettore di tipologia con miniature
Il pannello parametri SHALL offrire la scelta della tipologia come griglia di schede con miniatura, nome, categoria e descrizione, filtrabile per categoria e per testo; la selezione MUST mantenere i parametri comuni compatibili come il cambio tipologia esistente.

#### Scenario: Filtro per categoria
- **WHEN** l'utente filtra per `gazebo`
- **THEN** la griglia mostra solo `gazebo-padiglione`

#### Scenario: Selezione
- **WHEN** l'utente clicca la scheda `carport-arco`
- **THEN** il form mostra i parametri di `carport-arco` e il viewer l'assieme di default

### Requirement: Miniature generate dal modello
Le miniature SHALL essere immagini vettoriali generate dalla proiezione assonometrica dell'assieme di default di ogni tipologia, con colori per famiglia coerenti con il viewer, calcolate una volta per tipologia.

#### Scenario: Coerenza con il template
- **WHEN** l'assieme di default di una tipologia cambia numero di pezzi
- **THEN** la miniatura rigenerata riflette il nuovo assieme senza modifiche a file grafici

#### Scenario: Rendering deterministico
- **WHEN** la miniatura della stessa tipologia è generata due volte
- **THEN** le due stringhe SVG sono identiche

### Requirement: Campi a scelta e campi condizionati
Il form SHALL rendere i parametri a scelta come selezione tra le opzioni etichettate e MUST nascondere i parametri la cui condizione di visibilità è falsa, senza perderne il valore.

#### Scenario: Opzione costruttiva
- **WHEN** l'utente cambia `costruzione` da `bullonata` a `carpenteria`
- **THEN** l'assieme è rigenerato e la sezione ferramenta degli esiti si svuota dei bulloni

#### Scenario: Campo nascosto
- **WHEN** `forma` passa a `piana`
- **THEN** il campo `testaPilastro` scompare dal form e il suo valore resta nella configurazione

### Requirement: Selettore dei preset commerciali
La barra della configurazione SHALL offrire "Esempi dal catalogo": un elenco di preset raggruppato per tipologia con nome, fonte e note, il cui caricamento MUST impostare tipologia, parametri e ingombro nello store come un esempio precaricato.

#### Scenario: Caricamento preset
- **WHEN** l'utente sceglie "MAXI 5×5"
- **THEN** la tipologia diventa `portale-sandwich`, i parametri del preset sono nel form e l'assieme è rigenerato

### Requirement: Elenco ferramenta negli esiti
Il pannello esiti SHALL mostrare la tabella della ferramenta (codice, descrizione, quantità) e il clic su una riga MUST selezionare nel viewer i pezzi collegati.

#### Scenario: Selezione dai bulloni
- **WHEN** l'utente clicca la riga dei bulloni M12×200
- **THEN** i pezzi forati da quei bulloni risultano selezionati nel viewer
