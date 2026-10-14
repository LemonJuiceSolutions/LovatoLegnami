// DA VALIDARE CON UFFICIO TECNICO: tutti i valori di questo file sono stime
// iniziali plausibili per pergole in legno lamellare/massello, non verifiche
// strutturali (NTC/EC5). Modificarli qui non richiede cambiare la logica.
import { type RuleSet, loadRuleSet } from "../types";

/**
 * Tabella luci massime (mm) per tipo di pezzo e sezione `b×h`.
 * Copre tutte le sezioni di `SECTION_CATALOG` per trave, travetto, colmo e puntone; tavola,
 * cantonale, mensola e fascia (tipologie-estese) coprono le sezioni d'uso di quei pezzi.
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
    "45×90": 3000,
    "45×120": 4000,
    "45×145": 5000,
    "70×70": 1800,
    "90×90": 2500,
    "38×300": 3500,
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
    "45×90": 1500,
    "45×120": 2200,
    "45×145": 3000,
    "70×70": 2000,
    "90×90": 3200,
    "38×300": 3000,
    // trave di gronda della tipologia a L (appoggio a muro con scarpa 120×160)
    "120×160": 3200,
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
    "45×90": 1500,
    "45×120": 2200,
    "45×145": 3000,
    "70×70": 2000,
    "90×90": 3200,
    "38×300": 3000,
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
    "45×90": 1800,
    "45×120": 2600,
    "45×145": 3300,
    "70×70": 2200,
    "90×90": 2800,
    "38×300": 3200,
  },
  // tipologie-estese (E8). Tavola: luce della trave sandwich, valore per la COPPIA di tavole ai lati
  // dei pilastri (la regola misura ogni tavola, con gli appoggi nel bullone); valori dalle distinte
  // T-A/T-B/T-C/T-E della ricerca (45×120 su ~3,4 m nelle libere e ~3,7 m dal pilastro alla staffa a
  // muro nelle addossate da 4 m, 45×145 su ~4,4 m). DA VALIDARE CON UFFICIO TECNICO.
  tavola: {
    "45×90": 2500,
    "45×120": 3800,
    "45×145": 4500,
  },
  // cantonali di padiglione/compluvio (gazebo T-H: 70×70 da ~2 m) e sezioni di carpenteria
  cantonale: {
    "70×70": 2200,
    "90×90": 2800,
    "45×120": 2600,
    "45×145": 3300,
    "100×100": 2900,
    "120×120": 3300,
    "120×200": 4200,
    "120×240": 4800,
    "140×140": 3700,
    // compluvio della tipologia a L (stessa altezza dei travetti 80×160)
    "120×160": 4500,
  },
  // mensole a sbalzo senza appoggi: la "luce" misurata è la lunghezza, quindi il valore è lo sbalzo massimo
  mensola: {
    "90×140": 1500,
    "90×90": 1000,
    "100×200": 2000,
    "120×200": 2200,
    "120×240": 2500,
    "140×140": 1600,
    "160×200": 2300,
    "100×140": 1600,
    "120×160": 1900,
  },
  // fasce di gronda/frontali fissate alle teste di travetti o correnti (portano solo sé stesse e la gronda)
  fascia: {
    "38×300": 4000,
    "45×145": 900,
    "45×120": 800,
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
      allowFlat: true, // coperture piane (portali sandwich, telai a giunti) ammesse. DA VALIDARE CON UFFICIO TECNICO
    },
    {
      id: "sezione-min-pilastri",
      name: "Sezione minima pilastri",
      // avviso: il riferimento commerciale usa pilastri 90×90 e 70×70 (E8). DA VALIDARE CON UFFICIO TECNICO
      severity: "avviso",
      kind: "min-section",
      pieceType: "pilastro",
      section: "120×120", // DA VALIDARE CON UFFICIO TECNICO
    },
  ],
};

/** Set di regole di default Lovato. DA VALIDARE CON UFFICIO TECNICO. */
export const DEFAULT_LOVATO_RULES: RuleSet = loadRuleSet(DEFAULT_LOVATO_DATA);
