# Dominio del configuratore pergole

TypeScript puro (nessun import da React, Three, replicad: lo vieta eslint). Tutto è
testabile in Node con `npm test`. Si importa sempre da `@/domain`.

## Sistema di riferimento e unità

- Millimetri ovunque, angoli in **gradi** nelle API pubbliche.
- Origine all'**angolo anteriore sinistro** del box ingombro, a quota pavimento di
  riferimento 0. **X** lungo il fronte (larghezza), **Y** in profondità (verso il muro
  per le addossate), **Z** in alto.
- Pezzo: asse X locale lungo la lunghezza (0…`length`), sezione centrata (`b` lungo Y
  locale, `h` lungo Z locale); `pose` è una `Mat4` per righe (locale → assieme).
- Id stabili `<FAM>-<nn>` (`PIL-01`, `TRV-01`, `TVT-07`, …) in ordine di generazione.

## Flusso tipico

```ts
import {
  DEFAULT_LOVATO_RULES,
  autoSize,
  checkCollisions,
  evaluateRules,
  findHardware,
  fitToEnvelope,
  floorFunction,
  fromJSON,
  generate,
  listTypologies,
  parseEnvelope,
  toJSON,
} from "@/domain";

const envelope = parseEnvelope({
  box: { width: 6000, depth: 3500, height: 3200 },
  obstacles: [{ id: "grondaia", type: "grondaia", side: "posteriore", elevation: 2700, height: 120, projection: 150 }],
  floor: { corners: { backLeft: -100, backRight: -100 } },
});
const floorHeightAt = floorFunction(envelope);

const slug = listTypologies()[0].slug; // "addossata-monofalda"
const assembly = generate(slug, { larghezza: 5000, pendenza: 12 }, { floorHeightAt, embedment: 0 });

const { violations, valid } = evaluateRules(assembly, DEFAULT_LOVATO_RULES, { floorHeightAt });
const collisions = checkCollisions(assembly, envelope);
const { proposals, params } = autoSize(assembly, DEFAULT_LOVATO_RULES);
const fit = fitToEnvelope(slug, envelope, { pendenza: 12 }, DEFAULT_LOVATO_RULES);

const copy = fromJSON(toJSON(assembly));

// tipologie estese: parametri a scelta (stringhe), costruzione bullonata/carpenteria, ferramenta
const gazebo = generate("gazebo-padiglione", { lati: "8", larghezza: 4000, costruzione: "carpenteria" });
const bolts = generate("portale-sandwich", { costruzione: "bullonata" }).hardware.filter((h) => h.kind === "bullone");
const m12 = findHardware(bolts[0].code); // voce di catalogo: dimensioni, fonte, "DA VALIDARE"

export const summary = {
  valid,
  violations,
  collisions,
  proposals,
  params,
  fit: fit.ok ? fit.limits : fit.message,
  pieces: copy.pieces.length,
  gazebo: gazebo.pieces.length,
  bolts: bolts.length,
  bolt: m12.name,
};
```

## Primitivi, pezzi curvi e lavorazioni

- `PIECE_TYPES`: `trave, colmo, travetto, puntone, banchina, pilastro, controvento` e
  (tipologie estese) `tavola, arco, cantonale, monaco, mensola, fascia, grigliato`, con le
  famiglie d'id `TAV, ARC, CAN, MON, MEN, FAS, GRG`.
- Pezzi curvi: solo `arco`, con `curve: { radius, sweep }` (gradi); asse nel piano locale
  X–Z, parte dall'origine tangente a +X e curva verso +Z, `length` = sviluppo
  `radius·sweep(rad)`. Su un curvo sono ammessi solo `foro` sulle facce `sinistra/destra` e
  `taglio-testa` senza `angle2` (taglio radiale, `at` curvilineo): così il SAT resta su
  facce piane e cilindriche. Ingombro con `pieceObbs` (un box per tratto di 15°).
- Lavorazioni: oltre a mezzo legno, tenone/mortasa, becco d'uccello, foro e taglio di
  testa, `asola-lama` (fresata per lame di staffe) e `dardo-di-giove` (giunto di testa
  tra correnti, giunto `dardo-di-giove`). Un taglio composto è un `taglio-testa` con
  `angle`/`angle2`: `headCutFromPlane(pezzo, piano, testa)` lo calcola da un piano
  qualsiasi (muro, faccia del monaco, diagonale), anche sui curvi (taglio radiale).

## Ferramenta

`domain/hardware`: catalogo dati (`HARDWARE_CATALOG`, `findHardware`, `hardwareFor`) di
bulloni, viti, tasselli, staffe a muro e a terra, giunti a N vie, cuspidi e piastre, ogni
voce con `source` (sezione della ricerca) e marcata DA VALIDARE. Nei template la
ferramenta è lo step `hardware { code, pieces, anchor?, params? }`:
- `bullone-passante` (`face`, `at`, `offset`, `diameter`): fori passanti su ogni strato e
  lunghezza scelta dal catalogo (spessore serrato + 20);
- staffe/supporti/piastre: fori e asole dello schema della voce tradotti sul primo pezzo
  (`anchor` `piede` | `testa` | `faccia` con `at`), viti conteggiate;
- giunti a N vie (`giunto-vie` per la scelta automatica o un codice) e cuspidi (`point`):
  vie derivate dalle aste che convergono;
- viti e tasselli (`count`): solo conteggi.
Le voci finiscono in `assembly.hardware` (fuse da `mergeHardware`: una voce per codice di
viti/tasselli); staffe a muro, giunti, cuspidi e piastre fanno da appoggio nelle misure.

## Parametri a scelta, visibilità, costruzione

- `EnumParamSpec { kind: "enum", options, default }` (valori stringa, `ctx.enum(name)`);
  `visibleWhen(params)` su qualsiasi parametro nasconde il campo nella UI ma il valore è
  sempre risolto.
- `category` (`addossata | autoportante | carport | gazebo | pensilina`), `tags` e
  `reference` (scheda della ricerca) sono esposti da `listTypologies()`.
- `fitAliases` (facoltativo): parametro usato da `fitToEnvelope` per una dimensione
  dell'ingombro quando il nome differisce (la pensilina adatta `sbalzo` alla profondità).
- Mattoni duali in `templates/shared.ts` con il parametro comune `constructionParam()`
  (`bullonata` | `carpenteria`): `beamOnPosts` (sandwich di tavole con bulloni e saette
  tra le tavole, oppure trave singola con tenone e saette a 45°, stessa pianta e stesso
  intradosso), `joistsOnBeams` (appoggio avvitato | mezzo legno o becco d'uccello),
  `wallAttachment` (staffe a muro | banchina con becco d'uccello, `WALL_SLOPE` per la
  pendenza imposta), `groundAnchor`/`groundAnchorParam`, `headCutOnPlane`. I mattoni
  restituiscono step e geometria (`Placed`, piani) da usare nei mattoni successivi.

## Aggiungere una tipologia

1. Creare `typologies/templates/<slug>.ts` che esporta un `TypologyTemplate`:
   `slug`, `name`, `description`, `params: ParamSpec[]` (tutti con default e limiti) e
   `build(ctx)` che restituisce step dichiarativi `place` / `repeat` / `machining` /
   `joint`. Riusare i mattoni di `templates/shared.ts` (`commonParams`, `columnStep` per i
   pilastri che seguono il pavimento, `joistSteps`, `braceSteps`, …) e i nomi di
   parametro comuni (`larghezza`, `profondita`, `altezza`, `pendenza`, `interasse`,
   `sezione<Tipo>`): regole, auto-dimensionamento e adattamento li usano per convenzione.
2. Aggiungerlo a `BUILTIN_TEMPLATES` in `typologies/templates/index.ts`. La
   registrazione valida slug, parametri e una generazione di prova con i default.
3. Test del template e, se serve, una fixture golden in `__fixtures__/`
   (`UPDATE_GOLDEN=1 npx vitest run src/domain/typologies/golden.test.ts`).
4. Metadati di catalogo (`category`, `tags`, `reference`) obbligatori; i valori presi dal
   catalogo commerciale vanno marcati `DA VALIDARE CON UFFICIO TECNICO`.

Tipologia **bullonata/carpenteria**: dichiarare `constructionParam()` e costruire con
`constructionOf(ctx)` e i mattoni duali; i parametri propri di un solo modo (es.
`sezioneTavola` per la sandwich, `sezioneTrave` per la carpenteria) si nascondono con
`visibleWhen: (p) => p.costruzione === "…"`. La ferramenta va solo negli step `hardware`
(mai come pezzi): in carpenteria l'elenco non deve contenere bulloni. Esempi:
`portale-sandwich` (portali), `addossata-sandwich` (attacco a muro), `gazebo-padiglione`
(giunti 916 e cuspide | mezzo legno, tenoni e monaco con tagli composti), `a-elle`
(compluvio e travetti tagliati con `headCutFromPlane`).

## Modificare le regole costruttive

Le regole sono dati in `rules/data/default-lovato.ts` (marcati **DA VALIDARE CON
UFFICIO TECNICO**): tabella luci per tipo di pezzo e sezione, interasse, sbalzo,
altezza libera, pendenza, sezioni minime. Cambiare un valore non richiede toccare il
motore. Per un set diverso basta passare a `evaluateRules` un altro `RuleSet`
caricato con `loadRuleSet(json)`, che rifiuta tipi di vincolo sconosciuti citando l'id
della regola. Le regole valutano le **misure effettive** dell'assieme
(`measureAssembly`), non i parametri, quindi valgono per ogni tipologia.
