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
export const summary = { valid, violations, collisions, proposals, params, fit: fit.ok ? fit.limits : fit.message, pieces: copy.pieces.length };
```

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

## Modificare le regole costruttive

Le regole sono dati in `rules/data/default-lovato.ts` (marcati **DA VALIDARE CON
UFFICIO TECNICO**): tabella luci per tipo di pezzo e sezione, interasse, sbalzo,
altezza libera, pendenza, sezioni minime. Cambiare un valore non richiede toccare il
motore. Per un set diverso basta passare a `evaluateRules` un altro `RuleSet`
caricato con `loadRuleSet(json)`, che rifiuta tipi di vincolo sconosciuti citando l'id
della regola. Le regole valutano le **misure effettive** dell'assieme
(`measureAssembly`), non i parametri, quindi valgono per ogni tipologia.
