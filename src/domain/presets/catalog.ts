import type { ParamValue } from "../components/types";
import { parseEnvelope } from "../envelope/types";
import { getTypology } from "../typologies/registry";
import { resolveParams } from "../typologies/template";
import { type LoadedPreset, type Preset, PresetNotFoundError } from "./types";

export { PresetNotFoundError } from "./types";

/**
 * Catalogo dei preset commerciali (E10) dalle distinte di
 * `openspec/changes/tipologie-estese/ricerca-chepergola.md` §1. Ogni preset è
 * verificato da `catalog.test.ts`: generazione senza errori, conteggi
 * `expected` (pezzi per tipo, ferramenta per codice) e assenza di collisioni
 * con l'ingombro dichiarato. Gli scostamenti dal sito sono nelle `notes`;
 * le deduzioni (dati non dichiarati dal sito) iniziano con `[dedotto]`.
 */

const SRC = "ricerca-chepergola.md";

type Params = Readonly<Record<string, ParamValue>>;

/* ------------------------------------------------------------------ */
/* Parametri comuni                                                    */
/* ------------------------------------------------------------------ */

/**
 * Pergole standard (T-A/T-B): sezioni di default (pilastri 90×90, tavole
 * 45×120, travetti 45×90), bullonata. `altezza` 2280 = intradosso tale che i
 * pilastri risultino da 2400 come nella distinta, con estradosso a ~2,50 m.
 */
const STANDARD: Params = { altezza: 2280, costruzione: "bullonata" };
const STANDARD_NOTE = "altezza 2280 (intradosso): pilastri da 2400 come nella distinta, estradosso dei travetti a 2490 ≈ h 2,50 del sito.";

/**
 * MAXI (T-C): pilastri lamellari 120×120 da 2500 (`altezza` 2355), tavole
 * 45×145, `sbalzo` 105 = metà della sandwich 45+120+45 (le tavole restano
 * nella pianta nominale).
 */
const MAXI: Params = {
  altezza: 2355,
  costruzione: "bullonata",
  sbalzo: 105,
  sezionePilastro: "120×120",
  sezioneTavola: "45×145",
};
const MAXI_NOTE = "altezza 2355 (intradosso): pilastri lamellari da 2500 come nella distinta; sbalzo 105 = metà della sandwich da 210 mm.";

const SCREW_RULE_NOTE =
  "Viti dei travetti scelte dalla regola del template (la più corta ≥ h travetto + 70, una per tavola toccata): il codice può differire da quello del sito, il numero coincide.";

/* ------------------------------------------------------------------ */
/* Catalogo                                                            */
/* ------------------------------------------------------------------ */

export const PRESET_CATALOG: readonly Preset[] = [
  // T-A Pergole standard libere ------------------------------------------------
  {
    id: "libera-3x3",
    name: "Pergola libera 3×3",
    typologySlug: "portale-sandwich",
    params: { ...STANDARD, larghezza: 3000, profondita: 3000, campate: 1, interasse: 700 },
    source: `${SRC} §1 T-A (pergola-libera-3x3, distinta non rilevata)`,
    notes: [
      STANDARD_NOTE,
      "[dedotto] Distinta non pubblicata nella ricerca: 2 portali da 2 pilastri, tavole da 3000, travetti da 3000 a interasse ≤ 700 (5), 2 bulloni per pilastro, una vite 6×160 per tavola toccata.",
    ],
    expected: {
      pieces: { pilastro: 4, tavola: 4, travetto: 5 },
      hardware: { "bullone-m12x200": 8, "vite-6x160": 20 },
    },
  },
  {
    id: "libera-4x2",
    name: "Pergola libera 4×2",
    typologySlug: "portale-sandwich",
    params: { ...STANDARD, larghezza: 4000, profondita: 2000, campate: 1, interasse: 700 },
    source: `${SRC} §1 T-A (pergola-libera-4x2)`,
    notes: [STANDARD_NOTE, "Distinta del sito: 4 pilastri 90×90×2400, 4 tavole 45×120×4000, 6 travetti 45×90×2000, 8 bulloni 12×200, 24 viti 6×160."],
    expected: {
      pieces: { pilastro: 4, tavola: 4, travetto: 6 },
      hardware: { "bullone-m12x200": 8, "vite-6x160": 24 },
    },
  },
  {
    id: "libera-4x3",
    name: "Pergola libera 4×3",
    typologySlug: "portale-sandwich",
    params: { ...STANDARD, larghezza: 4000, profondita: 3000, campate: 1, interasse: 700 },
    source: `${SRC} §1 T-A (pergola-libera-4x3, distinta non rilevata)`,
    notes: [
      STANDARD_NOTE,
      "[dedotto] Distinta non pubblicata nella ricerca: come la 4×2 con travetti da 3000 (luce massima dei travetti 45×90), 6 travetti a interasse ≤ 700.",
    ],
    expected: {
      pieces: { pilastro: 4, tavola: 4, travetto: 6 },
      hardware: { "bullone-m12x200": 8, "vite-6x160": 24 },
    },
  },
  {
    id: "libera-4x4",
    name: "Pergola libera 4×4",
    typologySlug: "portale-sandwich",
    params: { ...STANDARD, larghezza: 4000, profondita: 4000, campate: 2, interasse: 700 },
    source: `${SRC} §1 T-A (pergola-libera-4x4, distinta non rilevata)`,
    notes: [
      STANDARD_NOTE,
      "[dedotto] Distinta non pubblicata nella ricerca: con travetti 45×90 (luce massima ~3 m, §1 T-A \"campate di circa 3 m al massimo\") servono 2 campate, quindi 3 portali (6 pilastri) e 12 travetti da 2000.",
    ],
    expected: {
      pieces: { pilastro: 6, tavola: 6, travetto: 12 },
      hardware: { "bullone-m12x200": 12, "vite-6x160": 36 },
    },
  },
  {
    id: "libera-4x6",
    name: "Pergola libera 4×6",
    typologySlug: "portale-sandwich",
    params: { ...STANDARD, larghezza: 4000, profondita: 6000, campate: 2, interasse: 700 },
    envelope: {
      box: { width: 4000, depth: 6000, height: 3000 },
      obstacles: [
        // grondaia della casa sul lato posteriore, sopra l'estradosso della pergola
        { id: "OST-01", type: "grondaia", label: "Grondaia di casa", side: "posteriore", elevation: 2800, height: 150, projection: 150 },
      ],
    },
    source: `${SRC} §1 T-A (pergola-libera-4x6)`,
    notes: [
      STANDARD_NOTE,
      "Distinta del sito: 6 pilastri 90×90×2400, 6 tavole 45×120×4000, 12 travetti 45×90×3000, 12 bulloni 12×200, 36 viti 6×160.",
      "[dedotto] 3 portali, 2 campate, 6 travetti per campata (interasse 700).",
      "Ingombro d'esempio: giardino 4×6 m con la grondaia di casa a 2,80 m sul lato posteriore.",
    ],
    expected: {
      pieces: { pilastro: 6, tavola: 6, travetto: 12 },
      hardware: { "bullone-m12x200": 12, "vite-6x160": 36 },
    },
  },

  // T-B Pergole standard addossate ---------------------------------------------
  {
    id: "addossata-2x3",
    name: "Pergola addossata 2×3",
    typologySlug: "addossata-sandwich",
    params: { ...STANDARD, larghezza: 3000, profondita: 2000, campate: 1, attaccoMuro: "listoni-paralleli" },
    source: `${SRC} §1 T-B (pergola-addossata-in-legno-2x3)`,
    notes: [
      "altezza 2280 come le standard libere (pilastri ~2400).",
      "Distinta del sito: 2 pilastri, 4 tavole 45×120×2000, 4 travetti 45×90×3000, 2 staffe a muro, 6 bulloni 12×200 (o 8), 16 viti 6×160, 4 tasselli (o 12): il preset usa la variante base.",
    ],
    expected: {
      pieces: { pilastro: 2, tavola: 4, travetto: 4 },
      hardware: { "bullone-m12x200": 6, "staffa-muro-listoni-paralleli-90": 2, "vite-6x160": 16, "tassello-10x85": 4 },
    },
  },
  {
    id: "addossata-3x4",
    name: "Pergola addossata 3×4",
    typologySlug: "addossata-sandwich",
    params: { ...STANDARD, larghezza: 4000, profondita: 3000, campate: 2, interasse: 750, attaccoMuro: "listoni-paralleli" },
    source: `${SRC} §1 T-B (pergola-addossata-in-legno-3x4, distinta non rilevata)`,
    notes: [
      "altezza 2280 come le standard libere (pilastri ~2400).",
      "[dedotto] Distinta non pubblicata nella ricerca: tavole da 3000 (profondità), 4 m lungo il muro in 2 campate (travetti 45×90 da 2000, luce massima ~3 m), quindi 3 telai e 5 travetti per campata a interasse 750.",
    ],
    expected: {
      pieces: { pilastro: 3, tavola: 6, travetto: 10 },
      hardware: { "bullone-m12x200": 9, "staffa-muro-listoni-paralleli-90": 3, "vite-6x160": 30, "tassello-10x85": 6 },
    },
  },
  {
    id: "addossata-4x6",
    name: "Pergola addossata 4×6",
    typologySlug: "addossata-sandwich",
    params: { ...STANDARD, larghezza: 6000, profondita: 4000, campate: 2, interasse: 750, attaccoMuro: "listoni-paralleli" },
    source: `${SRC} §1 T-B (pergola-addossata-in-legno-4x6)`,
    notes: [
      "altezza 2280 come le standard libere (pilastri ~2400).",
      "Distinta del sito: 3 pilastri, 6 tavole 45×120×4000, 12 travetti 45×90×3000, 3 staffe a muro, 9 bulloni 12×200 (o 12), 36 viti 6×160, 6 tasselli (o 18): il preset usa la variante base.",
      "Interasse 750: con 600 i travetti sarebbero 8 per campata invece dei 6 della distinta.",
    ],
    expected: {
      pieces: { pilastro: 3, tavola: 6, travetto: 12 },
      hardware: { "bullone-m12x200": 9, "staffa-muro-listoni-paralleli-90": 3, "vite-6x160": 36, "tassello-10x85": 6 },
    },
  },

  // T-C MAXI ------------------------------------------------------------------
  {
    id: "maxi-4x4",
    name: "MAXI 4×4",
    typologySlug: "portale-sandwich",
    params: { ...MAXI, larghezza: 4000, profondita: 4000, campate: 1, interasse: 600, sezioneTravetto: "45×120" },
    source: `${SRC} §1 T-C (pergola-maxi-4x4)`,
    notes: [
      MAXI_NOTE,
      "Distinta del sito: 4 pilastri, 4 tavole 45×145×4000, 7 travetti 45×120×4000 (senza portale intermedio), 8 bulloni 12×240, 28 viti 6×200.",
      "Il sito dichiara h 2,50; con pilastri da 2500 e travetti sopra l'estradosso è 2,62 m.",
    ],
    expected: {
      pieces: { pilastro: 4, tavola: 4, travetto: 7 },
      hardware: { "bullone-m12x240": 8, "vite-6x200": 28 },
    },
  },
  {
    id: "maxi-5x5",
    name: "MAXI 5×5",
    typologySlug: "portale-sandwich",
    params: { ...MAXI, larghezza: 5000, profondita: 5000, campate: 1, interasse: 650, sezioneTravetto: "45×145" },
    source: `${SRC} §1 T-C (pergola-maxi-5x5)`,
    notes: [
      MAXI_NOTE,
      "Distinta del sito: 4 pilastri, 4 tavole 45×145×5000, 8 travetti 45×145×5000, 4 bicchieri 120, 32 viti 8×240 (h 2,65 = 2500 + 145).",
      "Interasse 650: con 600 i travetti sarebbero 9 invece degli 8 della distinta.",
      "[dedotto] I bulloni non sono nella distinta rilevata: 8 bulloni 12×240 (2 per pilastro, come le altre MAXI).",
      "Griglie e montanti secondari (esclusi nel kit) non modellati.",
    ],
    expected: {
      pieces: { pilastro: 4, tavola: 4, travetto: 8 },
      hardware: { "bullone-m12x240": 8, "vite-8x240": 32, "staffa-terra-bicchiere-120": 4 },
    },
  },
  {
    id: "maxi-5x6",
    name: "MAXI 5×6",
    typologySlug: "portale-sandwich",
    params: { ...MAXI, larghezza: 5000, profondita: 6000, campate: 2, interasse: 650, sezioneTravetto: "45×120", controventi: true },
    source: `${SRC} §1 T-C (pergola-maxi-5x6)`,
    notes: [
      MAXI_NOTE,
      "Distinta del sito: 6 pilastri, 6 tavole 45×145×5000, 16 travetti 45×120×3000, 6 controventature, 6 staffe a bicchiere, 12 bulloni 12×240, 48 viti 8×200, 6 TTDQ 12×240 + 12 viti 6×220.",
      "[dedotto] I 6 \"TTDQ 12×240\" sono i bulloni delle saette: 12 + 6 = 18 bulloni 12×240.",
      `Viti: 48 viti 6×200 sui travetti (il sito 8×200) e 12 viti 6×160 al piede delle saette (il sito 6×220). ${SCREW_RULE_NOTE}`,
      "Interasse 650: 8 travetti per campata come la distinta.",
    ],
    expected: {
      pieces: { pilastro: 6, tavola: 6, travetto: 16, controvento: 6 },
      hardware: { "bullone-m12x240": 18, "vite-6x200": 48, "vite-6x160": 12, "staffa-terra-bicchiere-120": 6 },
    },
  },
  {
    id: "maxi-addossata-4x4",
    name: "MAXI addossata 4×4",
    typologySlug: "addossata-sandwich",
    params: {
      altezza: 2355,
      costruzione: "bullonata",
      larghezza: 4000,
      profondita: 4000,
      campate: 1,
      interasse: 750,
      attaccoMuro: "listoni-paralleli",
      sezionePilastro: "120×120",
      sezioneTavola: "45×145",
      sezioneTravetto: "45×120",
    },
    source: `${SRC} §1 T-C (pergola-addossata-maxi-4x4)`,
    notes: [
      "altezza 2355: pilastri lamellari ~2500.",
      "Distinta del sito: 2 pilastri, 4 tavole 45×145×4000, 6 travetti 45×120×4000, 2 staffe a muro listoni paralleli 120.",
      "[dedotto] Bulloni, viti e tasselli non sono nella distinta rilevata: 6 bulloni 12×240 (2 per pilastro + 1 per staffa), 24 viti 6×200, 4 tasselli.",
      "Interasse 750: 6 travetti come la distinta.",
    ],
    expected: {
      pieces: { pilastro: 2, tavola: 4, travetto: 6 },
      hardware: { "staffa-muro-listoni-paralleli-120": 2, "bullone-m12x240": 6, "vite-6x200": 24, "tassello-10x85": 4 },
    },
  },

  // T-D Moderne (JOINT) -------------------------------------------------------
  {
    id: "moderna-258x258",
    name: "Moderna 258×258",
    typologySlug: "telaio-giunti",
    params: { larghezza: 2580, profondita: 2580, campate: 1, campateProfondita: 1, sezioneAsta: "90×90", forma: "piana", fissaggio: "libera" },
    envelope: { box: { width: 2800, depth: 2800, height: 2700 } },
    source: `${SRC} §1 T-D (pergola-moderna-258x258)`,
    notes: [
      "Distinta del sito: 10 morali 90×90×2400, 4 giunti 3 vie angolari, 4 giunti 3 vie lineari, 4 staffe a terra JOINT, 160 viti 6×40.",
      "[dedotto] I 4 giunti lineari sono i nodi di 2 traversi intermedi (interasse ≤ 1100); 258 = interasse dei nodi.",
    ],
    expected: {
      pieces: { pilastro: 4, trave: 6 },
      hardware: { "giunto-joint-3a-vie-90-90": 4, "giunto-joint-3l-vie-90-90": 4, "staffa-terra-joint-90": 4, "vite-6x40": 160 },
    },
  },
  {
    id: "moderna-427x318",
    name: "Moderna 427×318",
    typologySlug: "telaio-giunti",
    params: { larghezza: 4270, profondita: 3180, campate: 2, campateProfondita: 1, sezioneAsta: "90×90", forma: "piana", fissaggio: "libera" },
    source: `${SRC} §1 T-D (pergola-moderna-427x318)`,
    notes: [
      "Distinta del sito: 6 × 90×90×2400, 4 × 90×90×2000, 5 × 90×90×3000; 4 giunti 3 vie angolari, 2 giunti 4 vie, 4 giunti 3 vie lineari; 6 staffe a terra; 220 viti.",
      "[dedotto] Griglia 3×2 di pilastri, un traverso per campata: le 4 aste \"da 2000\" risultano 1955 netti (lunghezza commerciale da tagliare).",
    ],
    expected: {
      pieces: { pilastro: 6, trave: 9 },
      hardware: {
        "giunto-joint-3a-vie-90-90": 4,
        "giunto-joint-4-vie-90-90": 2,
        "giunto-joint-3l-vie-90-90": 4,
        "staffa-terra-joint-90": 6,
        "vite-6x40": 220,
      },
    },
  },

  // T-E Carport ad arco -------------------------------------------------------
  {
    id: "carport-5x3",
    name: "Carport 5×3",
    typologySlug: "carport-arco",
    params: { larghezza: 3000, profondita: 5000, campate: 1, sezionePilastro: "90×90", sezioneTravetto: "45×90", controventi: false },
    source: `${SRC} §1 T-E (carport-m5x3xh270)`,
    notes: [
      "Distinta del sito: 4 pilastri 90×90×2400, 2 archi 90×90, 4 tavole 45×145×5000, 8 travetti 45×90×3000, 6 staffe a P greco, 2 kit di controventi opzionali (non inclusi nel preset).",
      "I pilastri risultano 2610 (a filo dell'estradosso delle tavole), non 2400: con pilastri da 2400 l'arco da 3900 non arriverebbe tangente alla sandwich (vedi design, nota 5.2).",
      "Bulloni dell'arco M8×200 invece degli 8×120 del sito, che non serrano tavola + arco + tavola (180 mm).",
    ],
    expected: {
      pieces: { pilastro: 4, arco: 2, tavola: 4, travetto: 8 },
      hardware: { "staffa-terra-p-greco": 6, "bullone-m12x200": 8, "bullone-m8x200": 4 },
    },
  },
  {
    id: "carport-5x4",
    name: "Carport 5×4",
    typologySlug: "carport-arco",
    params: { larghezza: 4000, profondita: 5000, campate: 1, sezionePilastro: "90×90", sezioneTravetto: "45×120", controventi: false },
    source: `${SRC} §1 T-E (carport-m5x4xh270)`,
    notes: [
      "Distinta del sito: 4 pilastri, 2 archi 90×90, 4 tavole 45×145×5000, 8 travetti 45×120×4000, 6 staffe a P greco, kit controventi STANDARD 3× (non incluso nel preset).",
      "Pilastri 2610 e bulloni M8×200 come nel carport 5×3.",
    ],
    expected: {
      pieces: { pilastro: 4, arco: 2, tavola: 4, travetto: 8 },
      hardware: { "staffa-terra-p-greco": 6, "bullone-m12x200": 8, "bullone-m8x200": 4 },
    },
  },
  {
    id: "carport-doppio-5x6",
    name: "Carport doppio 5×6",
    typologySlug: "carport-arco",
    params: { larghezza: 6000, profondita: 5000, campate: 2, sezionePilastro: "90×90", sezioneTravetto: "45×90", controventi: true },
    source: `${SRC} §1 T-E (carport-per-due-auto-m5x6xh270)`,
    notes: [
      "Distinta del sito: 6 pilastri 90×90, 3 archi, 6 tavole 45×145×5000, 16 travetti 45×90×3000, 9 staffe a P greco, 6 controventi 90×90×750.",
      "[dedotto] I 6 controventi stanno tra i due pilastri di ogni portale (davanti c'è l'arco), con un bullone 12×200 ciascuno: 12 + 6 = 18 bulloni.",
      "Pilastri 2610 e bulloni M8×200 come nel carport 5×3.",
    ],
    expected: {
      pieces: { pilastro: 6, arco: 3, tavola: 6, travetto: 16, controvento: 6 },
      hardware: { "staffa-terra-p-greco": 9, "bullone-m12x200": 18, "bullone-m8x200": 6 },
    },
  },
  {
    id: "carport-doppio-maxi-5x6",
    name: "Carport doppio MAXI 5×6",
    typologySlug: "carport-arco",
    params: {
      larghezza: 6000,
      profondita: 5000,
      campate: 2,
      sbalzoFrontale: 2550,
      sezionePilastro: "120×120",
      sezioneTravetto: "45×120",
      sezioneControvento: "120×120",
      controventi: true,
    },
    source: `${SRC} §1 T-E (carport-maxi-per-due-auto-m6x5xh270)`,
    notes: [
      "Distinta del sito: 6 pilastri lamellari 120×120×2500, 3 archi 120×120, 6 tavole 45×145×5000, 16 travetti 45×120×3000, 9 staffe a P greco 120, 6 controventi 120×120×750.",
      "sbalzoFrontale 2550 invece di 2500: con l'arco 120×120 di raggio 2400 lo sbalzo minimo che lascia 5 mm dal pilastro è 2525.",
      "Bulloni dell'arco M8×240 invece degli 8×140 del sito (tavola + arco + tavola = 210 mm); pilastri a filo dell'estradosso delle tavole come nel carport 5×3.",
    ],
    expected: {
      pieces: { pilastro: 6, arco: 3, tavola: 6, travetto: 16, controvento: 6 },
      hardware: { "staffa-terra-p-greco-120": 9, "bullone-m12x240": 18, "bullone-m8x240": 6 },
    },
  },

  // T-G Camper ----------------------------------------------------------------
  {
    id: "pergola-camper-3x6",
    name: "Pergola camper 3×6",
    typologySlug: "portale-sandwich",
    params: { ...MAXI, altezza: 3355, larghezza: 3000, profondita: 6000, campate: 2, interasse: 600, sezioneTravetto: "45×90" },
    envelope: { box: { width: 3000, depth: 6000, height: 4000 } },
    source: `${SRC} §1 T-G (pergola-camper-3x6-h3-5)`,
    notes: [
      "altezza 3355 (intradosso): pilastri lamellari 120×120 da 3500 come nella distinta.",
      "Distinta del sito: 6 pilastri 120×120×3500, 6 tavole 45×145×3000, 10 travetti 45×90×3000, 12 bulloni 12×240, 30 viti 6×200.",
      `[dedotto] 3 portali larghi 3 m, 2 campate da 3 m, 5 travetti per campata. Viti: 30 viti 6×160 (il sito 6×200). ${SCREW_RULE_NOTE}`,
    ],
    expected: {
      pieces: { pilastro: 6, tavola: 6, travetto: 10 },
      hardware: { "bullone-m12x240": 12, "vite-6x160": 30 },
    },
  },
  {
    id: "copertura-camper-404x799",
    name: "Copertura camper 404×799",
    typologySlug: "monofalda-scalare",
    params: { larghezza: 4040, profondita: 7990, file: 4, pilastriPerFila: 2, giunzione: "dritta", costruzione: "bullonata" },
    source: `${SRC} §1 T-G (copertura-camper)`,
    notes: [
      "Distinta del sito: 8 pilastri 120×120 in coppie 3685/3570/3455/3340, M05 4 × 3090 + M06 2 × 2030 (correnti), M07 10 × 4000 (traversi), M08 24 × 800, M09/M10 fasce 300×38, 16 lastre.",
      "Pilastri del modello 3694/3577/3461/3345 (salto 116 a pendenza 2,7°, il sito 115).",
      "[dedotto] Correnti in 3 tronchi per linea su 2 linee = 6 (M05 + M06); 4 file di traversi sandwich = 8 tavole (il sito ne elenca 10 da 4000: le 2 in più non sono state attribuite); 8 saette da 800 (le 24 M08 del sito non sono state attribuite: tacchi o saette in entrambe le direzioni); 1 fascia frontale (M09/M10 non attribuiti tutti).",
    ],
    expected: {
      pieces: { pilastro: 8, tavola: 8, trave: 6, controvento: 8, fascia: 1 },
      hardware: { "bullone-m12x240": 24, "staffa-terra-bicchiere-120": 8 },
    },
  },

  // T-H Gazebo ----------------------------------------------------------------
  {
    id: "gazebo-3x3-4-falde",
    name: "Gazebo 3,1×3,1 a 4 falde 25°",
    typologySlug: "gazebo-padiglione",
    params: { lati: "4", larghezza: 3100, profondita: 3100, falde: "lati", punta: "cuspide", costruzione: "bullonata" },
    envelope: { box: { width: 3300, depth: 3300, height: 3400 } },
    source: `${SRC} §1 T-H (kit-gazebo-31x31-con-telo, colmo-gazebo-a-4-falde)`,
    notes: [
      "Distinta del sito: 4 pilastri 90×90×2400, 4 traverse 90×90×2900, 4 puntoni 70×70×2000, 4 giunti 916, 4 piastre 915, 4 piastre 914, 1 cuspide 922.",
      "Misure d'interasse 3100: traverse nette 3010 (il sito 2900 commerciale) e cantonali 1992 (il sito 2000); pendenza imposta dalla cuspide 25°.",
      "Telo non modellato.",
    ],
    expected: {
      pieces: { pilastro: 4, trave: 4, cantonale: 4 },
      hardware: { "giunto-gazebo-916": 4, "piastra-915": 4, "piastra-914": 4, "cuspide-4-25": 1 },
    },
  },
  {
    id: "gazebo-3x3-8-falde",
    name: "Gazebo 3,1×3,1 a 8 falde 15°",
    typologySlug: "gazebo-padiglione",
    params: { lati: "4", larghezza: 3100, profondita: 3100, falde: "doppie", punta: "cuspide", costruzione: "bullonata" },
    source: `${SRC} §1 T-H (colmo-gazebo-a-8-falde)`,
    notes: [
      "Colmo a 8 falde 15° del sito su base quadrata: 4 cantonali + 4 puntoni intermedi a metà lato.",
      "[dedotto] Distinta non pubblicata: come il kit 3,1×3,1 con 4 puntoni intermedi, una piastra 915 al piede e una 914 in testa per ogni asta (8 + 8).",
    ],
    expected: {
      pieces: { pilastro: 4, trave: 4, cantonale: 4, puntone: 4 },
      hardware: { "giunto-gazebo-916": 4, "piastra-915": 8, "piastra-914": 8, "cuspide-8-15": 1 },
    },
  },
  {
    id: "gazebo-ottagonale-4000",
    name: "Gazebo ottagonale Ø4000",
    typologySlug: "gazebo-padiglione",
    params: { lati: "8", larghezza: 4000, costruzione: "carpenteria", punta: "monaco", pendenza: 25, sezioneCantonaleCarpenteria: "90×90" },
    source: `${SRC} §3 TPL-5 ed estensioni (gazebo ottagonale vero, non offerto dal sito)`,
    notes: [
      "[dedotto] Il sito non vende gazebo ottagonali in kit: pianta regolare di diametro 4000 sugli assi dei pilastri, in carpenteria tradizionale con monaco centrale.",
      "Cantonali in carpenteria 90×90 (il 70×70 della ferramenta GAZEBO supera la luce tabellata), 2 viti 8×240 per battuta [dedotto].",
    ],
    expected: {
      pieces: { pilastro: 8, trave: 8, cantonale: 8, monaco: 1 },
      hardware: { "vite-8x240": 32 },
    },
  },

  // T-J Pensilina -------------------------------------------------------------
  {
    id: "pensilina-4000-1200",
    name: "Pensilina 4000 sbalzo 1200",
    typologySlug: "pensilina-sbalzo",
    params: { larghezza: 4000, sbalzo: 1200, numeroMensole: 3, attacco: "scomparsa-17", saette: false },
    source: `${SRC} §1 T-J (supporto-a-scomparsa) e §3 TPL-6`,
    notes: [
      "[dedotto] Nessun kit completo sul sito: 3 mensole 90×140 su supporto a scomparsa 17° (lama 105×250 in fresata), travetti 45×90 paralleli al muro e fascia frontale 38×300.",
    ],
    expected: {
      pieces: { mensola: 3, travetto: 3, fascia: 1 },
      hardware: { "supporto-scomparsa-17": 3 },
    },
  },

  // §3 estensioni: a L --------------------------------------------------------
  {
    id: "pergola-a-l-4000",
    name: "Pergola a L 4000/4000",
    typologySlug: "a-elle",
    params: { larghezzaA: 4000, larghezzaB: 4000, profondita: 3150, costruzione: "carpenteria" },
    source: `${SRC} §3 estensioni (tipologia a L, non offerta dal sito)`,
    notes: [
      "[dedotto] Il sito non vende strutture a L: due ali da 4000 sui due muri con un solo pilastro d'angolo e compluvio.",
      "Profondità 3150 invece di 3000: con 3000 lo sbalzo delle travi di gronda oltre il pilastro (940 mm) supera lo sbalzo massimo di 800 del set Lovato; con 3150 è 790. Profondità maggiori superano la luce delle travi 120×160 (3200) o del compluvio (4500).",
    ],
    expected: {
      pieces: { pilastro: 1, trave: 2, banchina: 2, cantonale: 1, travetto: 14 },
      hardware: { "scarpa-ancoraggio-120x160": 2, "staffa-terra-bicchiere-120": 1 },
    },
  },

  // Tipologie MVP ---------------------------------------------------------------
  {
    id: "monofalda-grondaia",
    name: "Monofalda con grondaia",
    typologySlug: "addossata-monofalda",
    params: { larghezza: 5000, profondita: 3000, altezza: 2400, pendenza: 10 },
    envelope: {
      box: { width: 5000, depth: 3600, height: 3600 },
      wallSide: "posteriore",
      obstacles: [
        { id: "OST-01", type: "grondaia", label: "Grondaia di casa", side: "posteriore", elevation: 3350, height: 150, projection: 150 },
      ],
      floor: { corners: { frontLeft: -80, frontRight: -80, backLeft: 0, backRight: 0 } },
    },
    source: `${SRC} §1 T-B (variante tradizionale su banchina, tipologia MVP)`,
    notes: ["Esempio MVP \"Monofalda con grondaia\": addossata 5×3 in carpenteria su banchina, pendenza 10°, sotto la grondaia di casa, pavimento in pendenza di 8 cm."],
  },
  {
    id: "bifalda-libera",
    name: "Bifalda libera",
    typologySlug: "autoportante-bifalda",
    params: {},
    envelope: { box: { width: 5000, depth: 5100, height: 3600 } },
    source: `${SRC} §3 estensioni (autoportante bifalda, non offerta dal sito; tipologia MVP)`,
    notes: ["Esempio MVP \"Bifalda libera\": autoportante bifalda 5×4 con i parametri di default."],
  },
];

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

/** Preset del catalogo, filtrati per tipologia se `slug` è indicato (ordine di catalogo). */
export function listPresets(slug?: string): Preset[] {
  return PRESET_CATALOG.filter((p) => slug === undefined || p.typologySlug === slug);
}

/** Preset per id; `PresetNotFoundError` se assente. */
export function getPreset(id: string): Preset {
  const preset = PRESET_CATALOG.find((p) => p.id === id);
  if (!preset) throw new PresetNotFoundError(id);
  return preset;
}

/**
 * Configurazione pronta per la generazione: parametri risolti contro il
 * template (default per quelli omessi, `ParamError` se fuori limite) e
 * ingombro validato con `parseEnvelope`.
 */
export function loadPreset(id: string): LoadedPreset {
  const preset = getPreset(id);
  const params = resolveParams(getTypology(preset.typologySlug), preset.params);
  return {
    preset,
    typologySlug: preset.typologySlug,
    params,
    ...(preset.envelope ? { envelope: parseEnvelope(preset.envelope) } : {}),
  };
}
