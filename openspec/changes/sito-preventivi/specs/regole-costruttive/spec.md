# Spec Delta

## Purpose

Rende il set di regole costruttive un dato configurabile dall'ufficio: la versione attiva è caricata dall'archivio, il file dati resta seme e ripiego.

## ADDED Requirements

### Requirement: Set di regole dalla versione attiva
Il configuratore interno e il wizard pubblico SHALL valutare l'assieme con il set di regole della versione attiva dell'archivio; in assenza di archivio raggiungibile o di versione attiva, il sistema MUST usare il set di default dei file dati e segnalare l'origine (`archivio` o `default`) nei risultati.

#### Scenario: Versione attiva presente
- **WHEN** l'ufficio ha pubblicato un set con interasse massimo 700
- **THEN** il configuratore segnala violazione per un interasse di 750 e indica origine `archivio`

#### Scenario: Archivio non raggiungibile
- **WHEN** l'archivio non risponde
- **THEN** il configuratore usa il set di default, indica origine `default` e mostra un avviso non bloccante

### Requirement: Validazione del set modificato
Un set di regole modificato dall'ufficio SHALL essere validato con le stesse regole del caricamento dei file dati (tipi ammessi, sezioni normalizzate, id univoci) e MUST essere provato su tutte le tipologie registrate con i parametri di default prima della pubblicazione; una pubblicazione che renderebbe una tipologia visibile sul sito non generabile senza errori MUST essere rifiutata con l'elenco delle tipologie.

#### Scenario: Set non valido
- **WHEN** l'ufficio inserisce una regola con tipo sconosciuto
- **THEN** il salvataggio della bozza fallisce citando l'id della regola

#### Scenario: Pubblicazione che rompe una tipologia
- **WHEN** il set in bozza impone una luce massima che rende la bifalda di default in errore e la bifalda è visibile sul sito
- **THEN** la pubblicazione è rifiutata con "tipologie non generabili: autoportante-bifalda"
