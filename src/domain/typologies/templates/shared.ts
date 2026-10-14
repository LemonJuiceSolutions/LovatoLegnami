import type { MachiningSpec, Pose, Section } from "../../components/types";
import { degToRad, fromBasis } from "../../math/mat4";
import { vec3 } from "../../math/vec3";
import type { BuildContext, BuildStep, NumberParamSpec, ParamSpec, SectionParamSpec } from "../template";

/*
 * Mattoni comuni ai template delle coperture. Convenzioni geometriche (D3):
 * X lungo il fronte, Y in profondità, Z in alto; origine all'angolo anteriore
 * sinistro a quota pavimento 0. Le pose seguono la convenzione del pezzo
 * (X locale lungo la lunghezza, sezione centrata: b lungo Y locale, h lungo Z).
 */

const num = (
  name: string,
  label: string,
  unit: NumberParamSpec["unit"],
  min: number,
  max: number,
  def: number,
  step: number,
  extra: Partial<NumberParamSpec> = {},
): NumberParamSpec => ({ kind: "number", name, label, unit, min, max, default: def, step, ...extra });

const sec = (name: string, label: string, pieceType: SectionParamSpec["pieceType"], def: string): SectionParamSpec => ({
  kind: "section",
  name,
  label,
  pieceType,
  default: def,
});

/** Parametri comuni a tutte le coperture (nomi condivisi tra tipologie). */
export const commonParams = (d: {
  larghezza: number;
  profondita: number;
  profonditaLabel: string;
  pendenza: number;
  interasse: number;
}): ParamSpec[] => [
  num("larghezza", "Larghezza (fronte)", "mm", 2000, 12000, d.larghezza, 50, {
    description: "Estensione lungo il fronte di travi e copertura.",
  }),
  num("profondita", d.profonditaLabel, "mm", 1500, 6000, d.profondita, 50),
  num("altezza", "Altezza utile sotto trave", "mm", 1800, 4000, 2400, 10, {
    description: "Quota d'imposta: intradosso della trave sopra i pilastri.",
  }),
  num("pendenza", "Pendenza", "°", 3, 45, d.pendenza, 0.5),
  num("interasse", "Interasse travetti desiderato", "mm", 300, 1200, d.interasse, 10, {
    description: "Interasse massimo: quello effettivo divide esattamente la larghezza utile.",
  }),
  num("sbalzo", "Sbalzo di gronda", "mm", 0, 1500, 400, 10, {
    description: "Sporgenza in pianta dei travetti oltre la faccia esterna della trave.",
  }),
  num("sbalzoLaterale", "Sbalzo laterale trave", "mm", 0, 1500, 600, 10, {
    description: "Sporgenza della trave oltre la faccia esterna dei pilastri d'estremità.",
  }),
  num("campate", "Campate", "n", 1, 8, 2, 1, { integer: true }),
  { kind: "boolean", name: "controventi", label: "Controventi (saette)", default: true },
  num("saetta", "Lato saetta", "mm", 200, 1200, 400, 10, {
    description: "Lunghezza dei cateti dei controventi a 45° tra pilastro e trave.",
  }),
  sec("sezionePilastro", "Sezione pilastri", "pilastro", "120×120"),
  sec("sezioneTrave", "Sezione travi", "trave", "120×240"),
  sec("sezioneTravetto", "Sezione travetti", "travetto", "80×160"),
  sec("sezioneControvento", "Sezione controventi", "controvento", "100×100"),
];

export { num as numberParam, sec as sectionParam };

/** Pose rigida da origine e assi X, Z (versori ortogonali). */
const pose = fromBasis;

/** Pezzo orizzontale lungo X da `x0`, con asse a (y, z). */
export const alongX = (x0: number, y: number, z: number): Pose => pose(vec3(x0, y, z), vec3(1, 0, 0), vec3(0, 0, 1));

/**
 * Pilastro verticale con testa a quota `top` (quota d'imposta) e piede
 * affondato di `ctx.embedment` sotto il pavimento in (x, y):
 * lunghezza = top − quotaPavimento(x, y) + affondamento. La base b è lungo X,
 * h lungo Y. Le travi restano alla quota di progetto, qualunque sia il pavimento.
 */
export function columnStep(ctx: BuildContext, ref: string, x: number, y: number, top: number, section: Section): BuildStep {
  const foot = ctx.floorHeightAt(x, y) - ctx.embedment;
  return {
    kind: "place",
    ref,
    type: "pilastro",
    section,
    length: top - foot,
    pose: pose(vec3(x, y, foot), vec3(0, 0, 1), vec3(0, 1, 0)),
  };
}

/** Posizioni degli assi di `count` pezzi equidistanti tra le facce esterne in [x0, x1]. */
export function spread(x0: number, x1: number, width: number, spaces: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= spaces; i++) out.push(x0 + width / 2 + (i * (x1 - x0 - width)) / spaces);
  return out;
}

/** Numero di campi tra travetti: il minimo che rispetta l'interasse desiderato. */
export const joistSpaces = (usable: number, spacing: number): number => Math.max(1, Math.ceil(usable / spacing - 1e-9));

/* ------------------------------------------------------------------ */
/* Controventi (saette) a 45° nel piano della trave                    */
/* ------------------------------------------------------------------ */

const SQRT1_2 = Math.SQRT1_2;

/** Lato minimo sotto cui i controventi non vengono generati (mm). */
export const MIN_BRACE_LEG = 150;

/**
 * Lato effettivo delle saette: il parametro, ridotto se non c'è spazio sulla
 * trave (sbalzo laterale o mezza campata, con 30 mm di margine) o sul
 * pilastro (metà altezza). `0` se resta sotto `MIN_BRACE_LEG`.
 */
export function braceLeg(p: {
  saetta: number;
  sbalzoLaterale: number;
  campata: number;
  altezza: number;
  sp: Section;
  sc: Section;
}): number {
  const foot = SQRT1_2 * p.sc.h + 30; // impronta della saetta sotto la trave + margine
  const leg = Math.min(p.saetta, p.sbalzoLaterale - foot, (p.campata - p.sp.b) / 2 - foot, p.altezza / 2);
  return leg >= MIN_BRACE_LEG ? leg : 0;
}

/**
 * Due saette per pilastro (sinistra e destra) nel piano verticale y = `y`, dal
 * fianco del pilastro (a quota `top − leg`) all'intradosso della trave
 * (quota `top`), con tagli di testa a 45° a filo delle due facce.
 */
export function braceSteps(prefix: string, postXs: readonly number[], y: number, top: number, leg: number, sp: Section, sc: Section): BuildStep[] {
  if (leg <= 0) return [];
  const h = sc.h;
  const length = leg * Math.SQRT2 + h;
  const steps: BuildStep[] = [];
  postXs.forEach((x, i) => {
    for (const side of [-1, 1] as const) {
      const ref = `${prefix}-${i}-${side < 0 ? "s" : "d"}`;
      const ax = vec3(side * SQRT1_2, 0, SQRT1_2);
      const az = vec3(-side * SQRT1_2, 0, SQRT1_2);
      const a = vec3(x + (side * sp.b) / 2, y, top - leg); // asse sul fianco del pilastro
      const origin = vec3(a.x - ax.x * (h / 2), a.y, a.z - ax.z * (h / 2));
      steps.push(
        { kind: "place", ref, type: "controvento", section: sc, length, pose: pose(origin, ax, az) },
        { kind: "machining", target: ref, spec: { type: "taglio-testa", face: "testa-inizio", at: h / 2, angle: 45 } },
        { kind: "machining", target: ref, spec: { type: "taglio-testa", face: "testa-fine", at: length - h / 2, angle: -45 } },
      );
    }
  });
  return steps;
}

/* ------------------------------------------------------------------ */
/* Travetti inclinati di falda                                         */
/* ------------------------------------------------------------------ */

/**
 * Riferimento di falda: `u` è la distanza orizzontale misurata in salita,
 * `y = yOf(u)`. `dir = +1` falda che sale verso +Y, `−1` verso −Y.
 */
export interface Falda {
  readonly dir: 1 | -1;
  readonly yOf: (u: number) => number;
  /** Pendenza (gradi). */
  readonly slope: number;
  /** Quota dell'intradosso dei travetti (box non lavorato) in funzione di `u`. */
  readonly underside: (u: number) => number;
}

/** Appoggio di un travetto: spigolo superiore a valle del supporto (u, z). */
export interface JoistSeat {
  readonly u: number;
  readonly z: number;
}

/**
 * Travetto inclinato di falda con:
 * - spigolo inferiore della testa di gronda in `uStart` (taglio a piombo
 *   passante per quello spigolo, così lo sbalzo in pianta è misurato lì);
 * - testa alta con taglio a piombo in `uTop` (spigolo superiore), il box non
 *   lavorato arriva fino a `uTop + h·sin(pendenza)`;
 * - becco d'uccello su ogni appoggio, con vertice sullo spigolo a valle del
 *   supporto: faccia d'appoggio orizzontale, faccia di battuta verticale.
 * L'asse X locale sale lungo la falda (testa-inizio = gronda).
 */
export function joistSteps(ref: string, x: number, falda: Falda, sec: Section, uStart: number, uTop: number, seats: readonly JoistSeat[]): BuildStep[] {
  const s = degToRad(falda.slope);
  const [c, sn, t] = [Math.cos(s), Math.sin(s), Math.tan(s)];
  const h = sec.h;
  const length = (uTop + h * sn - uStart) / c;
  const z0 = falda.underside(uStart);
  // asse: dallo spigolo inferiore di gronda, mezzo spessore lungo la normale alla falda
  const uAxis = uStart - (h / 2) * sn;
  const origin = vec3(x, falda.yOf(uAxis), z0 + (h / 2) * c);
  const xAxis = vec3(0, falda.dir * c, sn);
  const zAxis = vec3(0, -falda.dir * sn, c);
  const machinings: MachiningSpec[] = [
    { type: "taglio-testa", face: "testa-inizio", at: (h / 2) * t, angle: falda.slope },
    ...seats.map((seat): MachiningSpec => {
      const du = seat.u - uStart;
      const dz = seat.z - z0;
      return { type: "becco-uccello", face: "inferiore", at: du * c + dz * sn, depth: -du * sn + dz * c, angle: falda.slope };
    }),
    { type: "taglio-testa", face: "testa-fine", at: length - (h / 2) * t, angle: falda.slope },
  ];
  return [
    { kind: "place", ref, type: "travetto", section: sec, length, pose: fromBasis(origin, xAxis, zAxis) },
    ...machinings.map((spec): BuildStep => ({ kind: "machining", target: ref, spec })),
  ];
}

/**
 * Affondamento dell'intradosso dei travetti in asse agli appoggi (mm,
 * perpendicolare alla falda): sceglie il becco d'uccello in modo che la faccia
 * d'appoggio copra al più la larghezza del supporto più stretto e la
 * profondità non superi h/3 del travetto.
 */
export function seatOffset(slopeDeg: number, supportWidths: readonly number[], joist: Section): number {
  const sn = Math.sin(degToRad(slopeDeg));
  const bmin = Math.min(...supportWidths);
  const bmax = Math.max(...supportWidths);
  return Math.max(0, Math.min((bmin / 2) * sn, joist.h / 3 - (bmax / 2) * sn));
}
