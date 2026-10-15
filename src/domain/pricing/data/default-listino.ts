import { SECTION_CATALOG, sectionLabel } from "../../components/sections";
import type { Section } from "../../components/types";
import { parsePriceList, type PriceList, type PriceListInput, type PriceListVersion } from "../types";

/**
 * Listino seed v1 (validità 2026-01-01).
 *
 * DA VALIDARE CON UFFICIO TECNICO/COMMERCIALE: tutti i valori sono segnaposto plausibili
 * (ordini di grandezza di mercato 2025–2026), non prezzi Lovato. Il back-office esiste
 * per sostituirli senza rilasci; questo file serve solo come seed del DB e come ripiego.
 *
 * Unità: centesimi interi, mm, minuti, percentuali (15 = 15%). Le voci per sezione sono
 * generate sul `SECTION_CATALOG` così ogni sezione a catalogo ha lunghezze commerciali,
 * sfrido minimo e prezzo dei curvi.
 */

/** Area della sezione in m². */
const areaM2 = (s: Section): number => (s.b * s.h) / 1e6;

/**
 * Sezioni usate dai template o dai preset ma assenti da `SECTION_CATALOG` (che resta il
 * catalogo delle scelte del configuratore): mensole 90×140 della pensilina, travi e
 * cantonale 120×160 della pergola a L, monaco 250×250 del gazebo ottagonale. Emerse dal
 * test dei preset (4.9) — DA VALIDARE con l'ufficio la disponibilità commerciale.
 */
export const EXTRA_PRICED_SECTIONS: readonly Section[] = [
  { b: 90, h: 140 },
  { b: 120, h: 160 },
  { b: 250, h: 250 },
];

/** Sezioni con voci di listino (lunghezze, sfrido minimo, curvi): catalogo + sezioni dei template. */
export const PRICED_SECTIONS: readonly Section[] = [...SECTION_CATALOG, ...EXTRA_PRICED_SECTIONS];

const bySection = <T>(value: (s: Section) => T): Record<string, T> =>
  Object.fromEntries(PRICED_SECTIONS.map((s) => [sectionLabel(s), value(s)]));

/** Riferimento per il prezzo dei curvi: abete lamellare al m³ (DA VALIDARE). */
const CURVED_BASE_PER_M3 = 65_000;
/** Il lamellare curvo costa circa 2,5 volte il dritto (DA VALIDARE). */
const CURVED_FACTOR = 2.5;

export const DEFAULT_PRICE_LIST_DATA: PriceListInput = {
  currency: "EUR",
  timber: {
    species: [
      { id: "abete", label: "Abete" },
      { id: "larice", label: "Larice" },
      { id: "castagno", label: "Castagno" },
    ],
    qualities: [
      { id: "lamellare", label: "Lamellare (GL24h)" },
      { id: "massello", label: "Massello (bilama/uso Fiume)" },
    ],
    // €/m³ in centesimi — DA VALIDARE CON UFFICIO COMMERCIALE
    pricePerM3: {
      abete: { lamellare: 65_000, massello: 55_000 },
      larice: { lamellare: 95_000, massello: 82_000 },
      castagno: { lamellare: 135_000, massello: 110_000 },
    },
    // nessun prezzo al metro lineare: tutte le sezioni al m³ (l'ufficio può aggiungerli per sezione)
    // curvi: €/ml di sviluppo per sezione + fisso di curvatura per pezzo — DA VALIDARE
    curvedPerMl: bySection((s) => Math.round(areaM2(s) * CURVED_BASE_PER_M3 * CURVED_FACTOR)),
    curvedSetupCents: 15_000,
    // pannelli (grigliati) al m² — DA VALIDARE
    panelsPerM2: { grigliato: 4_500 },
    // lunghezze commerciali: 4/5/6 m per tutte, 13,5 m solo in lamellare — DA VALIDARE
    stockLengths: bySection(() => [
      { length: 4_000 },
      { length: 5_000 },
      { length: 6_000 },
      { length: 13_500, qualities: ["lamellare"] },
    ]),
    kerf: 4,
    endTrim: 10,
    minReusableOffcut: bySection(() => 1_000),
    offcutRecoveryPct: 30,
  },
  machining: {
    // centro di lavoro CNC — DA VALIDARE CON UFFICIO TECNICO
    hourlyRateCents: 9_000,
    handlingMinPerPiece: 1.5,
    perType: {
      "mezzo-legno": { baseMin: 3, perUnitMin: 0.01, unit: "cm2" },
      tenone: { baseMin: 2.5, perUnitMin: 0.005, unit: "cm2" },
      mortasa: { baseMin: 3, perUnitMin: 0.01, unit: "cm2" },
      "becco-uccello": { baseMin: 3, perUnitMin: 0, unit: "n" },
      foro: { baseMin: 0.5, perUnitMin: 0.005, unit: "mm" },
      "taglio-testa": { baseMin: 1.5, perUnitMin: 0, unit: "n" },
      "asola-lama": { baseMin: 4, perUnitMin: 0.01, unit: "cm2" },
      "dardo-di-giove": { baseMin: 12, perUnitMin: 0.01, unit: "mm" },
    },
  },
  hardware: {
    // prezzo unitario in centesimi per codice di `HARDWARE_CATALOG` — DA VALIDARE CON UFFICIO COMMERCIALE
    priceCents: {
      "bullone-m12x200": 420,
      "bullone-m12x240": 480,
      "bullone-m8x120": 180,
      "bullone-m8x140": 200,
      "bullone-m8x200": 260,
      "bullone-m8x240": 300,
      "vite-6x40": 8,
      "vite-6x160": 45,
      "vite-6x200": 55,
      "vite-8x200": 85,
      "vite-8x240": 100,
      "vite-8x40": 12,
      "tassello-10x85": 150,
      "staffa-muro-listoni-paralleli-90": 2_800,
      "staffa-muro-listoni-paralleli-120": 3_400,
      "staffa-inclinata-15": 3_200,
      "staffa-inclinata-25": 3_200,
      "supporto-scomparsa-17": 4_500,
      "scarpa-ancoraggio-100x140": 2_200,
      "scarpa-ancoraggio-120x160": 2_600,
      "staffa-listone-90": 1_600,
      "staffa-listone-120": 1_900,
      "staffa-terra-bicchiere-70": 2_400,
      "staffa-terra-bicchiere-90": 2_800,
      "staffa-terra-bicchiere-120": 3_500,
      "staffa-terra-p-greco": 3_000,
      "staffa-terra-p-greco-120": 3_800,
      "staffa-terra-lama-interna-90": 3_200,
      "staffa-terra-lama-interna-120": 3_900,
      "staffa-terra-lama-interna-160": 5_200,
      "staffa-terra-lama-interna-200": 6_800,
      "staffa-terra-zanca-h": 2_500,
      "staffa-terra-joint-70": 3_600,
      "staffa-terra-joint-90": 4_200,
      "giunto-joint-2-vie-70-90": 5_500,
      "giunto-joint-3l-vie-70-90": 6_500,
      "giunto-joint-3a-vie-70-90": 6_500,
      "giunto-joint-4-vie-70-90": 7_800,
      "giunto-joint-2-vie-90-90": 6_500,
      "giunto-joint-3l-vie-90-90": 7_800,
      "giunto-joint-3a-vie-90-90": 7_800,
      "giunto-joint-4-vie-90-90": 9_200,
      "giunto-joint-3a-vie-90-75": 8_500,
      "giunto-joint-3a-vie-90-105": 8_500,
      "giunto-joint-4-vie-90-75": 9_900,
      "giunto-joint-4-vie-90-105": 9_900,
      "giunto-3a-vie-90": 4_800,
      "giunto-3a-vie-120": 6_200,
      "giunto-3l-vie-90": 4_800,
      "giunto-3l-vie-120": 6_200,
      "giunto-4-vie-90": 5_600,
      "giunto-4-vie-120": 7_200,
      "giunto-5-vie-90": 6_800,
      "giunto-5-vie-120": 8_600,
      "cuspide-4-25": 12_000,
      "cuspide-6-25": 15_000,
      "cuspide-8-15": 18_000,
      "giunto-gazebo-916": 5_800,
      "piastra-914": 1_400,
      "piastra-915": 1_400,
      "supporto-arcarecci-170": 900,
      "supporto-arcarecci-250": 1_200,
    },
  },
  // al m² di superficie sviluppata del legno — DA VALIDARE
  treatments: [
    { id: "impregnante-incolore", label: "Impregnante incolore", pricePerM2Cents: 700 },
    { id: "impregnante-tinta", label: "Impregnante colorato (tinta a scelta)", pricePerM2Cents: 900 },
    { id: "vernice-coprente", label: "Verniciatura coprente", pricePerM2Cents: 1_400 },
  ],
  // al m² di falda in proiezione reale, posa inclusa — DA VALIDARE
  coverings: [
    { id: "policarbonato-alveolare", label: "Policarbonato alveolare 16 mm", pricePerM2Cents: 4_500 },
    { id: "policarbonato-compatto", label: "Policarbonato compatto 6 mm", pricePerM2Cents: 7_500 },
    { id: "pannello-sandwich", label: "Pannello sandwich coibentato", pricePerM2Cents: 5_500 },
    { id: "tegola-canadese", label: "Perlinato, guaina e tegola canadese", pricePerM2Cents: 6_000 },
    { id: "telo-pvc", label: "Telo in PVC", pricePerM2Cents: 3_500 },
  ],
  labour: {
    // montaggio in cantiere — DA VALIDARE CON UFFICIO TECNICO
    hourlyRateCents: 4_200,
    crewSize: 2,
    hoursPerDay: 8,
    setupHours: 3,
    minPerPiece: {
      PIL: 25,
      TRV: 30,
      TVT: 12,
      PNT: 20,
      COL: 30,
      CTV: 10,
      BNC: 20,
      TAV: 15,
      ARC: 40,
      CAN: 30,
      MON: 30,
      MEN: 15,
      FAS: 12,
      GRG: 20,
    },
    minPerJoint: { "tenone-mortasa": 8, "mezzo-legno": 6, "dardo-di-giove": 15 },
    minPerHardware: {
      bullone: 4,
      vite: 1,
      tassello: 4,
      "staffa-muro": 15,
      "staffa-terra": 20,
      "giunto-vie": 15,
      cuspide: 30,
      piastra: 8,
    },
    scaffoldHeightMm: 3_500,
    scaffoldCents: 25_000,
  },
  // regole di complicazione, valutate in ordine — DA VALIDARE CON UFFICIO TECNICO
  complications: [
    {
      id: "fuorisquadra",
      label: "Fuorisquadra",
      enabled: true,
      conditions: [{ factor: "planDeviationDeg", op: ">", value: 3 }],
      effect: { kind: "percento-ore", value: 15 },
      explain: "tagli e tracciamenti fuori squadra",
    },
    {
      id: "pavimento-non-in-piano",
      label: "Pavimento non in piano",
      enabled: true,
      conditions: [{ factor: "floorRangeMm", op: ">=", value: 100 }],
      effect: { kind: "ore", value: 3 },
      explain: "pilastri a misura e livellamento delle basi",
    },
    {
      id: "ostacoli",
      label: "Ostacoli in cantiere",
      enabled: true,
      conditions: [{ factor: "obstaclesCount", op: ">=", value: 1 }],
      effect: { kind: "ore", value: 2 },
      explain: "lavorazioni attorno a grondaie, finestre, pluviali",
    },
    {
      id: "altezza",
      label: "Lavoro in quota",
      enabled: true,
      conditions: [{ factor: "maxHeightMm", op: ">", value: 3_500 }],
      effect: { kind: "percento-ore", value: 10 },
      explain: "montaggio sopra i 3,5 m",
    },
    {
      id: "accesso",
      label: "Accesso al cantiere",
      enabled: true,
      conditions: [{ factor: "access", op: "in", value: ["medio", "difficile"] }],
      effect: { kind: "percento-ore", value: 15 },
      explain: "movimentazione a mano del materiale",
    },
    {
      id: "affondamento",
      label: "Pilastri affondati",
      enabled: true,
      conditions: [{ factor: "embedmentMm", op: ">", value: 0 }],
      effect: { kind: "ore", value: 2 },
      explain: "scavo e getto dei plinti",
    },
  ],
  transport: {
    // zone per prefisso di CAP — DA VALIDARE. Sede e piazzale a Settimo di Pescantina (VR):
    // provincia di Verona, poi le province confinanti, poi anelli più lontani.
    zones: [
      { name: "Provincia di Verona", capPrefixes: ["37"], km: 30, priceCents: 9_000 },
      // Brescia, Padova, Vicenza, Trento, Rovigo, Mantova
      { name: "Province limitrofe", capPrefixes: ["25", "35", "36", "38", "45", "46"], km: 80, priceCents: 15_000 },
      // Bergamo, Cremona, Venezia, Treviso, Belluno
      { name: "Veneto e Lombardia orientale", capPrefixes: ["24", "26", "30", "31", "32"], km: 140, priceCents: 20_000 },
      // Milano, Friuli Venezia Giulia, Alto Adige, Emilia
      { name: "Nord Italia", capPrefixes: ["20", "33", "34", "39", "40", "41", "42", "43", "44"], km: 220, priceCents: 30_000 },
      // ripiego per i CAP non elencati: avviso "zona da verificare"
      { name: "Fuori zona", capPrefixes: [], km: 300, priceCents: 45_000 },
    ],
    fallbackZone: "Fuori zona",
    perKmCents: 150,
  },
  margins: { materialsPct: 30, labourPct: 25 },
  discounts: [{ id: "cliente-abituale", label: "Cliente abituale", kind: "percento", value: 5 }],
  vatRates: [
    { id: "ordinaria", label: "IVA ordinaria 22%", pct: 22 },
    { id: "ristrutturazione", label: "IVA agevolata 10% (ristrutturazione)", pct: 10 },
  ],
  defaultVat: "ordinaria",
  minimumOrderCents: 150_000,
  roundingStepCents: 1_000,
  indicativityPct: 10,
};

/** Listino seed validato all'import (un errore qui è un bug del seed). */
export const DEFAULT_PRICE_LIST: PriceList = parsePriceList(DEFAULT_PRICE_LIST_DATA);

export const DEFAULT_PRICE_LIST_VERSION: PriceListVersion = {
  id: "listino-v1",
  version: 1,
  effectiveFrom: "2026-01-01",
  status: "attiva",
};
