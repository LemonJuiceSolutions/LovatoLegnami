# Spec Delta

## Purpose

Presenta Lovato Legnami e le sue pergole al pubblico con un sito curato, veloce e accessibile, che porta il visitatore al configuratore guidato e non espone alcun dato interno.

## ADDED Requirements

### Requirement: Pagine pubbliche
Il sito SHALL offrire: home (presentazione, tipologie in evidenza, invito al preventivo, contatti), elenco tipologie, pagina di ogni tipologia visibile (immagini, miniatura/3D, descrizione, caratteristiche, "a partire da", avvio del wizard precompilato), galleria, contatti, informativa privacy. Tutti i testi MUST essere in italiano e gestibili dall'area admin dove previsto.

#### Scenario: Pagina tipologia
- **WHEN** un visitatore apre la pagina di `portale-sandwich`
- **THEN** vede titolo commerciale, descrizione, immagini, prezzo "a partire da" e il pulsante che apre il wizard con quella tipologia già scelta

#### Scenario: Tipologia non visibile
- **WHEN** un visitatore apre l'indirizzo di una tipologia nascosta
- **THEN** riceve una pagina 404 del sito

### Requirement: Identità visiva propria
Il sito SHALL avere un livello visivo distinto dall'applicazione interna (palette legno e materiali naturali, tipografia con carattere display e carattere di testo, spaziature ampie), condividendo i token di tema e i componenti di base dell'applicazione; MUST supportare tema chiaro e scuro secondo le preferenze del sistema e MUST essere leggibile da 360 px a 1920 px senza scorrimento orizzontale.

#### Scenario: Larghezza minima
- **WHEN** la home è aperta a 360 px
- **THEN** non c'è scorrimento orizzontale e i testi hanno dimensione ≥ 16 px

#### Scenario: Tema scuro
- **WHEN** il sistema preferisce il tema scuro
- **THEN** il sito usa la variante scura della palette con contrasto ≥ 4,5:1 sui testi

### Requirement: Prestazioni
Le pagine pubbliche (home, tipologie, galleria) MUST NOT caricare il visualizzatore 3D, il kernel geometrico né lo stato del configuratore; il JavaScript iniziale di queste pagine MUST restare sotto 200 kB compressi e le immagini MUST essere servite ottimizzate e con dimensioni dichiarate. Il wizard MUST caricare il 3D solo al passo di riepilogo.

#### Scenario: Peso della home
- **WHEN** viene analizzato il bundle della home
- **THEN** non contiene moduli del 3D né del kernel e pesa meno di 200 kB compressi

#### Scenario: Core Web Vitals
- **WHEN** la home è misurata su connessione 4G simulata
- **THEN** LCP < 2,5 s e CLS < 0,1

### Requirement: SEO
Ogni pagina pubblica SHALL avere titolo e descrizione, URL canonico, Open Graph e dati strutturati (attività locale sulla home, prodotto sulle tipologie); il sito SHALL pubblicare `sitemap.xml` e `robots.txt`. Le pagine interne, admin e del wizard dopo il primo passo MUST essere escluse dall'indicizzazione.

#### Scenario: Sitemap
- **WHEN** viene richiesta `sitemap.xml`
- **THEN** contiene home, tipologie visibili, galleria, contatti e privacy, e nessun percorso interno

#### Scenario: Pagina interna non indicizzabile
- **WHEN** viene letta l'intestazione della pagina di accesso
- **THEN** contiene `noindex`

### Requirement: Accessibilità
Il sito MUST rispettare i criteri WCAG 2.1 AA verificabili automaticamente: ordine di tabulazione, focus visibile, testi alternativi, contrasto, etichette dei controlli, struttura di intestazioni, riduzione del movimento rispettata.

#### Scenario: Verifica automatica
- **WHEN** le pagine pubbliche sono analizzate con uno strumento di accessibilità automatico
- **THEN** non risultano violazioni di livello A o AA

### Requirement: Nessun dato interno
Le risposte del sito pubblico (pagine e API) MUST NOT contenere listini, margini, tariffe, piani di taglio, file CAD, né collegamenti alle aree interne; il riepilogo del wizard MUST mostrare solo la vista cliente del prezzo.

#### Scenario: Risposta dell'API di stima
- **WHEN** il wizard richiede la stima
- **THEN** la risposta contiene solo la vista cliente e nessun campo di costo interno

#### Scenario: Nessun export CAD
- **WHEN** il visitatore raggiunge il riepilogo del wizard
- **THEN** non esistono controlli né percorsi per scaricare SAT, STEP o distinta
