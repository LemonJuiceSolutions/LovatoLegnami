# Spec Delta

## Purpose

Estende le tipologie addossate affinché seguano il piano reale del muro quando l'ingombro è fuori squadra: banchina lungo il muro, teste dei travetti e delle travi tagliate sul piano del muro, lunghezze individuali.

## ADDED Requirements

### Requirement: Piano del muro come condizione di cantiere
La generazione dell'assieme SHALL accettare, come opzione di generazione (non come parametro di tipologia), il piano del muro ricavato dall'ingombro. Senza opzione il piano MUST essere quello implicito della tipologia (ortogonale al fronte), così le fixture esistenti non cambiano.

#### Scenario: Senza piano del muro
- **WHEN** una tipologia addossata è generata senza opzione
- **THEN** l'assieme coincide con la fixture golden esistente

#### Scenario: Con piano del muro
- **WHEN** la stessa tipologia è generata con un piano del muro inclinato di 5°
- **THEN** l'assieme differisce solo nei pezzi che toccano il muro e nelle loro lavorazioni

### Requirement: Banchina e attacchi lungo il muro reale
Nelle tipologie addossate la banchina (o la fila di staffe a muro) SHALL essere posizionata parallela al lato muro reale e aderente al suo piano; con muro inclinato i travetti MUST avere lunghezze individuali e le teste lato muro tagliate con il piano del muro (taglio composto), senza che alcun vertice del box lavorato superi il piano del muro.

#### Scenario: Banchina inclinata
- **WHEN** il muro è fuori squadra di 5° su larghezza 5000
- **THEN** la banchina è ruotata di 5° in pianta e le sue teste restano entro la pianta

#### Scenario: Travetti con lunghezze diverse
- **WHEN** il muro è fuori squadra di 5°
- **THEN** le lunghezze dei travetti variano linearmente da sinistra a destra e ogni travetto ha un taglio di testa con angolo in pianta 5°

#### Scenario: Pergola a L su due muri non ortogonali
- **WHEN** la tipologia a L è generata con due piani di muro che formano 88°
- **THEN** il cantonale di compluvio segue la bisettrice reale e i travetti terminano sul suo piano

### Requirement: Pergole libere con pianta fuori squadra
Per le tipologie autoportanti il piano del muro MUST essere ignorato; l'adattamento all'ingombro SHALL ridurre le dimensioni finché la pergola rettangolare sta nel prisma della pianta.

#### Scenario: Pergola libera in pianta trapezia
- **WHEN** una pergola libera è adattata a una pianta con il lato posteriore inclinato
- **THEN** la pergola resta rettangolare e non ha collisioni con l'ingombro
