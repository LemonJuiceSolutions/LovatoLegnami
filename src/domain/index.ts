/**
 * API pubblica del dominio (TypeScript puro, nessuna dipendenza da React,
 * Three o dal kernel geometrico). Store, UI ed export importano da qui:
 * `import { generate, evaluateRules, … } from "@/domain"`. Vedi README.md.
 */

// Componenti: tipi, catalogo sezioni, lavorazioni, giunti, serializzazione (toJSON/fromJSON)
export * from "./components";
// Assieme: id, bounding box, misure effettive
export * from "./assembly";
// Tipologie: template, interprete, registro (generate, listTypologies, …)
export * from "./typologies";
// Regole costruttive: caricamento, valutazione, auto-dimensionamento, set di default
export * from "./rules";
// Ingombro cliente: ostacoli, pavimento, collisioni, adattamento
export * from "./envelope";
// Ferramenta: catalogo, bulloni passanti, staffe, giunti a N vie, elenco ferramenta
export * from "./hardware";
// Preset commerciali: catalogo dal riferimento, listPresets, loadPreset
export * from "./presets";
// Preventivazione: listino, taglio, fattori di cantiere, motore priceAssembly, viste, CSV
export * from "./pricing";
// Matematica di base (vettori, matrici di posa, box)
export * from "./math";
