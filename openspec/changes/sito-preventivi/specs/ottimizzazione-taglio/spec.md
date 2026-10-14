# Spec Delta

## Purpose

Assegna i pezzi di legno dell'assieme alle barre commerciali disponibili per sezione (cutting stock monodimensionale) tenendo conto di spessore lama, rifili di testa e sfrido minimo riutilizzabile, producendo un piano di taglio con barre consumate, sfrido percentuale e spezzoni riutilizzabili.

## ADDED Requirements

### Requirement: Piano di taglio per sezione e specie
Il sistema SHALL raggruppare i pezzi dritti per specie, qualità e sezione e, per ogni gruppo, assegnare le lunghezze richieste alle lunghezze commerciali disponibili per quella sezione. Ogni barra del piano MUST elencare i tagli (id dei pezzi e lunghezze) nell'ordine di taglio, lo spezzone residuo e se è riutilizzabile. I pezzi curvi MUST essere esclusi dal piano e conteggiati a parte.

#### Scenario: Raggruppamento
- **WHEN** l'assieme ha travetti 80×160 e pilastri 120×120 della stessa specie
- **THEN** il piano contiene due gruppi distinti con le proprie barre

#### Scenario: Pezzo più lungo della barra massima
- **WHEN** un pezzo misura 6200 mm e la lunghezza commerciale massima è 6000 mm
- **THEN** il piano segnala il pezzo come "non ricavabile" con id e lunghezza e il preventivo lo riporta come avviso bloccante

### Requirement: Lama, rifili e sfrido minimo
Ogni taglio tra due pezzi su una barra SHALL consumare lo spessore lama configurato; ogni barra SHALL perdere i rifili di testa configurati alle due estremità. Uno spezzone residuo MUST essere marcato riutilizzabile solo se non inferiore allo sfrido minimo riutilizzabile configurato per la sezione.

#### Scenario: Conteggio esatto
- **WHEN** su una barra da 4000 con rifili 10+10 e lama 4 vengono tagliati due pezzi da 1980
- **THEN** il residuo è 4000 − 20 − 2·1980 − 4 = 16 mm e non è riutilizzabile

#### Scenario: Spezzone riutilizzabile
- **WHEN** da una barra da 5000 si ricava un pezzo da 3200 con sfrido minimo riutilizzabile 1000
- **THEN** lo spezzone residuo (al netto di rifili e lama) è marcato riutilizzabile

### Requirement: Qualità della soluzione
Il numero di barre e il costo delle barre consumate prodotti dall'algoritmo MUST NOT superare quelli della strategia "primo posto decrescente" sullo stesso input; su istanze piccole (fino a 12 pezzi per gruppo) con ottimo noto l'algoritmo MUST trovare l'ottimo. L'algoritmo MUST essere deterministico e MUST completare un assieme di 200 pezzi in meno di 200 ms.

#### Scenario: Istanza con ottimo noto
- **WHEN** vengono richiesti 4 pezzi da 2000, 2 da 3000 e 2 da 1000 con barre da 4000 e 6000, lama e rifili nulli
- **THEN** il piano usa al massimo le barre dell'ottimo (es. 2 barre da 6000 e 1 da 4000) e lo sfrido è 0

#### Scenario: Confronto con primo posto decrescente
- **WHEN** viene eseguito su 100 istanze casuali riproducibili
- **THEN** in nessuna istanza il costo delle barre supera quello del primo posto decrescente

### Requirement: Scelta tra lunghezze con prezzi diversi
Quando una sezione ha più lunghezze commerciali con prezzi diversi, il sistema SHALL minimizzare il costo totale delle barre e non solo il loro numero, e SHALL riportare per il gruppo il costo delle barre, il volume netto dei pezzi e la percentuale di sfrido = (volume barre − volume pezzi) / volume barre.

#### Scenario: Barra lunga più cara al metro
- **WHEN** la barra da 6000 costa al metro il 20% in più della barra da 4000 e servono 3 pezzi da 1900
- **THEN** il piano preferisce due barre da 4000 se il costo risultante è inferiore a una barra da 6000

#### Scenario: Percentuale di sfrido
- **WHEN** le barre consumate misurano 12 000 mm e i pezzi 10 800 mm nella stessa sezione
- **THEN** la percentuale di sfrido riportata è 10%
