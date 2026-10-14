# Export SAT (ACIS testuale)

Writer SAT proprietario per il centro di lavoro CNC (design D7, spec `export-cnc`). Riceve la B-rep neutra dei pezzi
(`src/geometry/neutral-brep.ts`, estratta dal kernel OCCT nel worker) e scrive un file ACIS testuale con un body
nominato per pezzo, in millimetri, nel sistema di riferimento dell'assieme. Nessuna dipendenza da OCCT: tutto il
modulo gira e si testa in Node.

| File | Contenuto |
|---|---|
| `number.ts` | `formatSatNumber`: 15 cifre significative, niente `-0`, rumore < 1e-12 → `0` |
| `versions.ts` | versioni `4.0`/`7.0`/`21.0`, header, stringhe, **layout dei record** (unica fonte dell'ordine dei campi) |
| `writer.ts` | `writeSat(bodies, options)` → `{ text, written, errors }` |
| `options.ts` | `SatExportOptionsSchema` (zod, con default), `DEFAULT_SAT_OPTIONS` |
| `validate.ts` | `validateSat(text)` (validatore strutturale), `scanSat(text)` (lettura tollerante di file di terzi) |
| `compare.ts` | `compareWithSample(oursText, sampleText)`, `summarizeSat`, `suggestVersion` |
| `index.ts` | `exportSat(pieces, results, options)` e riesportazioni |

## Uso

```ts
import { exportSat, validateSat, compareWithSample } from "@/export/sat";

// pieces: Piece[] dell'assieme (servono id e pose); results: PieceResult[] del kernel (brep in locale)
const out = exportSat(assembly.pieces, results, { version: "7.0", fileMode: "assieme-unico", producer: "CAM X" });
out.data; // string (.sat) oppure Uint8Array (.zip con <id>.sat per pezzo)
out.errors; // SatBodyError[]: pezzi esclusi (id, entity, entityType, message); gli altri sono nel file
validateSat(out.files[0].text).ok; // "Verifica file"
compareWithSample(out.files[0].text, testoDelCampioneCnc).differences;
```

### Opzioni (`SatExportOptions`, persistite con la configurazione)

| Opzione | Valori | Default | Note |
|---|---|---|---|
| `version` | `"4.0"`, `"7.0"`, `"21.0"` | `"7.0"` | solo la 7.0 è coperta da test completi |
| `fileMode` | `"assieme-unico"`, `"un-file-per-pezzo"` | `"assieme-unico"` | per pezzo: ZIP (`fflate`) con `<id>.sat`, un body ciascuno |
| `units` | `"mm"` | `"mm"` | fissa nell'MVP, dichiarata nella riga 3 dell'header |
| `includeName` | `boolean` | `true` | attributo stringa con l'id del pezzo sul body |
| `producer` | testo (≤ 200) | `Lovato Legnami - Configuratore pergole` | campo "produttore/CAM", product id dell'header |
| `nameAttribute` | testo (1–64) | `ATTRIB_XACIS_NAME` | nome dell'attributo; da allineare al campione se il CAM legge un altro nome |

`exportSat` accetta inoltre `date` (data dell'header e delle voci ZIP, per output deterministici nei test).

## Struttura del file prodotto (7.0)

Esempio reale (estratto) per un parallelepipedo 10×20×30 di id `BOX-01` con posa identità:

```sat
700 0 1 0
@38 Lovato Legnami - Configuratore pergole @11 ACIS 7.0 NT @24 Wed Oct 14 09:30:00 2026
1 9.9999999999999995e-007 1e-010
body $1 -1 $-1 $2 $-1 $-1 #
string_attrib-name_attrib-gen-attrib $-1 -1 $-1 $-1 $0 keep keep_kept ignore copy_keep @17 ATTRIB_XACIS_NAME @6 BOX-01 #
lump $-1 -1 $-1 $-1 $3 $0 #
shell $-1 -1 $-1 $-1 $-1 $4 $-1 $2 #
face $-1 -1 $-1 $5 $16 $3 $-1 $10 forward single #
plane-surface $-1 -1 $-1 0 0 0 -1 0 0 0 1 0 forward_v I I I I #
loop $-1 -1 $-1 $-1 $22 $4 #
coedge $-1 -1 $-1 $23 $25 $45 $52 forward $16 $-1 #
edge $-1 -1 $-1 $70 0 $71 10 $33 $58 forward @7 unknown #
straight-curve $-1 -1 $-1 0 0 0 1 0 0 I I #
vertex $-1 -1 $-1 $46 $78 #
point $-1 -1 $-1 0 0 0 #
End-of-ACIS-data
```

e, per un foro passante Ø20 con asse Z in (50, 50):

```sat
face $-1 -1 $-1 $-1 $25 $2 $-1 $16 reversed single #
cone-surface $-1 -1 $-1 50 50 0 0 0 1 10 0 0 1 I I 0 1 10 forward I I I I #
ellipse-curve $-1 -1 $-1 50 50 0 0 0 1 10 0 0 1 I I #
```

### Header

1. `<versione> <n. record> <n. body> <flag>`: `700 0 N 0`. Numero di record `0` = "non dichiarato", come scrive ACIS
   stesso (il lettore si ferma al terminatore); flag `0` = nessuna history.
2. product id (`producer`), versione ACIS (`ACIS 7.0 NT`), data in formato C `ctime` (ora locale), come stringhe
   `@<len> testo`. I testi sono ridotti ad ASCII stampabile (accenti rimossi), così lunghezza in byte = caratteri.
3. `1 9.9999999999999995e-007 1e-010`: 1 unità = 1 mm, `resabs` = 1e-6, `resnor` = 1e-10.

### Record

Un record per riga, campi separati da spazi, chiuso da `#`, senza indice esplicito (l'indice è la posizione, da 0;
il validatore accetta anche i prefissi `-n`). Riferimenti `$n`, nullo `$-1`. Intestazione comune (≥ 7.0):
puntatore attributo, intero `-1` (id), e per topologia e geometria puntatore `pattern` `$-1`.

| Entità | Campi dopo l'intestazione comune |
|---|---|
| `body` | lump, wire `$-1`, transform `$-1` |
| `lump` | next lump, shell, body |
| `shell` | next shell, subshell `$-1`, prima face, wire `$-1`, lump |
| `face` | next face, primo loop, shell, subshell `$-1`, surface, `forward`/`reversed`, `single` |
| `loop` | next loop, primo coedge, face |
| `coedge` | next, prev, partner, edge, `forward`/`reversed` (rispetto allo spigolo), loop, pcurve `$-1` |
| `edge` | vertice iniziale, parametro iniziale, vertice finale, parametro finale, un coedge, curva, `forward`, `@7 unknown` |
| `vertex` | uno spigolo, point |
| `point` | x y z |
| `plane-surface` | origine, normale, direzione u, `forward_v`, `I I I I` |
| `cone-surface` | centro, asse, asse maggiore (lunghezza = raggio), rapporto `1`, `I I`, sin `0`, cos `1`, scala u = raggio, `forward`, `I I I I` |
| `straight-curve` | origine, direzione unitaria, `I I` |
| `ellipse-curve` | centro, normale, asse maggiore (lunghezza = raggio), rapporto `1`, `I I` |
| `string_attrib-name_attrib-gen-attrib` | next `$-1`, prev `$-1`, proprietario (body), `keep keep_kept ignore copy_keep`, nome attributo, valore (id pezzo) |

Ordine dei record per body: body, attributo, lump, shell, facce, superfici, loop, coedge, spigoli, curve, vertici,
punti; i body si susseguono con indici globali. Un body per pezzo, un lump e una shell per body.

### Scelte

- **Posa applicata alla geometria** (coordinate "cotte" nel sistema assieme), `transform` del body sempre `$-1`:
  tutti i lettori interpretano allo stesso modo le coordinate assolute, mentre la gestione dell'entità `transform`
  (e dei suoi flag `no_rotate no_reflect no_shear`) varia tra CAM. Le pose devono essere rototraslazioni
  (determinante 1): un pezzo con posa riflessa o scalata va in `errors` con `entity: "posa"`.
- **Orientamenti**: ereditati dalla B-rep neutra, che usa già le convenzioni ACIS: normale esterna = normale della
  superficie se la faccia è `forward`; faccia a sinistra del coedge vista dall'esterno; ogni spigolo con verso
  concorde con la propria curva (`edge ... forward`) e parametri = parametri della curva. Il cilindro ha `cos = 1`,
  cioè normale della superficie radiale uscente; un foro è una faccia `reversed`.
- **Cuciture**: la faccia cilindrica estratta da OCCT ha un solo loop `cerchio, cucitura, cerchio, cucitura⁻¹`. Il
  writer scarta la cucitura e scrive due loop di un coedge ciascuno (rappresentazione ACIS di una faccia periodica
  senza cucitura), quindi un foro passante dà 1 `cone-surface`, 2 `ellipse-curve` e nessuna `straight-curve` in più.
  Se i tratti rimasti non si chiudono (cilindro tagliato in modo irregolare) la cucitura viene mantenuta: spigolo
  usato due volte, con versi opposti, dallo stesso loop.
- **Nome del body**: attributo generico `string_attrib-name_attrib-gen-attrib` con nome `ATTRIB_XACIS_NAME` (quello
  usato dai traduttori ACIS per i nomi delle entità) e valore = id del pezzo (`PIL-01`, …).
- **Numeri**: `toPrecision(15)` senza zeri finali; esponente in stile C solo sotto 1e-6 o sopra 1e21; |v| < 1e-12
  scritto `0` (rumore delle rotazioni, molto sotto `resabs`).
- **Fine riga** `\n` (i lettori ACIS ignorano gli spazi bianchi; il validatore accetta anche `\r\n`).

## Validazione

### Interna (automatica)

`validateSat(text)` legge il file con i layout di `versions.ts` e controlla: header (3 righe, versione supportata,
numero di body), tipo e numero dei campi di ogni record, `#` finale, terminatore; ogni `$n` esistente, di tipo
compatibile e non nullo dove obbligatorio; ogni record raggiungibile da un body; catene body→lump→shell→face→loop
con i puntatori all'indietro; per ogni loop la catena dei `next` torna al primo coedge, `next.prev` e `prev.next`
coerenti, vertici concatenati; partner sullo stesso spigolo con verso opposto; ogni spigolo usato da 2 coedge (solido
chiuso); vertici sulla curva ai parametri dello spigolo; attributi nella catena del proprietario. Restituisce
`{ ok, errors, warnings, counts, bodies (con nome) }`. È usato dai test (`validate.test.ts`, `index.test.ts`,
`sat.geometry.test.ts` sui solidi OCCT reali delle due tipologie) e dalla UI ("Verifica file").

```bash
npm test -- src/export/sat            # unit (B-rep TS pure: box, foro fatto a mano)
npm run test:geometry -- src/export   # solidi OCCT reali → SAT → validateSat
```

### Contro il SAT campione della CNC (manuale, prima della produzione)

Il CAM della macchina non è noto: il file va provato sul CAM reale.

1. Farsi dare dall'ufficio tecnico un file `.sat` **accettato dalla macchina** (esportato dal CAD che usano oggi),
   possibilmente di un pezzo con un foro.
2. Esportare dal configuratore lo stesso tipo di pezzo (o la monofalda di esempio) con le opzioni di default.
3. Confrontare i due file: `compareWithSample(nostroTesto, testoCampione)`. Le differenze hanno severità `errore`
   (probabile rifiuto: es. versione più recente di quella del campione), `avviso` (da verificare: unità, entità che
   il campione non usa, nome dell'attributo) o `info`, e quando possibile un `suggestion: { option, value }` con
   l'opzione da cambiare (`version`, `fileMode`, `includeName`, `nameAttribute`).
4. Applicare i suggerimenti, riesportare e importare il file nel CAM: verificare che i body siano solidi (non
   superfici), che le quote e i fori corrispondano, che i nomi dei pezzi compaiano, che la posizione nell'assieme sia
   corretta. Provare anche `un-file-per-pezzo` se il CAM lavora un pezzo per file.
5. Se il CAM rifiuta il file: provare `includeName: false`, poi la versione del campione; se l'errore resta,
   confrontare a mano i record dello stesso tipo nei due file e correggere il layout in `versions.ts` (aggiornando
   i test).
6. Fissare le opzioni trovate come default (`DEFAULT_SAT_OPTIONS` / esempi della configurazione) e annotarle qui.

## Limiti (MVP)

- **Superfici**: solo piane (`plane-surface`) e cilindriche (`cone-surface` con semiangolo 0); **curve**: solo rette
  (`straight-curve`) e cerchi/archi (`ellipse-curve` con rapporto 1). Un pezzo con altre superfici o curve (B-spline,
  tori, coni veri) va in `errors` con id del pezzo e tipo OCCT; gli altri pezzi sono esportati.
- Nessuna `pcurve` (curve nello spazio parametrico) né bounding box: i lettori ACIS le ricalcolano, ma CAM con
  lettori SAT propri e minimali potrebbero richiederle.
- Facce sempre `single` (solidi chiusi), nessun `transform`, nessuna history, nessun colore/layer.
- **4.0**: header senza `@`, stringhe `<len> testo`, record senza id/pattern, spigoli senza parametri né convessità;
  le azioni dell'attributo (`keep keep_kept ignore copy_keep`) sono scritte come in 7.0 (non verificato). Coperta
  dai test del validatore ma non provata su un lettore ACIS.
- **21.0**: header `21000 0 n 0` con `ACIS 21.0 NT` e stringhe `@`, ma i record usano il layout della 7.0: le
  aggiunte delle versioni successive (es. bounding box su alcune entità) non sono scritte. Non è il formato Autodesk
  ASM (AutoCAD/Inventor, header `2xx00`, record `asmheader`, terminatore `End-of-ASM-data`). Usarla solo se il
  campione della CNC lo richiede e dopo una prova di import; altrimenti preferire la 7.0, che i lettori recenti
  leggono comunque.
- La correttezza del formato è verificata dal nostro validatore e da conoscenza della specifica ACIS pubblica, non da
  un lettore ACIS di riferimento (OCCT non legge né scrive SAT): la prova nel CAM della CNC resta obbligatoria.
