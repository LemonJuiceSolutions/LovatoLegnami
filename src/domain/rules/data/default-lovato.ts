// DA VALIDARE CON UFFICIO TECNICO: tutti i valori di questo file sono stime
// iniziali plausibili per pergole in legno lamellare/massello, non verifiche
// strutturali (NTC/EC5). Modificarli qui non richiede cambiare la logica.
import { type RuleSet, loadRuleSet } from "../types";

/**
 * Tabella luci massime (mm) per tipo di pezzo e sezione `b×h`.
 * Copre tutte le sezioni di `SECTION_CATALOG` per trave, travetto, colmo e puntone.
 * DA VALIDARE CON UFFICIO TECNICO.
 */
export const DEFAULT_SPAN_TABLE = {
  travetto: {
    "60×80": 1500,
    "60×120": 2200,
    "80×160": 3500,
    "100×100": 2200,
    "100×200": 4300,
    "120×120": 2600,
    "120×200": 4500,
    "120×240": 5200,
    "140×140": 3000,
    "160×160": 3500,
    "160×200": 4800,
  },
  trave: {
    "60×80": 1000,
    "60×120": 1500,
    "80×160": 2200,
    "100×100": 1600,
    "100×200": 3200,
    "120×120": 2000,
    "120×200": 3500,
    "120×240": 4500,
    "140×140": 2400,
    "160×160": 2800,
    "160×200": 3800,
  },
  colmo: {
    "60×80": 1000,
    "60×120": 1500,
    "80×160": 2200,
    "100×100": 1600,
    "100×200": 3200,
    "120×120": 2000,
    "120×200": 3500,
    "120×240": 4500,
    "140×140": 2400,
    "160×160": 2800,
    "160×200": 3800,
  },
  puntone: {
    "60×80": 1200,
    "60×120": 1800,
    "80×160": 2800,
    "100×100": 2000,
    "100×200": 3600,
    "120×120": 2500,
    "120×200": 3800,
    "120×240": 4500,
    "140×140": 2900,
    "160×160": 3300,
    "160×200": 4100,
  },
} as const;

/** Dati grezzi del set di regole di default Lovato (validati da `loadRuleSet`). */
export const DEFAULT_LOVATO_DATA = {
  id: "default-lovato",
  name: "Regole costruttive Lovato (valori iniziali, da validare)",
  rules: [
    {
      id: "luce-max-sezione",
      name: "Luce massima per sezione",
      severity: "errore",
      kind: "max-span-by-section",
      description: "Luce effettiva tra gli appoggi non superiore al valore in tabella per la sezione.",
      table: DEFAULT_SPAN_TABLE,
    },
    {
      id: "interasse-travetti-max",
      name: "Interasse massimo travetti",
      severity: "errore",
      kind: "max-joist-spacing",
      max: 800, // DA VALIDARE CON UFFICIO TECNICO
    },
    {
      id: "sbalzo-max",
      name: "Sbalzo massimo",
      severity: "errore",
      kind: "max-overhang",
      max: 800, // DA VALIDARE CON UFFICIO TECNICO
    },
    {
      id: "altezza-libera-min",
      name: "Altezza libera minima",
      severity: "errore",
      kind: "min-clear-height",
      min: 2100, // DA VALIDARE CON UFFICIO TECNICO
    },
    {
      id: "pendenza-intervallo",
      name: "Pendenza ammessa",
      severity: "errore",
      kind: "slope-range",
      min: 5, // DA VALIDARE CON UFFICIO TECNICO
      max: 35,
    },
    {
      id: "sezione-min-pilastri",
      name: "Sezione minima pilastri",
      severity: "errore",
      kind: "min-section",
      pieceType: "pilastro",
      section: "120×120", // DA VALIDARE CON UFFICIO TECNICO
    },
  ],
};

/** Set di regole di default Lovato. DA VALIDARE CON UFFICIO TECNICO. */
export const DEFAULT_LOVATO_RULES: RuleSet = loadRuleSet(DEFAULT_LOVATO_DATA);
