# Spec Delta

## Purpose

Descrive le tipologie di copertura (addossata monofalda, autoportante bifalda e future) come template dati che, dati i parametri dell'utente, generano l'assieme completo di pezzi posizionati, giunti e lavorazioni; l'obiettivo è che ogni nuova tipologia sia un'aggiunta di soli dati.

## ADDED Requirements

### Requirement: Registro delle tipologie
Il sistema SHALL esporre un registro di tipologie di copertura identificate da uno slug (es. `addossata-monofalda`, `autoportante-bifalda`), ciascuna con nome leggibile, descrizione, elenco dei parametri richiesti (nome, unità, minimo, massimo, default) e il template di composizione. Il registro MUST essere interrogabile per elencare le tipologie disponibili.

#### Scenario: Elenco tipologie MVP
- **WHEN** viene richiesto l'elenco delle tipologie
- **THEN** sono presenti almeno `addossata-monofalda` e `autoportante-bifalda` con nome, descrizione e parametri

#### Scenario: Tipologia sconosciuta
- **WHEN** viene richiesta la generazione per uno slug non registrato
- **THEN** il sistema restituisce un errore "tipologia non trovata"

### Requirement: Parametri comuni di tipologia
Ogni tipologia SHALL accettare almeno i parametri comuni: larghezza (fronte) in mm, profondità (sporto dal muro o lunghezza) in mm, altezza utile sotto trave in mm, pendenza in gradi o percentuale, interasse travetti desiderato in mm, sbalzo di gronda in mm, numero di campate (o passo pilastri) e sezioni per ogni famiglia di pezzo. I parametri MUST essere validati contro i limiti dichiarati prima della generazione.

#### Scenario: Parametro fuori limiti
- **WHEN** viene richiesta una larghezza inferiore al minimo dichiarato dalla tipologia
- **THEN** la generazione è rifiutata con un errore che indica parametro, valore e intervallo ammesso

#### Scenario: Default applicati
- **WHEN** un parametro opzionale non è fornito
- **THEN** viene usato il default dichiarato dalla tipologia

### Requirement: Generazione dell'assieme da template
Data una tipologia e parametri validi, il sistema SHALL generare un assieme deterministico composto da pezzi (con id stabili e ripetibili), giunti e lavorazioni, posizionati nel sistema di riferimento dell'assieme (origine all'angolo anteriore sinistro a quota pavimento zero, X lungo il fronte, Y in profondità, Z verso l'alto). Lo stesso input MUST produrre sempre lo stesso output.

#### Scenario: Generazione deterministica
- **WHEN** la stessa tipologia è generata due volte con gli stessi parametri
- **THEN** i due assiemi sono identici, inclusi gli id dei pezzi

#### Scenario: Id stabili al variare dei parametri
- **WHEN** si aumenta la larghezza di una pergola senza cambiare il numero di campate
- **THEN** i pezzi preesistenti mantengono lo stesso id e cambiano solo lunghezza/posa

### Requirement: Tipologia addossata monofalda
La tipologia `addossata-monofalda` SHALL generare: una banchina a muro, una trave di fronte su pilastri (numero pilastri = campate + 1), travetti inclinati dalla banchina alla trave con sbalzo di gronda, e controventi/saette tra pilastri e trave quando previsto dai parametri. I travetti MUST ricevere tagli di testa inclinati e il becco d'uccello sull'appoggio alla trave; la banchina MUST ricevere fori ferramenta a passo configurato.

#### Scenario: Conteggio pezzi monofalda
- **WHEN** viene generata una monofalda larga 6000 mm, profonda 3000 mm, 2 campate, interasse travetti 600 mm
- **THEN** l'assieme contiene 1 banchina, 1 trave, 3 pilastri, 11 travetti e 6 controventi

#### Scenario: Quota travetti da pendenza
- **WHEN** la pendenza è 15° e la profondità 3000 mm
- **THEN** la differenza di quota tra banchina e trave di fronte è pari a 3000·tan(15°) e i travetti hanno lunghezza coerente con l'ipotenusa più lo sbalzo

### Requirement: Tipologia autoportante bifalda
La tipologia `autoportante-bifalda` SHALL generare: due travi longitudinali su due file di pilastri, un colmo centrale su puntoni (o montanti di colmo), travetti inclinati su entrambe le falde con sbalzo, e controventi. I puntoni MUST innestarsi nel colmo e nelle travi con giunti tenone-mortasa; i travetti MUST avere tagli di testa e becco d'uccello sugli appoggi.

#### Scenario: Simmetria delle falde
- **WHEN** viene generata una bifalda con pendenza 20°
- **THEN** le due falde hanno lo stesso numero di travetti e lunghezze speculari rispetto all'asse del colmo

#### Scenario: Conteggio pezzi bifalda
- **WHEN** viene generata una bifalda larga 5000 mm, profonda 4000 mm, 2 campate, interasse travetti 800 mm
- **THEN** l'assieme contiene 2 travi, 1 colmo, 6 pilastri, almeno 3 coppie di puntoni e 2 serie di travetti con conteggio uguale

### Requirement: Estensibilità per soli dati
Aggiungere una nuova tipologia (piana, padiglione, a L, lamellare) SHALL richiedere solo l'aggiunta di un nuovo template dati nel registro, senza modifiche alle capability di regole, ingombro, geometria o export. Il template MUST dichiarare i propri parametri e comporre esclusivamente primitivi e lavorazioni del catalogo.

#### Scenario: Registrazione di una tipologia di test
- **WHEN** nei test viene registrato un template minimale "piana-test" che compone solo pilastri e travi
- **THEN** la generazione, le regole, l'adattamento all'ingombro e l'export funzionano senza modifiche al codice di quelle capability

#### Scenario: Template con primitivo sconosciuto
- **WHEN** un template riferisce un tipo di componente non presente nel catalogo
- **THEN** la registrazione del template è rifiutata con errore esplicito
