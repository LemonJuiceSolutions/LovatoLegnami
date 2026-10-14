# Spec Delta

## ADDED Requirements

### Requirement: Coperture piane ammesse
La regola di intervallo di pendenza SHALL poter dichiarare che la copertura piana è ammessa; in tal caso una pendenza misurata pari a zero (entro 0,5°) MUST non produrre violazione, mentre pendenze tra zero e il minimo MUST continuare a violarla.

#### Scenario: Piana ammessa
- **WHEN** il set di regole ammette la piana e l'assieme ha travetti orizzontali
- **THEN** non viene prodotta alcuna violazione di pendenza

#### Scenario: Pendenza troppo bassa
- **WHEN** il set ammette la piana con minimo 5° e i travetti sono inclinati di 2°
- **THEN** viene prodotta la violazione di pendenza

### Requirement: Appoggi e misure per i nuovi tipi
La tabella degli appoggi SHALL coprire tutti i tipi di pezzo del catalogo esteso (tavola su pilastro e arco; travetto su tavola, mensola, cantonale, monaco; cantonale su trave, tavola, monaco, pilastro; trave su tavola e monaco; fascia su travetto, mensola, cantonale) e la misura dell'altezza libera MUST considerare anche tavole, cantonali, mensole, fasce e monaci.

#### Scenario: Luce della tavola sandwich
- **WHEN** una tavola da 4000 appoggia su due pilastri a 3400 mm in asse
- **THEN** la luce misurata della tavola è 3400 e il suo sbalzo 300 per lato

#### Scenario: Copertura completa
- **WHEN** viene verificata la tabella degli appoggi
- **THEN** ogni tipo del catalogo ha una voce (eventualmente vuota)

### Requirement: Tabelle per sezioni e tipi del riferimento commerciale
Il catalogo sezioni SHALL includere 45×90, 45×120, 45×145, 70×70, 90×90 e 38×300 e il set di regole di default SHALL tabellare luci per `tavola`, `cantonale`, `mensola` e `fascia` oltre ai tipi esistenti; la sezione minima dei pilastri nel set di default MUST essere di severità `avviso`, così che i preset commerciali con pilastri 90×90 generino senza errori bloccanti.

#### Scenario: Preset senza errori bloccanti
- **WHEN** viene valutato con il set di default l'assieme del preset "Pergola libera 4×6" (pilastri 90×90)
- **THEN** non ci sono violazioni di severità `errore`

#### Scenario: Mensola troppo lunga
- **WHEN** una mensola 90×140 sporge 2500 mm senza appoggi
- **THEN** la regola di luce per `mensola` produce una violazione con il limite tabellato

### Requirement: Pezzi curvi esclusi dalle luci
Le misure di luce, sbalzo e interasse SHALL ignorare i pezzi curvi, che MUST comunque valere come appoggi per gli altri pezzi.

#### Scenario: Arco come appoggio
- **WHEN** la testa di un arco sostiene una tavola
- **THEN** la tavola registra un appoggio sull'arco e l'arco non ha luce misurata
