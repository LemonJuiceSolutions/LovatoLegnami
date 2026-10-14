# Spec Delta

## ADDED Requirements

### Requirement: Solido di un pezzo curvo
Il kernel SHALL costruire il solido di un pezzo curvo come rivoluzione della sezione rettangolare attorno all'asse di curvatura per l'angolo sotteso, producendo esclusivamente facce piane e cilindriche e spigoli rettilinei o circolari; il solido MUST passare la verifica di validità e avere volume pari a `b·h·sviluppo` entro lo 0,1%.

#### Scenario: Arco 90×90 R 2400
- **WHEN** viene costruito un arco 90×90 di raggio 2400 e 93°
- **THEN** la B-rep estratta ha 2 facce cilindriche, 4 piane, 4 spigoli circolari e 8 rettilinei, nessuna faccia o curva `altro`

### Requirement: Lavorazioni sui pezzi curvi nel kernel
Il kernel SHALL applicare ai pezzi curvi i fori laterali (asse parallelo all'asse di curvatura, posizione da coordinata curvilinea) e i tagli di testa nel piano di curvatura, mantenendo il risultato su facce piane e cilindriche.

#### Scenario: Due fori di testa nell'arco
- **WHEN** un arco riceve due fori Ø9 sulla faccia `sinistra` a 100 e 200 mm dalla testa finale
- **THEN** il solido ha 2 facce cilindriche aggiuntive con 4 spigoli circolari e nessuna curva `altro`

#### Scenario: Taglio di testa radiale
- **WHEN** l'arco riceve un taglio di testa con angolo 10° (senza secondo angolo)
- **THEN** la faccia di testa risultante è piana con 4 spigoli rettilinei

### Requirement: Utensili delle nuove lavorazioni
Il kernel SHALL costruire gli utensili di `asola-lama` (prisma rettangolare dalla testa) e `dardo-di-giove` (prisma dal profilo obliquo a dente esteso oltre le facce laterali), e trattare `tavola`, `cantonale`, `monaco`, `mensola`, `fascia` e `grigliato` come parallelepipedi.

#### Scenario: Pilastro con lama interna
- **WHEN** un pilastro 90×90 riceve asola 8×68×180 e 2 fori Ø13
- **THEN** il solido è valido, in un solo pezzo, con volume ridotto di `8·68·180` più i fori entro l'1%

#### Scenario: Dardo di Giove complementare
- **WHEN** due travi con lavorazioni `dardo-di-giove` complementari sono costruite e posizionate
- **THEN** la somma dei volumi è pari a `b·h·(L1 + L2 − sovrapposizione)` entro l'1% (i profili si completano a vicenda) e i due solidi non si compenetrano oltre 1 mm³

### Requirement: B-rep neutra di un arco senza kernel
Il sistema SHALL fornire un generatore in TypeScript puro della B-rep neutra di un arco (stesse convenzioni della B-rep estratta dal kernel) per testare gli export senza WASM.

#### Scenario: Conteggi del generatore
- **WHEN** viene generata la B-rep di un arco 90×90 R 2400 93°
- **THEN** ha 8 vertici, 12 spigoli (4 circolari), 6 facce (2 cilindriche) e passa la verifica topologica
