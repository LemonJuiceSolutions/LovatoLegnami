import type { HardwareKind, Section } from "../components/types";
import { HardwareError } from "./errors";
import { type HardwareSpec, type HoleFeature, type ScrewCount, parseHardwareSpec } from "./types";

/**
 * Catalogo della ferramenta strutturale (E3), dai dati commerciali di
 * `openspec/changes/tipologie-estese/ricerca-chepergola.md` (§1 schede T-x,
 * §2 componenti, §4 riepilogo). Ogni voce cita la sezione della ricerca in
 * `source`; i valori non dichiarati dal sito sono marcati `[dedotto]`.
 *
 * DA VALIDARE CON UFFICIO TECNICO: tutti i valori di questo file (ingombri,
 * fori, inserimenti dei giunti, viti per pezzo).
 */

const VALIDATION = "DA VALIDARE CON UFFICIO TECNICO";
const sq = (s: number): Section => ({ b: s, h: s });
const screws = (code: string, count: number): ScrewCount[] => [{ code, count }];

/** Bullone passante (vite + dado + rondelle): diametro e lunghezza nominali. */
function bolt(d: number, l: number, source: string): HardwareSpec {
  return {
    code: `bullone-m${d}x${l}`,
    kind: "bullone",
    name: `Bullone passante M${d}×${l}`,
    dims: { x: l, y: 2 * d, z: 2 * d },
    diameter: d,
    length: l,
    source,
    validation: VALIDATION,
  };
}

/** Vite o tassello conteggiato (nessuna posa). */
function fastener(kind: "vite" | "tassello", d: number, l: number, name: string, source: string): HardwareSpec {
  return {
    code: `${kind}-${d}x${l}`,
    kind,
    name: `${name} ${d}×${l}`,
    dims: { x: l, y: d, z: d },
    diameter: d,
    length: l,
    source,
    validation: VALIDATION,
  };
}

const lateralHole = (along: number, diameter: number, offset = 0): HoleFeature => ({ kind: "foro", axis: "y", along, offset, diameter });

/** Portapilastro a lama interna: tabella §2.2 (base, lama, pilastro). */
function bladeBase(post: number, base: number, bladeW: number, bladeH: number): HardwareSpec {
  return {
    code: `staffa-terra-lama-interna-${post}`,
    kind: "staffa-terra",
    name: `Portapilastro a lama interna ${post} (base ${base}×${base}, lama ${bladeW}×${bladeH})`,
    forSections: [sq(post)],
    dims: { x: bladeH + 8, y: base, z: base },
    holes: {
      anchor: "piede",
      features: [
        { kind: "asola", width: 8, height: bladeW, depth: bladeH },
        // 2 fori lama 13×30: posizione lungo la lama [dedotto] a 1/3 e 2/3 dell'altezza
        lateralHole(Math.round(bladeH / 3), 13),
        lateralHole(Math.round((2 * bladeH) / 3), 13),
      ],
    },
    source: "ricerca-chepergola.md §2.2 (staffa a lama interna); posizione dei fori [dedotto]",
    validation: VALIDATION,
  };
}

/** Bicchiere: nessuna lavorazione nel legno, 4 viti 8×40 (§1 T-A). */
function cup(post: number, source = "ricerca-chepergola.md §1 T-A (staffa a bicchiere, 4 viti 8×40), §2.2"): HardwareSpec {
  return {
    code: `staffa-terra-bicchiere-${post}`,
    kind: "staffa-terra",
    name: `Staffa a bicchiere ${post}×${post}`,
    forSections: [sq(post)],
    dims: { x: 150, y: post + 10, z: post + 10 },
    screws: screws("vite-8x40", 4),
    source,
    validation: VALIDATION,
  };
}

/**
 * Giunto metallico a manicotto (linea JOINT, §1 T-D): le aste sono tagliate a
 * squadra e infilate. Ingombro del nodo e inserimento [dedotto] dalla distinta
 * 258×258 (morali da 2400 su interasse 2580 ⇒ node/2 − insertion = 90 per il 90).
 */
function jointJoint(layout: "2" | "3L" | "3A" | "4", section: 70 | 90, angle: 90 | 75 | 105): HardwareSpec {
  const ways = (layout === "2" ? 2 : layout === "4" ? 4 : 3) as 2 | 3 | 4;
  const node = section === 90 ? 360 : 280;
  const insertion = section === 90 ? 90 : 70;
  const label = { "2": "2 vie", "3L": "3 vie lineare", "3A": "3 vie angolare", "4": "4 vie" }[layout];
  // viti 6×40 per giunto [dedotto] dalle distinte 258×258 (160) e 427×318 (220)
  const count = { "2": 16, "3L": 14, "3A": 20, "4": 24 }[layout];
  return {
    code: `giunto-joint-${layout.toLowerCase()}-vie-${section}-${angle}`,
    kind: "giunto-vie",
    name: `Giunto JOINT ${label} ${angle}° per ${section}×${section}`,
    forSections: [sq(section)],
    dims: { x: node, y: node, z: node },
    joint: { ways, layout, node, insertion },
    angle,
    screws: screws("vite-6x40", count),
    source: "ricerca-chepergola.md §1 T-D (catalogo giunti JOINT); ingombro, inserimento e viti [dedotto]",
    validation: VALIDATION,
  };
}

/** Giunti zincati 3 mm, fori Ø11 (§1 T-D "altri giunti"): A/B/C 240/190/240 (90) e 360/240/360 (120). */
function zincJoint(layout: "3A" | "3L" | "4" | "5", section: 90 | 120): HardwareSpec {
  const ways = (layout === "4" ? 4 : layout === "5" ? 5 : 3) as 3 | 4 | 5;
  const node = section === 90 ? 240 : 360;
  const label = { "3A": "3 vie angolare", "3L": "3 vie lineare", "4": "4 vie", "5": "5 vie" }[layout];
  return {
    code: `giunto-${layout.toLowerCase()}-vie-${section}`,
    kind: "giunto-vie",
    name: `Giunto ${label} per ${section}×${section}`,
    forSections: [sq(section)],
    dims: { x: node, y: section === 90 ? 190 : 240, z: node },
    joint: { ways, layout, node, insertion: section === 90 ? 75 : 120 },
    angle: 90,
    screws: screws("vite-8x40", 4 * ways),
    source: "ricerca-chepergola.md §1 T-D (altri giunti, A/B/C), §2.3; inserimento e viti [dedotto]",
    validation: VALIDATION,
  };
}

/** Cuspide (colmo) per gazebo a N falde (§1 T-H). */
function cusp(slopes: 4 | 6 | 8, angle: number, dims: { x: number; y: number; z: number }): HardwareSpec {
  return {
    code: `cuspide-${slopes}-${angle}`,
    kind: "cuspide",
    name: `Cuspide per gazebo a ${slopes} falde ${angle}°`,
    forSections: [sq(70)],
    dims,
    angle,
    slopes,
    accessories: [{ code: "piastra-914", count: slopes }],
    source: "ricerca-chepergola.md §1 T-H (colmi gazebo, art. 922 + piastre 914)",
    validation: VALIDATION,
  };
}

const DATA: HardwareSpec[] = [
  // --- Bulloni (§1 T-A 12×200, T-C 12×240, T-E 8×120 / 8×140) -------------- DA VALIDARE CON UFFICIO TECNICO
  bolt(12, 200, "ricerca-chepergola.md §1 T-A, §4 (pilastro–trave sandwich)"),
  bolt(12, 240, "ricerca-chepergola.md §1 T-C, T-G (MAXI)"),
  bolt(8, 120, "ricerca-chepergola.md §1 T-E (testa dell'arco)"),
  bolt(8, 140, "ricerca-chepergola.md §1 T-E (testa dell'arco, MAXI)"),

  // --- Viti e tasselli (conteggi) ------------------------------------------ DA VALIDARE CON UFFICIO TECNICO
  fastener("vite", 6, 40, "Vite nera", "ricerca-chepergola.md §1 T-D (giunti JOINT)"),
  fastener("vite", 6, 160, "Vite TORX", "ricerca-chepergola.md §1 T-A (travetti su trave)"),
  fastener("vite", 6, 200, "Vite TORX", "ricerca-chepergola.md §1 T-C, T-G"),
  fastener("vite", 8, 200, "Vite TORX", "ricerca-chepergola.md §1 T-C (MAXI 5×6)"),
  fastener("vite", 8, 240, "Vite TORX", "ricerca-chepergola.md §1 T-C (MAXI 5×5)"),
  fastener("vite", 8, 40, "Vite", "ricerca-chepergola.md §1 T-A (staffa a bicchiere)"),
  fastener("tassello", 10, 85, "Tassello FM-X5", "ricerca-chepergola.md §1 T-B"),

  // --- Staffe a muro (§1 T-B, T-J, §4) -------------------------------------- DA VALIDARE CON UFFICIO TECNICO
  ...([
    [90, { b: 45, h: 120 }],
    [120, { b: 45, h: 145 }],
  ] as const).map(
    ([gap, plank]): HardwareSpec => ({
      code: `staffa-muro-listoni-paralleli-${gap}`,
      kind: "staffa-muro",
      name: `Staffa a muro listoni paralleli ${gap} (lama tra le tavole)`,
      forSections: [plank],
      dims: { x: 160, y: gap, z: plank.h },
      // la lama tra le tavole è serrata da 1 bullone passante: foro Ø13 nelle tavole [dedotto: a 60 dalla testa a muro]
      holes: { anchor: "testa", features: [lateralHole(60, 13)] },
      accessories: [{ code: gap === 90 ? "bullone-m12x200" : "bullone-m12x240", count: 1 }],
      screws: screws("tassello-10x85", 2),
      source: "ricerca-chepergola.md §1 T-B (2 tasselli e 1 bullone per staffa dalle distinte 2×3 e 4×6), T-C; quote [dedotto]",
      validation: VALIDATION,
    }),
  ),
  ...([15, 25] as const).map(
    (angle): HardwareSpec => ({
      code: `staffa-inclinata-${angle}`,
      kind: "staffa-muro",
      name: `Staffa inclinata ${angle}° (coppia SX/DX, sp. 4)`,
      dims: { x: 140, y: 90, z: 140 },
      angle,
      // fissaggio laterale avvitato, nessuna lavorazione nel legno [dedotto]
      screws: [
        { code: "vite-6x40", count: 8 },
        { code: "tassello-10x85", count: 2 },
      ],
      source: "ricerca-chepergola.md §1 T-J (staffe inclinate 15° e 25°); viti [dedotto]",
      validation: VALIDATION,
    }),
  ),
  {
    code: "supporto-scomparsa-17",
    kind: "staffa-muro",
    name: "Supporto pensilina a scomparsa 17° (lama 105×250)",
    dims: { x: 250, y: 90, z: 160 },
    angle: 17,
    holes: {
      anchor: "testa",
      features: [
        { kind: "asola", width: 8, height: 105, depth: 250 },
        // 2 fori Ø15 nella lama: posizione [dedotto] a 80 e 190 dalla testa
        lateralHole(80, 15),
        lateralHole(190, 15),
      ],
    },
    screws: screws("tassello-10x85", 4),
    source: "ricerca-chepergola.md §1 T-J (supporto a scomparsa: acciaio 8, base 160×90 con 4 asole Ø13, lama 105×250 con 2 fori Ø15); quote dei fori [dedotto]",
    validation: VALIDATION,
  },
  ...([90, 120] as const).map(
    (s): HardwareSpec => ({
      code: `staffa-listone-${s}`,
      kind: "staffa-muro",
      name: `Staffa per listone ${s}`,
      forSections: [sq(s)],
      dims: { x: 120, y: s + 6, z: s },
      // 2 fori laterali passanti Ø11 [dedotto: a 40 e 90 dalla testa]
      holes: { anchor: "testa", features: [lateralHole(40, 11), lateralHole(90, 11)] },
      screws: screws("tassello-10x85", 2),
      source: "ricerca-chepergola.md §1 T-J (staffa per listone 90/120: 2 fori a muro + 2 laterali); quote [dedotto]",
      validation: VALIDATION,
    }),
  ),

  // --- Staffe a terra (§1 T-A, T-E, T-F, §2.2) ------------------------------- DA VALIDARE CON UFFICIO TECNICO
  cup(70),
  cup(90),
  cup(120, "ricerca-chepergola.md §1 T-C (bicchieri 120×120), §2.2"),
  ...([90, 120] as const).map(
    (s): HardwareSpec => ({
      code: s === 90 ? "staffa-terra-p-greco" : "staffa-terra-p-greco-120",
      kind: "staffa-terra",
      name: `Staffa a P greco ${s} (h 200, sp. 5)`,
      forSections: [sq(s)],
      dims: { x: 200, y: s + 10, z: s + 10 },
      // 4 fori laterali Ø11 sulle due ali = 2 fori passanti nel legno [dedotto: a 50 e 150 dal piede]
      holes: { anchor: "piede", features: [lateralHole(50, 11), lateralHole(150, 11)] },
      screws: screws("tassello-10x85", 2),
      source: "ricerca-chepergola.md §1 T-E, §2.2 (P greco: 2 fori base Ø11,5, 4 fori laterali Ø11); quote [dedotto]",
      validation: VALIDATION,
    }),
  ),
  bladeBase(90, 85, 68, 180),
  bladeBase(120, 115, 98, 180),
  bladeBase(160, 150, 138, 200),
  bladeBase(200, 190, 178, 220),
  {
    code: "staffa-terra-zanca-h",
    kind: "staffa-terra",
    name: "Zanca ad H da cementare",
    forSections: [sq(90), sq(120)],
    dims: { x: 400, y: 130, z: 130 },
    // 2 fori passanti Ø13 per i bulloni [dedotto: a 60 e 140 dal piede]
    holes: { anchor: "piede", features: [lateralHole(60, 13), lateralHole(140, 13)] },
    source: "ricerca-chepergola.md §1 T-F, T-G, §2.2 (zanca ad H fissa o regolabile 100–180); quote [dedotto]",
    validation: VALIDATION,
  },
  ...([70, 90] as const).map(
    (s): HardwareSpec => ({
      code: `staffa-terra-joint-${s}`,
      kind: "staffa-terra",
      name: `Staffa a terra JOINT ${s} (bicchiere antracite)`,
      forSections: [sq(s)],
      dims: { x: 150, y: s + 4, z: s + 4 },
      screws: screws("vite-6x40", 6),
      source: "ricerca-chepergola.md §1 T-D (4 staffe a terra JOINT nella 258×258); viti [dedotto] dalle distinte 258×258 e 427×318",
      validation: VALIDATION,
    }),
  ),

  // --- Giunti metallici (§1 T-D) ---------------------------------------------- DA VALIDARE CON UFFICIO TECNICO
  ...(["2", "3L", "3A", "4"] as const).map((l) => jointJoint(l, 70, 90)),
  ...(["2", "3L", "3A", "4"] as const).map((l) => jointJoint(l, 90, 90)),
  ...(["3A", "4"] as const).flatMap((l) => [jointJoint(l, 90, 75), jointJoint(l, 90, 105)]),
  ...(["3A", "3L", "4", "5"] as const).flatMap((l) => [zincJoint(l, 90), zincJoint(l, 120)]),

  // --- Gazebo: cuspidi, giunto 916, piastre (§1 T-H) ------------------------- DA VALIDARE CON UFFICIO TECNICO
  cusp(4, 25, { x: 470, y: 470, z: 300 }),
  cusp(6, 25, { x: 470, y: 470, z: 300 }),
  cusp(8, 15, { x: 140, y: 140, z: 270 }),
  {
    code: "giunto-gazebo-916",
    kind: "giunto-vie",
    name: "Giunto angolare 3 vie art. 916 (testa pilastro + 2 traverse 90×90)",
    forSections: [sq(90)],
    dims: { x: 200, y: 200, z: 90 },
    joint: { ways: 3, layout: "3A", node: 200, insertion: 55 },
    angle: 90,
    accessories: [{ code: "piastra-915", count: 1 }],
    source: "ricerca-chepergola.md §1 T-H (art. 916 + piastra 915); ingombri [dedotto]",
    validation: VALIDATION,
  },
  {
    code: "piastra-914",
    kind: "piastra",
    name: "Piastra art. 914 per puntone 70×70 (testa, fissata alla cuspide)",
    forSections: [sq(70)],
    dims: { x: 120, y: 70, z: 70 },
    source: "ricerca-chepergola.md §1 T-H",
    validation: VALIDATION,
  },
  {
    code: "piastra-915",
    kind: "piastra",
    name: "Piastra art. 915 per puntone 70×70 (piede, fissata al giunto 916)",
    forSections: [sq(70)],
    dims: { x: 120, y: 70, z: 70 },
    source: "ricerca-chepergola.md §1 T-H",
    validation: VALIDATION,
  },
  ...([170, 250] as const).map(
    (l): HardwareSpec => ({
      code: `supporto-arcarecci-${l}`,
      kind: "piastra",
      name: `Supporto per arcarecci L ${l} (coppia SX/DX, sp. 2)`,
      dims: { x: l, y: 50, z: 100 },
      screws: screws("vite-6x40", 8),
      source: "ricerca-chepergola.md §2.3 (supporto per arcarecci 170/250); viti [dedotto]",
      validation: VALIDATION,
    }),
  ),
];

/** Catalogo validato all'avvio (schema di ogni voce, codici univoci, riferimenti a viti/accessori). */
export const HARDWARE_CATALOG: readonly HardwareSpec[] = (() => {
  const out = DATA.map((d) => parseHardwareSpec(d));
  const codes = new Set<string>();
  for (const s of out) {
    if (codes.has(s.code)) throw new HardwareError(s.code, "codice duplicato nel catalogo");
    codes.add(s.code);
  }
  for (const s of out)
    for (const r of [...(s.screws ?? []), ...(s.accessories ?? [])])
      if (!codes.has(r.code)) throw new HardwareError(s.code, `riferisce la voce inesistente ${r.code}`);
  return out;
})();

const BY_CODE = new Map(HARDWARE_CATALOG.map((s) => [s.code, s]));

/** Voce di catalogo per codice; `HardwareError` che cita il codice se sconosciuto. */
export function findHardware(code: string): HardwareSpec {
  const s = BY_CODE.get(code);
  if (!s) throw new HardwareError(code, `codice di ferramenta sconosciuto: "${code}"`);
  return s;
}

/** `true` se il codice è a catalogo. */
export const hasHardware = (code: string): boolean => BY_CODE.has(code);

const sameSection = (a: Section, b: Section): boolean => (a.b === b.b && a.h === b.h) || (a.b === b.h && a.h === b.b);

/**
 * Voci di un tipo compatibili con la sezione: quelle che dichiarano la sezione
 * tra le `forSections` (anche ruotata) e quelle senza vincolo di sezione.
 */
export function hardwareFor(kind: HardwareKind, section?: Section): HardwareSpec[] {
  return HARDWARE_CATALOG.filter(
    (s) => s.kind === kind && (!section || !s.forSections || s.forSections.some((f) => sameSection(f, section))),
  );
}
