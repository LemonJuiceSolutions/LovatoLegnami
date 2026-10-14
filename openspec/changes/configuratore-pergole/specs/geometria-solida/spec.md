# Spec Delta

## Purpose

Costruisce i solidi B-rep reali di ogni pezzo dell'assieme (parallelepipedo di base meno le lavorazioni, via operazioni booleane) in un contesto isolato dal thread UI, e li rende disponibili sia come mesh per il viewer sia come dati B-rep per gli export CAD.

## ADDED Requirements

### Requirement: Solido per ogni pezzo
Il sistema SHALL costruire, per ogni pezzo dell'assieme, un solido chiuso e valido ottenuto dal parallelepipedo sezione × lunghezza nel sistema locale del pezzo, a cui sono sottratte le lavorazioni (mezzo legno, tenone/mortasa, becco d'uccello, fori, tagli di testa). Il solido MUST essere restituito nel sistema di riferimento locale del pezzo insieme alla trasformazione verso l'assieme.

#### Scenario: Pezzo senza lavorazioni
- **WHEN** viene costruito un pilastro 120×120×2400 senza lavorazioni
- **THEN** il solido ha 6 facce piane, volume 120·120·2400 mm³ e bounding box coerente

#### Scenario: Pezzo con foro
- **WHEN** viene costruito un pezzo con un foro passante Ø12
- **THEN** il solido ha 6 facce piane più 1 faccia cilindrica e volume ridotto di π·6²·spessore

#### Scenario: Pezzo con taglio di testa inclinato
- **WHEN** viene costruito un travetto con taglio di testa a 15°
- **THEN** la faccia di testa è piana e inclinata di 15° rispetto alla sezione e il solido è valido

#### Scenario: Lavorazione non supportata dal kernel
- **WHEN** una lavorazione non ha una procedura di costruzione geometrica
- **THEN** il sistema restituisce un errore per quel pezzo senza bloccare la costruzione degli altri

### Requirement: Costruzione fuori dal thread UI
La costruzione dei solidi SHALL avvenire in un contesto di esecuzione separato dal thread principale dell'interfaccia; l'interfaccia MUST restare reattiva durante la costruzione e MUST ricevere avanzamento (pezzi completati / totali) e il risultato pezzo per pezzo.

#### Scenario: Avanzamento
- **WHEN** viene richiesta la costruzione di un assieme con 20 pezzi
- **THEN** il chiamante riceve almeno un evento di avanzamento prima del completamento e un evento finale con 20 risultati

#### Scenario: Annullamento
- **WHEN** viene richiesta una nuova costruzione mentre una è in corso
- **THEN** la costruzione precedente è annullata e solo il risultato della nuova viene consegnato

#### Scenario: Errore del kernel
- **WHEN** il kernel non riesce a inizializzarsi (es. asset WASM non caricato)
- **THEN** il chiamante riceve un errore esplicito e l'interfaccia può mostrare l'assieme in modalità semplificata (soli box)

### Requirement: Mesh per la visualizzazione
Per ogni solido costruito il sistema SHALL produrre una mesh triangolata (posizioni, normali, indici) con tolleranza di tessellazione configurabile (default 0,5 mm) adatta al viewer, mantenendo l'associazione con l'id del pezzo.

#### Scenario: Mesh valida
- **WHEN** un solido viene tessellato
- **THEN** la mesh ha indici che riferiscono solo vertici esistenti e nessun triangolo degenere

### Requirement: Dati B-rep per gli export
Il sistema SHALL esporre, per ogni solido, una rappresentazione B-rep neutra (facce con tipo superficie `piana`/`cilindrica`, loop di spigoli, vertici con coordinate in mm, orientamenti) consumabile dal writer SAT, e SHALL permettere l'export STEP del solido tramite il kernel.

#### Scenario: Estrazione facce piane
- **WHEN** viene richiesta la B-rep di un parallelepipedo
- **THEN** sono restituite 6 facce di tipo `piana`, 12 spigoli e 8 vertici con le normali rivolte verso l'esterno

#### Scenario: Estrazione faccia cilindrica
- **WHEN** viene richiesta la B-rep di un pezzo con foro Ø12
- **THEN** è presente una faccia di tipo `cilindrica` con asse, raggio 6 mm e orientamento verso l'interno del foro

#### Scenario: Superficie non classificabile
- **WHEN** una faccia non è né piana né cilindrica
- **THEN** la B-rep la marca come `altro` e l'export che non la supporta la segnala

### Requirement: Cache per pezzo
Il sistema SHALL evitare di ricostruire solidi di pezzi non cambiati tra una generazione e la successiva, usando una chiave derivata da tipo, sezione, lunghezza e lavorazioni (non dalla posa).

#### Scenario: Pezzi identici condividono il solido
- **WHEN** 10 travetti hanno stessa sezione, lunghezza e lavorazioni
- **THEN** il solido viene costruito una sola volta e riusato con 10 trasformazioni diverse
