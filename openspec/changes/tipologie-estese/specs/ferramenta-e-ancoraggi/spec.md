# Spec Delta

## Purpose

Libreria dati della ferramenta strutturale (bulloni, viti, tasselli, staffe a muro e a terra, giunti metallici, cuspidi, piastre) con ingombri e regole di foratura, e meccanismo con cui un template la applica ai pezzi di legno producendo le lavorazioni indotte e un elenco ferramenta tracciato nell'assieme.

## ADDED Requirements

### Requirement: Libreria ferramenta come dati
Il sistema SHALL fornire un catalogo dati di ferramenta identificata da codice, con tipo (`bullone`, `vite`, `tassello`, `staffa-muro`, `staffa-terra`, `giunto-vie`, `cuspide`, `piastra`), nome leggibile, sezioni di legno compatibili, ingombri e, se applicabile, lo schema di fori/asole da praticare nel legno, l'angolo imposto e le viti associate. Il catalogo MUST essere modificabile come dati e ogni voce MUST indicare la fonte commerciale e la marcatura "da validare".

#### Scenario: Ricerca per codice
- **WHEN** viene richiesta la voce `staffa-terra-lama-interna-90`
- **THEN** il catalogo restituisce la voce con tipo `staffa-terra`, sezione compatibile 90×90, asola 8×68×180 e 2 fori Ø13

#### Scenario: Codice sconosciuto
- **WHEN** viene richiesto un codice non presente
- **THEN** il sistema restituisce un errore che cita il codice sconosciuto

#### Scenario: Filtro per sezione del pilastro
- **WHEN** vengono richieste le staffe a terra compatibili con un pilastro 120×120
- **THEN** l'elenco contiene solo voci che dichiarano 120×120 tra le sezioni compatibili

### Requirement: Bullone passante su più strati
Il sistema SHALL espandere un giunto di ferramenta "bullone passante" definito da un pezzo di partenza, faccia, posizione, scostamento, diametro e un elenco di pezzi attraversati, in un foro passante su ogni pezzo attraversato dall'asse del bullone e in una voce di ferramenta con la lunghezza di catalogo minima sufficiente allo spessore totale. Un pezzo dichiarato ma non attraversato dall'asse MUST produrre un errore che cita il pezzo.

#### Scenario: Sandwich tavola–pilastro–tavola
- **WHEN** un bullone Ø12 è dichiarato dalla faccia esterna di una tavola 45×120 attraverso un pilastro 90×90 e la tavola opposta
- **THEN** i tre pezzi ricevono ciascuno un foro passante Ø13 allineato sullo stesso asse e la voce di ferramenta è un bullone M12 di lunghezza 200 (spessore 180 + margine)

#### Scenario: Pilastro MAXI
- **WHEN** lo stesso bullone attraversa un pilastro 120×120 tra due tavole 45×145
- **THEN** la lunghezza scelta è 240

#### Scenario: Pezzo non attraversato
- **WHEN** l'elenco dei pezzi include un pezzo che l'asse del bullone non interseca
- **THEN** l'espansione fallisce con un errore che indica il pezzo e il bullone

### Requirement: Lavorazioni indotte da staffe e supporti
Il sistema SHALL tradurre lo schema di fori/asole di una staffa a muro o a terra in lavorazioni sul pezzo di legno a cui è applicata (piede del pilastro, testa della trave o della mensola), nel sistema locale del pezzo, e registrare le lavorazioni prodotte nella voce di ferramenta. Le staffe senza lavorazioni nel legno (es. bicchiere) MUST produrre solo la voce di ferramenta e il conteggio delle viti.

#### Scenario: Portapilastro a lama interna
- **WHEN** una staffa `staffa-terra-lama-interna-90` è applicata al piede di un pilastro 90×90
- **THEN** il pilastro riceve un'asola di testa 8×68×180 centrata e 2 fori passanti Ø13 trasversali alle quote dichiarate dalla voce

#### Scenario: Supporto a scomparsa per pensilina
- **WHEN** `supporto-scomparsa-17` è applicato alla testa a muro di una mensola
- **THEN** la mensola riceve un'asola 8×105×250 dalla testa e 2 fori Ø15 e la voce dichiara l'inclinazione imposta di 17°

#### Scenario: Staffa a bicchiere
- **WHEN** `staffa-terra-bicchiere-90` è applicata al piede di un pilastro
- **THEN** il pilastro non riceve lavorazioni e l'elenco ferramenta contiene la staffa e 4 viti 8×40

### Requirement: Giunti metallici a N vie
Il sistema SHALL fornire voci di giunto metallico (2, 3 lineare, 3 angolare, 4, 5 vie; angoli 90°, 75°, 105°) con ingombro del nodo e profondità di inserimento delle aste, in modo che un template possa calcolare la lunghezza netta di ogni asta (interasse meno gli ingombri ai due estremi) e il numero di viti per giunto. Il numero di vie di un nodo MUST essere derivato dagli elementi che vi convergono.

#### Scenario: Lunghezza netta dell'asta
- **WHEN** due pilastri 90×90 distano 2580 mm in asse e sono collegati da una trave con giunti a 3 vie angolari di ingombro `A` e inserimento `i`
- **THEN** la lunghezza della trave è `2580 − 2·(A/2 − i)` secondo i valori della voce di catalogo

#### Scenario: Numero di vie derivato
- **WHEN** in un nodo convergono un pilastro e tre travi orizzontali ortogonali
- **THEN** la voce scelta è un giunto a 4 vie e il conteggio delle viti è quello dichiarato dalla voce

### Requirement: Cuspidi per padiglione
Il sistema SHALL fornire voci di cuspide metallica per 4 falde (25°), 6 falde (25°) e 8 falde (15°) con la pendenza imposta e le piastre di testa/piede dei puntoni associate; un template che le usa MUST ricavarne la pendenza e rifiutare configurazioni geometricamente incompatibili con un errore esplicito.

#### Scenario: Pendenza dalla cuspide
- **WHEN** un gazebo quadrato usa `cuspide-8-falde-15`
- **THEN** la pendenza dei puntoni intermedi è 15° e vengono generate 8 piastre di testa

#### Scenario: Cuspide su base rettangolare
- **WHEN** un gazebo a 4 lati con base 4000×3000 usa una cuspide metallica
- **THEN** la generazione è rifiutata con un errore che indica che la cuspide metallica richiede base quadrata

### Requirement: Elenco ferramenta dell'assieme
L'assieme generato SHALL contenere un elenco di voci di ferramenta con identificativo stabile per famiglia (`BUL-01`, `STM-01`, `STT-01`, `GNT-01`, `CUS-01`, `PST-01`), codice, descrizione, quantità, eventuale posa, pezzi collegati e lavorazioni indotte. Gli id MUST essere deterministici per lo stesso input e le lavorazioni indotte MUST citare l'id della ferramenta che le ha generate.

#### Scenario: Tracciabilità foro–bullone
- **WHEN** un bullone `BUL-03` fora tre pezzi
- **THEN** i tre fori hanno come origine `BUL-03` e la voce `BUL-03` elenca i tre pezzi e i tre fori

#### Scenario: Determinismo
- **WHEN** lo stesso template è generato due volte con gli stessi parametri
- **THEN** gli elenchi ferramenta sono identici, inclusi gli id

### Requirement: Conteggio di viti e tasselli
Viti e tasselli SHALL comparire nell'elenco ferramenta come una sola voce per codice con la quantità totale (somma dei contributi di tutte le staffe, giunti e appoggi che li dichiarano), senza posa.

#### Scenario: Somma delle viti dei giunti
- **WHEN** un telaio usa 4 giunti a 3 vie angolari (20 viti ciascuno) e 2 giunti a 4 vie (24 viti ciascuno)
- **THEN** l'elenco contiene una voce `vite-6x40` con quantità 128

#### Scenario: Viti di appoggio dei travetti
- **WHEN** 12 travetti appoggiano su 3 travi in costruzione bullonata
- **THEN** l'elenco contiene una voce di viti con quantità pari a 12·3 (una per appoggio)
