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

## Pianta fuori squadra

L'ingombro può dichiarare una **pianta quadrilatera** (`envelope.plan.corners`, angoli in
senso antiorario: anteriore sinistro, anteriore destro, posteriore destro, posteriore
sinistro). Assente = il rettangolo del box: tutto resta come prima. La pianta deve
essere convessa e il box è il rettangolo che la contiene (`boxOfPlan`); il cliente la
dà con lati e diagonali (`planFromDiagonals`, tolleranza 20 mm, "misure non coerenti:
ricontrolla le diagonali" se non tornano; `measuresFromPlan` è l'inverso).

- `planOf`, `sideSegment`, `sidePlane`, `wallPlane`: pianta e piani verticali dei lati
  (normale verso l'interno). Gli ostacoli dei lati seguono il lato reale (OBB) e
  `checkCollisions`/`fitToEnvelope` lavorano sul prisma della pianta.
- `planDeviations`: rotazione dei lati e deviazione degli angoli da 90°; alimentano i
  fattori di cantiere `planDeviationDeg`/`wallDeviationDeg` (regola "fuorisquadra").
- Tipologie a muro (`template.wallPlanes`): `BuildOptions.wallPlane` (e `wallPlane2` per
  la pergola a L) porta il muro reale. Il template ne usa l'orientamento e lo posa alla
  propria profondità nel punto del muro più vicino; cambiano solo i pezzi a muro
  (banchina lungo il muro, travi/travetti/mensole con lunghezza individuale e taglio di
  testa composto). `wallBuildOptions(template, envelope)` dà le opzioni giuste (vuote
  senza pianta, per le autoportanti o con il muro in squadra): lo usano `fitToEnvelope`
  e il configuratore.

```ts
import {
  DEFAULT_LOVATO_RULES,
  boxOfPlan,
  checkCollisions,
  fitToEnvelope,
  generate,
  getTypology,
  parseEnvelope,
  planDeviations,
  planFromDiagonals,
  wallBuildOptions,
} from "@/domain";

// misure del cliente: fronte e muro 5 m, fianchi 3 m, diagonali diverse
const plan = planFromDiagonals({ front: 5000, back: 5000, left: 3000, right: 3000, d1: 5900, d2: 5760 });
const skewed = parseEnvelope({ box: boxOfPlan(plan, 3500), plan });
const deviation = planDeviations(plan).maxCornerDeg; // ≈ 1,6°

const template = getTypology("addossata-monofalda");
const options = wallBuildOptions(template, skewed);
const onWall = generate(template.slug, { larghezza: 5000 }, options);
const fitted = fitToEnvelope(template, skewed, {}, DEFAULT_LOVATO_RULES); // usa i muri reali da sé

export const fuorisquadra = { deviation, collisions: checkCollisions(onWall, skewed).length, fitted: fitted.ok };
```

## Preventivazione

`pricing/` è il motore di prezzo (puro, deterministico, centesimi interi). Flusso:
assieme + ingombro + opzioni commerciali + listino versionato → `priceAssembly` →
`Quote` (righe spiegabili, totali, avvisi, piano di taglio, fattori di cantiere) →
`officeView` (ufficio) o `customerView` (cliente, proiezione senza dati interni).

```ts
import {
  DEFAULT_PRICE_LIST,
  DEFAULT_PRICE_LIST_VERSION,
  customerView,
  formatEuro,
  generate,
  officeView,
  parseEnvelope,
  priceAssembly,
  quoteToJSON,
} from "@/domain";

const assembly = generate("addossata-monofalda");
const envelope = parseEnvelope({ box: { width: 6000, depth: 3600, height: 3800 } });

const quote = priceAssembly({
  assembly,
  envelope,
  options: { species: "abete", quality: "lamellare", treatment: "impregnante-incolore", covering: "policarbonato-alveolare", cap: "37100", access: "medio" },
  priceList: DEFAULT_PRICE_LIST,
  version: DEFAULT_PRICE_LIST_VERSION,
});

const office = officeView(quote); // righe per categoria, piano di taglio, fattori, regole scattate
const customer = customerView(quote); // 4 voci, IVA, totale, fascia ±%, note

export const preventivo = {
  status: quote.status, // "incompleto" se manca un prezzo o una tariffa (vedi quote.warnings)
  totale: formatEuro(customer.totalCents),
  fascia: [customer.range.minCents, customer.range.maxCents].map(formatEuro),
  regole: office.firedRules.map((r) => r.label),
  json: quoteToJSON(quote), // serializzazione canonica, identica byte per byte
};
```

Ordine fisso delle fasi (`COST_PHASES` in `engine.ts`): legno (piano di taglio:
netto, sfrido, recupero spezzoni; curvi; pannelli) → lavorazioni CNC → ferramenta →
trattamenti → copertura → montaggio → complicazioni → trasporto; poi `computeTotals`:
margini (solo ufficio) → sconti → minimo d'ordine → imponibile → IVA → arrotondamento.

- **Cambiare un prezzo**: è un dato del listino (`pricing/data/default-listino.ts` come
  seed, poi la versione attiva in DB dal back-office); nessun numero è nel codice.
  `parsePriceList` valida il documento citando il percorso del campo errato; le
  tabelle si possono anche esportare/importare in CSV (`exportTable`/`importTable`) e
  confrontare (`diffDocuments`). Una voce assente non è un errore: il preventivo
  riporta la riga a 0 con l'avviso `prezzo-mancante`/`tariffa-mancante` e lo stato
  `incompleto`.
- **Aggiungere una regola di complicazione**: una voce in `complications` del listino,
  `{ id, label, enabled, conditions: [{ factor, op, value }], effect: { kind, value } }`;
  i fattori sono quelli di `siteFactors` (`planDeviationDeg`, `floorRangeMm`,
  `obstaclesCount`, `maxHeightMm`, `access`, …), le condizioni sono in AND, gli effetti
  `ore`, `percento-ore` (sulle ore base), `fisso` (centesimi), `percento-legno`. Le
  regole sono valutate nell'ordine del listino e ognuna scattata è una riga.
- **Aggiungere una fase**: una funzione `Phase = (ctx, state) => state` in
  `pricing/phases/` che aggiunge righe con `append(state, lines, warnings)` (righe
  create con `line({...})`, spiegazione che termina con `ctx.versionLabel`), inserita in
  `COST_PHASES` nella posizione voluta; una nuova categoria va aggiunta a
  `QUOTE_CATEGORIES`, a `CATEGORY_LABELS`, alla voce cliente in
  `CUSTOMER_GROUP_CATEGORIES` e, se ha margine, a `MATERIAL_CATEGORIES` o
  `LABOUR_CATEGORIES`.
