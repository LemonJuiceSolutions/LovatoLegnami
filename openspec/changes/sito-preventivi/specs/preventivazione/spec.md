# Spec Delta

## Purpose

Calcola il prezzo di una pergola a partire dall'assieme generato, dall'ingombro del cliente e dalle opzioni commerciali, in modo deterministico e spiegabile riga per riga, con tutti i valori provenienti da un listino versionato e con una vista dettagliata per l'ufficio e una semplificata per il cliente.

## ADDED Requirements

### Requirement: Preventivo deterministico a righe spiegabili
Il sistema SHALL produrre, da assieme, ingombro, opzioni commerciali e listino, un preventivo composto da righe con codice, categoria, descrizione, quantità, unità di misura, prezzo unitario, importo e una spiegazione testuale della regola applicata. Lo stesso input con lo stesso listino MUST produrre lo stesso preventivo, byte per byte nella serializzazione. Gli importi MUST essere calcolati in centesimi interi; nessun valore di prezzo o coefficiente MUST essere cablato nel codice.

#### Scenario: Determinismo
- **WHEN** lo stesso assieme, ingombro e opzioni vengono preventivati due volte con la stessa versione di listino
- **THEN** le due serializzazioni del preventivo sono identiche

#### Scenario: Spiegazione di una riga
- **WHEN** viene letta la riga "Legno – travetti 80×160"
- **THEN** la spiegazione indica specie, qualità, volume o metri lineari, prezzo unitario e la versione del listino usata

#### Scenario: Listino incompleto
- **WHEN** l'assieme contiene una sezione o un codice di ferramenta privo di prezzo nel listino
- **THEN** il preventivo riporta la riga con importo nullo e un avviso "prezzo mancante" che cita sezione o codice, e lo stato del preventivo è `incompleto`

### Requirement: Costo del legno dalle barre consumate
Il costo del legno SHALL essere calcolato per specie e qualità scelte, a partire dalle barre commerciali consumate dal piano di taglio (capability `ottimizzazione-taglio`) e non dalla sola lunghezza netta dei pezzi. Il listino MUST ammettere prezzo al metro cubo per specie/qualità e, in alternativa per sezione, prezzo al metro lineare; i pezzi curvi MUST avere un prezzo al metro lineare per sezione più un fisso di curvatura; i pannelli MUST essere prezzati al metro quadro.

#### Scenario: Legno netto e sfrido in righe distinte
- **WHEN** 11 travetti 80×160 da 3200 mm vengono preventivati con barre da 4000 e 5000
- **THEN** il preventivo contiene una riga "legno netto" con il volume dei pezzi e una riga "sfrido" con il volume della differenza tra barre consumate e pezzi, con la percentuale di sfrido nella spiegazione

#### Scenario: Prezzo al metro lineare prioritario
- **WHEN** il listino indica per la sezione 120×240 un prezzo al metro lineare
- **THEN** le barre di quella sezione sono prezzate al metro lineare e la spiegazione lo dichiara

#### Scenario: Spezzoni riutilizzabili
- **WHEN** il piano di taglio produce spezzoni riutilizzabili e il listino prevede un recupero percentuale
- **THEN** il preventivo contiene una riga negativa "recupero spezzoni" pari al valore degli spezzoni per la percentuale di recupero

### Requirement: Costo delle lavorazioni CNC
Il sistema SHALL stimare il tempo macchina come somma, per ogni lavorazione dell'assieme, di un tempo base per tipo più un tempo proporzionale alla grandezza della lavorazione definita dal listino, più un tempo di movimentazione per pezzo, e SHALL convertirlo in costo con la tariffa oraria del centro di lavoro. I pezzi identici MUST essere conteggiati tante volte quante le loro occorrenze.

#### Scenario: Tempo per tipo di lavorazione
- **WHEN** un pezzo ha 2 becchi d'uccello e 2 tagli di testa e il listino assegna 3 min e 1,5 min base
- **THEN** la riga lavorazioni del pezzo riporta 9 minuti più il tempo proporzionale e il tempo di movimentazione

#### Scenario: Lavorazione senza tariffa
- **WHEN** l'assieme contiene un tipo di lavorazione non presente nel listino
- **THEN** il preventivo emette l'avviso "tariffa mancante" con il tipo e lo stato `incompleto`

### Requirement: Ferramenta, trattamenti e copertura
Il sistema SHALL prezzare la ferramenta dell'assieme per codice e quantità dal listino, i trattamenti (impregnazione, verniciatura per tinta) al metro quadro di superficie sviluppata del legno, e la copertura scelta al metro quadro di falda in proiezione reale. La superficie del legno MUST essere calcolata dal perimetro della sezione per la lunghezza di ogni pezzo.

#### Scenario: Ferramenta dal catalogo
- **WHEN** l'assieme contiene 12 `bullone-m12x200` e 36 `vite-6x160`
- **THEN** il preventivo contiene due righe ferramenta con quantità 12 e 36 e i prezzi unitari del listino

#### Scenario: Superficie da trattare
- **WHEN** un pilastro 120×120 lungo 2400 mm viene impregnato
- **THEN** la superficie conteggiata è 4·0,12·2,4 = 1,152 m²

#### Scenario: Copertura inclinata
- **WHEN** una falda ha 20 m² in pianta e pendenza 15°
- **THEN** la copertura è conteggiata per 20/cos(15°) m²

### Requirement: Montaggio e complicazioni
Il sistema SHALL stimare le ore di montaggio sommando tempi unitari per pezzo (per famiglia), per giunto (per tipo) e per ferramenta (per tipo) più un tempo fisso di cantiere, e SHALL applicare in ordine le regole di complicazione del listino, ognuna con condizione sui fattori di cantiere ed effetto (ore aggiuntive, percentuale sulle ore, importo fisso). Ogni regola scattata MUST comparire come riga distinta con la condizione soddisfatta nella spiegazione.

#### Scenario: Fuorisquadra
- **WHEN** i fattori di cantiere indicano una deviazione dallo squadro di 6° e il listino prevede "+15% ore oltre 3°"
- **THEN** il preventivo contiene la riga "complicazione: fuorisquadra 6°" con il 15% delle ore base

#### Scenario: Pavimento in pendenza e ostacoli
- **WHEN** il dislivello del pavimento è 180 mm e ci sono 2 ostacoli che interessano la pergola
- **THEN** scattano le regole "pavimento non in piano" e "ostacoli in cantiere" con le ore aggiuntive del listino, una riga ciascuna

#### Scenario: Soglia di altezza
- **WHEN** l'altezza massima dell'assieme supera la soglia di ponteggio del listino
- **THEN** compare la riga "trabattello/ponteggio" con l'importo fisso del listino

#### Scenario: Nessuna complicazione
- **WHEN** il cantiere è in squadra, piano, senza ostacoli, basso e con accesso facile
- **THEN** il preventivo non contiene righe di complicazione

### Requirement: Trasporto per zona
Il sistema SHALL calcolare il trasporto dalla zona di consegna, determinata dal CAP del cliente tramite la tabella zone del listino (prefissi CAP → distanza e prezzo), oppure da una distanza in km inserita dall'ufficio. Il numero di viaggi MUST derivare dalle ore di montaggio e dalla squadra (ore per giornata) e il trasporto MUST essere moltiplicato per i viaggi.

#### Scenario: CAP in zona
- **WHEN** il CAP inizia con un prefisso della zona "Provincia" a 40 km
- **THEN** la riga trasporto usa il prezzo della zona per ogni viaggio

#### Scenario: CAP sconosciuto
- **WHEN** il CAP non corrisponde a nessuna zona
- **THEN** il preventivo usa la zona di ripiego del listino e aggiunge l'avviso "zona da verificare"

### Requirement: Margini, sconti, IVA, arrotondamenti e minimo d'ordine
Il sistema SHALL applicare margini percentuali distinti per materiali e manodopera (visibili solo nella vista ufficio), sconti percentuali o fissi, l'aliquota IVA scelta tra quelle del listino, l'arrotondamento del totale cliente al passo configurato e il minimo d'ordine. L'ordine di applicazione MUST essere: costi → margini → sconti → minimo d'ordine → imponibile → IVA → arrotondamento.

#### Scenario: Sotto il minimo d'ordine
- **WHEN** l'imponibile dopo gli sconti è inferiore al minimo d'ordine del listino
- **THEN** l'imponibile è portato al minimo con una riga "adeguamento al minimo d'ordine"

#### Scenario: Arrotondamento al passo
- **WHEN** il totale IVA inclusa è 4 731,80 € e il passo è 10 €
- **THEN** il totale cliente mostrato è 4 730 € e la differenza è registrata in una riga "arrotondamento"

### Requirement: Viste cliente e ufficio
Il sistema SHALL esporre dallo stesso preventivo una vista ufficio (tutte le righe, piano di taglio, fattori di cantiere, regole scattate, margini) e una vista cliente che raggruppa le righe in poche voci (struttura in legno, ferramenta e finiture, copertura, montaggio e trasporto, totale IVA inclusa) con una fascia di indicatività percentuale del listino. La vista cliente MUST NOT contenere margini, costi orari, prezzi unitari interni né piano di taglio.

#### Scenario: Vista cliente senza dati interni
- **WHEN** viene serializzata la vista cliente
- **THEN** non contiene campi relativi a margini, tariffe orarie, barre o percentuali di sfrido, e il totale coincide con quello della vista ufficio

#### Scenario: Fascia indicativa
- **WHEN** il listino dichiara una indicatività del ±10%
- **THEN** la vista cliente riporta minimo e massimo pari al totale ∓/± 10% arrotondati al passo

### Requirement: Listino versionato con validità
Il listino SHALL essere un documento validato (schema) con numero di versione, data di inizio validità e stato; il preventivo MUST registrare l'identificativo della versione usata. Dato un elenco di versioni e una data, il sistema SHALL scegliere l'ultima versione attiva con validità non successiva alla data.

#### Scenario: Scelta della versione per data
- **WHEN** esistono versioni attive valide dal 1° marzo e dal 1° giugno e si preventiva al 15 maggio
- **THEN** viene usata la versione del 1° marzo

#### Scenario: Listino non valido
- **WHEN** un listino ha una percentuale negativa o una zona senza prezzo
- **THEN** la validazione fallisce citando il percorso del campo
