# Spec Delta

## Purpose

Estende il configuratore interno con il preventivo in vista ufficio, l'inserimento della pianta fuori squadra e dei fattori di cantiere, e l'apertura delle richieste dei clienti.

## ADDED Requirements

### Requirement: Pannello preventivo
Il configuratore interno SHALL mostrare un pannello "Preventivo" aggiornato a ogni modifica dell'assieme con la vista ufficio: righe per categoria, totale, margini, piano di taglio per sezione con sfrido percentuale, fattori di cantiere e complicazioni scattate, versione del listino in uso e avvisi (prezzi mancanti, zona da verificare). Il pannello MUST offrire anche l'anteprima della vista cliente.

#### Scenario: Aggiornamento
- **WHEN** l'utente cambia la larghezza da 5000 a 6000
- **THEN** il pannello mostra il nuovo totale e le righe del legno cambiate entro 300 ms

#### Scenario: Piano di taglio
- **WHEN** l'utente apre il dettaglio del legno
- **THEN** vede per ogni sezione le barre consumate con i tagli e lo sfrido percentuale

### Requirement: Pianta e fattori di cantiere nel form ingombro
Il form dell'ingombro SHALL permettere di scegliere tra pianta rettangolare e fuori squadra (inserimento degli angoli o delle misure con diagonali), mostrare la deviazione calcolata e permettere di dichiarare accesso al cantiere e ancoraggio. Il viewer MUST disegnare la pianta reale dell'ingombro e il piano del muro.

#### Scenario: Inserimento diagonali
- **WHEN** l'utente inserisce misure con diagonali diverse
- **THEN** il form mostra la deviazione in gradi, il viewer disegna la pianta inclinata e le teste dei travetti seguono il muro

### Requirement: Apertura di una richiesta
Il configuratore SHALL accettare l'identificativo di una richiesta e caricarne la configurazione, mostrando un'intestazione con codice, cliente e stato, un pulsante "Salva preventivo definitivo" (righe manuali e sconti) e il collegamento alla richiesta nell'area admin. Senza identificativo il comportamento MUST restare quello attuale.

#### Scenario: Caricamento da richiesta
- **WHEN** il configuratore è aperto con una richiesta valida
- **THEN** la configurazione del cliente è caricata e l'intestazione mostra il codice della richiesta

#### Scenario: Richiesta inesistente
- **WHEN** l'identificativo non esiste
- **THEN** il configuratore mostra un avviso e parte dalla configurazione predefinita

### Requirement: Listino e regole dalla versione attiva
Il configuratore interno SHALL caricare all'avvio il listino e le regole della versione attiva e mostrare la loro versione; MUST funzionare con i dati di default se il caricamento fallisce, con un avviso.

#### Scenario: Versione mostrata
- **WHEN** il listino attivo è la v5 del 1° giugno
- **THEN** il pannello preventivo mostra "Listino v5 (dal 01/06)"
