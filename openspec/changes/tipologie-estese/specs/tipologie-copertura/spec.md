# Spec Delta

## ADDED Requirements

### Requirement: Parametri a scelta
I template SHALL poter dichiarare parametri a scelta tra opzioni nominate (valore, etichetta, descrizione), con un default tra le opzioni; un valore fuori dalle opzioni MUST essere rifiutato con un errore che elenca le opzioni ammesse.

#### Scenario: Valore non ammesso
- **WHEN** il parametro `costruzione` riceve il valore `saldata`
- **THEN** la generazione è rifiutata con un errore che cita `bullonata` e `carpenteria`

#### Scenario: Default della scelta
- **WHEN** il parametro a scelta non è fornito
- **THEN** viene usato il default dichiarato

### Requirement: Visibilità condizionata dei parametri
Un parametro SHALL poter dichiarare una condizione di visibilità in funzione degli altri parametri; quando la condizione è falsa il parametro MUST comunque essere risolto al proprio valore o default e l'interfaccia MUST poterlo nascondere.

#### Scenario: Testa del pilastro solo in monofalda
- **WHEN** `forma` vale `piana`
- **THEN** il parametro `testaPilastro` è dichiarato non visibile ma la generazione usa il suo default senza errori

### Requirement: Opzione costruttiva bullonata o carpenteria
Le tipologie che lo dichiarano SHALL offrire il parametro `costruzione` con opzioni `bullonata` (trave doppia a sandwich, bulloni passanti, saette tra le tavole, appoggi con viti) e `carpenteria` (trave singola, tenone-mortasa pilastro–trave, tacche a mezzo legno o becco d'uccello per i travetti, saette a 45°). Lo stesso set di parametri geometrici MUST produrre in entrambi i casi la stessa pianta e le stesse quote di intradosso.

#### Scenario: Stessa pianta
- **WHEN** un portale 4000×6000 è generato in `bullonata` e in `carpenteria`
- **THEN** le posizioni in pianta dei pilastri e la quota d'intradosso coincidono

#### Scenario: Bullonata
- **WHEN** un portale è generato in `bullonata`
- **THEN** ogni fila di pilastri porta due `tavola`, ogni pilastro ha due bulloni passanti e nessun pezzo ha tenoni o mortase

#### Scenario: Carpenteria
- **WHEN** un portale è generato in `carpenteria`
- **THEN** ogni fila porta una `trave`, i pilastri hanno tenone nella trave e l'elenco ferramenta non contiene bulloni

### Requirement: Metadati di catalogo delle tipologie
Ogni tipologia SHALL dichiarare una categoria (`addossata`, `autoportante`, `carport`, `gazebo`, `pensilina`), tag di ricerca e il riferimento alla scheda della ricerca commerciale; l'elenco del registro MUST esporli.

#### Scenario: Elenco con categorie
- **WHEN** viene richiesto l'elenco delle tipologie
- **THEN** ogni voce ha categoria e tag e `carport-arco` ha categoria `carport`

### Requirement: Pendenza imposta dalla ferramenta
Quando un parametro a scelta seleziona una ferramenta con angolo imposto (staffe inclinate, supporto a scomparsa, cuspidi), il template SHALL usare quell'angolo come pendenza, nascondere il parametro `pendenza` e registrare nei metadati dell'assieme la pendenza effettiva e la sua origine.

#### Scenario: Staffa inclinata 25°
- **WHEN** una pensilina usa `attacco` = `staffa-inclinata-25`
- **THEN** i travetti hanno pendenza 25° e i metadati riportano `pendenza: 25` con origine `ferramenta`

### Requirement: Tipologia portale sandwich
La tipologia `portale-sandwich` SHALL generare portali paralleli al fronte (travi di lunghezza `larghezza` su `pilastriPerPortale` pilastri), `campate` campate in profondità, travetti ortogonali distribuiti con `interasse`, forma `piana` o `monofalda` con direzione di pendenza in profondità (portali a quote decrescenti) o lungo il fronte (travi inclinate con testa del pilastro a squadra o inclinata), saette opzionali e ancoraggi a terra a scelta.

#### Scenario: Pergola libera 4×6
- **WHEN** viene generata con larghezza 4000, profondità 6000, 2 campate, 2 pilastri per portale, interasse 700, costruzione bullonata
- **THEN** l'assieme contiene 6 pilastri, 6 tavole da 4000, 12 travetti da 3000 e 12 bulloni

#### Scenario: Monofalda con travi inclinate e testa inclinata
- **WHEN** `forma` = `monofalda`, `direzionePendenza` = `larghezza`, `testaPilastro` = `inclinata`, pendenza 8°
- **THEN** i pilastri di un portale hanno lunghezze diverse coerenti con `larghezza·tan 8°` e ogni pilastro ha un taglio di testa di 8°

#### Scenario: Monofalda in profondità
- **WHEN** `forma` = `monofalda`, `direzionePendenza` = `profondita`, pendenza 5°, 2 campate
- **THEN** i tre portali hanno quote d'intradosso decrescenti con passo `campata·tan 5°` e i travetti sono inclinati di 5°

### Requirement: Tipologia addossata sandwich
La tipologia `addossata-sandwich` SHALL generare telai ortogonali al muro (trave dal muro al pilastro con sbalzo), travetti paralleli al muro, attacco a muro a scelta tra staffa a listoni paralleli, staffe inclinate 15°/25°, supporto a scomparsa 17° e banchina, con la testa della trave a filo muro tagliata sul piano del muro.

#### Scenario: Addossata 2×3 con listoni paralleli
- **WHEN** viene generata con larghezza 3000, profondità 2000, 1 campata, `attaccoMuro` = `listoni-paralleli`, costruzione bullonata
- **THEN** l'assieme contiene 2 pilastri, 4 tavole da 2000, 4 travetti da 3000, 2 staffe a muro e 6 bulloni

#### Scenario: Testa a filo muro
- **WHEN** la pendenza è 10°
- **THEN** ogni trave ha un taglio di testa di 10° sul lato muro e nessun vertice del suo box lavorato oltrepassa il piano del muro

### Requirement: Tipologia telaio a giunti metallici
La tipologia `telaio-giunti` SHALL generare una griglia di pilastri a sezione unica (70×70 o 90×90) con travi perimetrali e traversi sullo stesso piano, tutte le aste tagliate a squadra alla lunghezza netta derivata dagli ingombri dei giunti, nodi come giunti metallici con numero di vie derivato, forma `piana` o `monofalda-15` (giunti a 75°/105°) e fissaggio `libera` o `addossata`.

#### Scenario: Moderna 258×258
- **WHEN** viene generata con larghezza 2580, profondità 2580, 1 campata per lato, sezione 90×90, piana, libera
- **THEN** l'assieme contiene 10 aste 90×90, 4 giunti a 3 vie angolari, 4 giunti a 3 vie lineari, 4 staffe a terra e 160 viti

#### Scenario: Monofalda a 15°
- **WHEN** `forma` = `monofalda-15`
- **THEN** la fila alta di pilastri è più alta di `profondita·tan 15°` e i nodi usano giunti a 75° e 105°

### Requirement: Tipologia carport ad arco
La tipologia `carport-arco` SHALL generare un portale sandwich con pilastri arretrati di `sbalzoFrontale` e, per ogni portale, un `arco` di raggio e sezione parametrici con piede verticale a terra su staffa a P greco e testa infilata tra le tavole con bulloni passanti, più controventi nelle campate.

#### Scenario: Carport 5×3
- **WHEN** viene generato con larghezza 5000, profondità 3000, 1 campata, raggio 2400, sbalzo frontale 2500
- **THEN** l'assieme contiene 4 pilastri, 2 archi di sviluppo 3900 ± 50, 4 tavole da 5000, 8 travetti, 6 staffe a P greco e la testa di ogni arco sta tra le due tavole del proprio portale

#### Scenario: Arco troppo corto
- **WHEN** il raggio richiesto non permette all'arco di raggiungere l'intradosso della trave
- **THEN** la generazione è rifiutata con un errore che indica il raggio minimo

### Requirement: Tipologia gazebo a padiglione
La tipologia `gazebo-padiglione` SHALL generare, per 4, 6 o 8 lati, pilastri agli angoli (più montanti intermedi opzionali), travi perimetrali, cantonali dagli angoli alla punta, puntoni intermedi opzionali (8 falde su base quadrata), punta come cuspide metallica o monaco in legno con teste dei cantonali a taglio composto, arcarecci e grigliati opzionali; per 4 lati la base può essere rettangolare (colmo tra due punte) solo in carpenteria.

#### Scenario: Gazebo 3,1×3,1 a 4 falde
- **WHEN** viene generato con 4 lati, larghezza 3100, 4 falde, cuspide 25°, costruzione bullonata
- **THEN** l'assieme contiene 4 pilastri, 4 travi perimetrali, 4 cantonali, 1 cuspide, 4 giunti angolari e 8 piastre; la pendenza dei cantonali è `atan(tan 25° · cos 45°)`

#### Scenario: Ottagonale in carpenteria
- **WHEN** viene generato con 8 lati, diametro 4000, costruzione carpenteria
- **THEN** l'assieme contiene 8 pilastri, 8 travi, 8 cantonali con taglio composto in testa e 1 monaco, e la pianta è un ottagono regolare

#### Scenario: Base rettangolare
- **WHEN** viene generato con 4 lati, larghezza 4000, profondità 3000, carpenteria
- **THEN** l'assieme contiene 2 monaci e un colmo di lunghezza 1000

### Requirement: Tipologia pensilina a sbalzo
La tipologia `pensilina-sbalzo` SHALL generare, senza pilastri, mensole incastrate a muro con attacco a scelta (supporto a scomparsa, staffe inclinate, scarpa), travetti paralleli al muro, fascia di gronda e saette opzionali sotto le mensole.

#### Scenario: Pensilina a scomparsa
- **WHEN** viene generata con larghezza 4000, sbalzo 1200, 3 mensole, `attacco` = `scomparsa-17`
- **THEN** l'assieme contiene 3 mensole con asola e 2 fori ciascuna, travetti inclinati di 17°, 1 fascia e nessun pilastro

### Requirement: Tipologia monofalda scalare
La tipologia `monofalda-scalare` SHALL generare almeno tre file di pilastri a quote linearmente decrescenti, un traverso sandwich per fila, correnti longitudinali spezzati sopra gli appoggi con giunzione a scelta (dritta, mezzo legno, dardo di Giove), fascia frontale e saette.

#### Scenario: Copertura camper
- **WHEN** viene generata con larghezza 4040, profondità 7990, 4 file, pendenza tale che il salto tra file sia 115 mm
- **THEN** l'assieme contiene 8 pilastri con 4 lunghezze distinte a passo 115, 8 tavole e correnti giuntati sopra le tre file intermedie

#### Scenario: Giunzione a dardo di Giove
- **WHEN** `giunzione` = `dardo-di-giove`
- **THEN** ogni giunzione tra correnti produce due lavorazioni `dardo-di-giove` complementari

### Requirement: Tipologia a L
La tipologia `a-elle` SHALL generare due ali addossate lungo due muri ad angolo interno con pilastro d'angolo condiviso, falde verso l'esterno di ciascun muro, cantonale di compluvio sulla diagonale interna e travetti di ciascuna ala terminati con taglio composto sul piano verticale della diagonale.

#### Scenario: L simmetrica
- **WHEN** viene generata con ali 4000 e 4000, profondità 3000
- **THEN** l'assieme contiene un solo pilastro nell'angolo esterno, un cantonale lungo la diagonale a 45° e nessun travetto che oltrepassa il piano della diagonale
