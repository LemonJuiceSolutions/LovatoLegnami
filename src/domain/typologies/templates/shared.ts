import { contactRange } from "../../assembly/measures";
import { headCutFromPlane } from "../../components/head-cut";
import { createPiece } from "../../components/schemas";
import { sectionLabel } from "../../components/sections";
import { FAMILY_OF, type HeadFace, type MachiningSpec, type Piece, type PieceType, type Pose, type Section } from "../../components/types";
import { hardwareFor } from "../../hardware/catalog";
import { applyToPoint, axisOf, degToRad, fromBasis, invertRigid, radToDeg } from "../../math/mat4";
import { type Plane, intersectLinePlane, plane, transformPlane } from "../../math/plane";
import { type Vec3, add, cross, dot, norm, normalize, scale, sub, vec3 } from "../../math/vec3";
import {
  BOLT_STEP_CODE,
  ParamError,
  TemplateError,
  type BuildContext,
  type BuildStep,
  type EnumParamSpec,
  type NumberParamSpec,
  type ParamSpec,
  type PlaceStep,
  type SectionParamSpec,
} from "../template";

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

/** Parametro a scelta da coppie `[valore, etichetta]` (o `[valore, etichetta, descrizione]`). */
const choice = (
  name: string,
  label: string,
  options: readonly (readonly [string, string] | readonly [string, string, string])[],
  def: string,
  extra: Partial<Omit<EnumParamSpec, "kind" | "name" | "label" | "options" | "default">> = {},
): EnumParamSpec => ({
  kind: "enum",
  name,
  label,
  options: options.map(([value, l, description]) => ({ value, label: l, ...(description ? { description } : {}) })),
  default: def,
  ...extra,
});

export { num as numberParam, sec as sectionParam, choice as enumParam };

/** Pose rigida da origine e assi X, Z (versori ortogonali). */
const pose = fromBasis;

/** Pezzo orizzontale lungo X da `x0`, con asse a (y, z). */
export const alongX = (x0: number, y: number, z: number): Pose => pose(vec3(x0, y, z), vec3(1, 0, 0), vec3(0, 0, 1));

/**
 * Pilastro verticale con testa a quota `top` (quota d'imposta) e piede
 * affondato di `ctx.embedment` sotto il pavimento in (x, y):
 * lunghezza = top − quotaPavimento(x, y) + affondamento. Con `across`
 * orizzontale (default +Y) come asse Z locale: h lungo `across`, b lungo
 * `across × Z` (default: b lungo X, h lungo Y). Le travi restano alla quota di progetto, qualunque sia il pavimento.
 */
export function columnStep(
  ctx: BuildContext,
  ref: string,
  x: number,
  y: number,
  top: number,
  section: Section,
  across: Vec3 = vec3(0, 1, 0),
): PlaceStep {
  const foot = ctx.floorHeightAt(x, y) - ctx.embedment;
  return {
    kind: "place",
    ref,
    type: "pilastro",
    section,
    length: top - foot,
    pose: pose(vec3(x, y, foot), vec3(0, 0, 1), across),
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

/* ------------------------------------------------------------------ */
/* Costruzione bullonata | carpenteria: mattoni duali (E4)             */
/* ------------------------------------------------------------------ */

/** Opzioni costruttive (spec "Opzione costruttiva bullonata o carpenteria"). */
export const CONSTRUCTIONS = ["bullonata", "carpenteria"] as const;
export type Construction = (typeof CONSTRUCTIONS)[number];

/** Parametro comune `costruzione` (enum `bullonata` | `carpenteria`). */
export const constructionParam = (def: Construction = "bullonata", extra: Partial<Omit<EnumParamSpec, "kind" | "name">> = {}): EnumParamSpec => ({
  kind: "enum",
  name: "costruzione",
  label: "Costruzione",
  description: "Riferimento commerciale bullonato o giunti di carpenteria lavorati a CNC.",
  options: [
    {
      value: "bullonata",
      label: "Bullonata (trave sandwich)",
      description: "Trave doppia a sandwich, bulloni passanti, saette tra le tavole, travetti in appoggio avvitati.",
    },
    {
      value: "carpenteria",
      label: "Carpenteria",
      description: "Trave singola con tenone e mortasa sul pilastro, travetti a mezzo legno o becco d'uccello, saette a 45°.",
    },
  ],
  default: def,
  ...extra,
});

/** Valore del parametro `costruzione`. */
export const constructionOf = (ctx: BuildContext): Construction => ctx.enum("costruzione") as Construction;

/** Dati di posizionamento di un pezzo, per i mattoni che ragionano sulla geometria. */
export interface Placed {
  readonly ref: string;
  readonly type: PieceType;
  readonly section: Section;
  readonly length: number;
  readonly pose: Pose;
}

export const placeStep = (p: Placed, label?: string): PlaceStep => ({
  kind: "place",
  ref: p.ref,
  type: p.type,
  section: p.section,
  length: p.length,
  pose: p.pose,
  ...(label !== undefined ? { label } : {}),
});

/** Pezzo provvisorio (id fittizio della famiglia) per le misure di contatto durante la costruzione. */
const probe = (p: Placed): Piece => createPiece({ id: `${FAMILY_OF[p.type]}-99`, type: p.type, section: p.section, length: p.length, pose: p.pose });

/** Taglio di testa sul piano dato, calcolato dal pezzo posizionato (`headCutFromPlane`). */
export const headCutOnPlane = (ref: string, pl: Plane, face: HeadFace): BuildStep => ({
  kind: "machining",
  target: ref,
  fromPiece: (piece) => headCutFromPlane(piece, pl, face),
});

/** Vite per travetti in appoggio: la più corta a catalogo che supera l'altezza del travetto di 70 mm. DA VALIDARE CON UFFICIO TECNICO. */
export function joistScrewFor(joist: Section): string {
  const need = joist.h + JOIST_SCREW_PENETRATION;
  const screws = hardwareFor("vite")
    .filter((s) => s.length! >= need)
    .sort((a, b) => a.length! - b.length! || a.diameter! - b.diameter!);
  if (!screws.length) throw new ParamError("sezioneTravetto", sectionLabel(joist), `nessuna vite a catalogo lunga almeno ${need} mm`);
  return screws[0].code;
}

/** Penetrazione della vite di un travetto nell'appoggio (mm). DA VALIDARE CON UFFICIO TECNICO. */
export const JOIST_SCREW_PENETRATION = 70;
/** Distanza massima (mm) tra travetto e appoggio entro cui la vite d'appoggio lo serra. DA VALIDARE CON UFFICIO TECNICO. */
export const SCREW_GAP = 10;
/** Lunghezza commerciale delle saette (mm, §2.1 della ricerca: 90×90×750). DA VALIDARE CON UFFICIO TECNICO. */
export const BRACE_LENGTH = 750;
/** Margine minimo tra la saetta e le teste della trave o la saetta vicina (mm). */
export const BRACE_MARGIN = 30;
/** Viti al piede di ogni saetta bullonata (TORX sul pilastro, §2.1). DA VALIDARE CON UFFICIO TECNICO. */
export const BRACE_FOOT_SCREWS = { code: "vite-6x160", count: 2 } as const;

const plan3 = (p: { x: number; y: number }, z = 0): Vec3 => vec3(p.x, p.y, z);

/** Portale: trave (doppia o singola) lungo `dir` su pilastri verticali. */
export interface PortalOptions {
  readonly prefix: string;
  /** Punto in pianta dell'asse della trave alla testa iniziale (s = 0). */
  readonly start: { readonly x: number; readonly y: number };
  /** Direzione in pianta della trave (versore). */
  readonly dir: { readonly x: number; readonly y: number };
  /** Lunghezza dei pezzi della trave (lungo l'asse, mm). */
  readonly length: number;
  /** Distanze orizzontali lungo `dir` dalla testa iniziale degli assi dei pilastri. */
  readonly posts: readonly number[];
  /** Quota d'intradosso della trave in s = 0 (mm). */
  readonly underside: number;
  /** Pendenza della trave lungo `dir` (gradi, positiva in salita; default 0). */
  readonly slope?: number;
  readonly postSection: Section;
  /** Sezione di ciascuna tavola (bullonata). */
  readonly plank: Section;
  /** Sezione della trave singola (carpenteria). */
  readonly beam: Section;
  /** Testa dei pilastri sotto una trave inclinata: a squadra (default) o tagliata sul piano della trave. */
  readonly postHead?: "squadra" | "inclinata";
  /** Saette nel piano del portale (nessuna se omesso). */
  readonly braces?: { readonly section: Section; readonly length?: number };
  /** Diametro dei bulloni passanti (default 12). */
  readonly boltDiameter?: number;
}

export interface PortalResult {
  readonly steps: BuildStep[];
  readonly posts: readonly Placed[];
  /** Pezzi della trave (2 tavole o 1 trave): appoggi dei travetti. */
  readonly beams: readonly Placed[];
  readonly braces: readonly Placed[];
  /** Piano dell'estradosso della trave (appoggio dei travetti). */
  readonly top: Plane;
  /** Piano dell'intradosso della trave. */
  readonly bottom: Plane;
  /** Larghezza in pianta della trave (2 tavole + pilastro, o trave). */
  readonly width: number;
}

/**
 * Trave su pilastri nei due modi costruttivi (E4), con la stessa pianta e la
 * stessa quota d'intradosso:
 * - `bullonata`: 2 `tavola` ai lati dei pilastri (assi a ±(b_pil/2 + b_tav/2)),
 *   testa dei pilastri a filo dell'estradosso, 2 `bullone-passante` per
 *   pilastro (a ±h/4 dall'asse delle tavole), saette da 750 a 45° con la
 *   testa tra le tavole serrata da un bullone e 2 viti al piede;
 * - `carpenteria`: `trave` singola sopra i pilastri, `tenone-mortasa`
 *   pilastro → trave (spalla a filo dell'intradosso, il tenone fa parte della
 *   lunghezza del pilastro; testa sempre a squadra), saette a 45° tra
 *   pilastro e intradosso.
 * I pilastri hanno Z locale lungo `dir` (b trasversale alla trave) e seguono
 * il pavimento come `columnStep`. Con trave inclinata la testa dei pilastri è
 * a squadra sotto il piano (default) o tagliata sul piano (`postHead`).
 */
export function beamOnPosts(ctx: BuildContext, mode: Construction, o: PortalOptions): PortalResult {
  const th = degToRad(o.slope ?? 0);
  const [c, sn, t] = [Math.cos(th), Math.sin(th), Math.tan(th)];
  const u = normalize(vec3(o.dir.x, o.dir.y, 0));
  const w = vec3(-u.y, u.x, 0);
  const sp = o.postSection;
  const bolted = mode === "bullonata";
  const sec = bolted ? o.plank : o.beam;
  const xAxis = vec3(c * u.x, c * u.y, sn);
  const zAxis = vec3(-sn * u.x, -sn * u.y, c);
  const base = plan3(o.start);
  const at = (s: number, lateral = 0, z = 0): Vec3 => add(add(base, scale(u, s)), add(scale(w, lateral), vec3(0, 0, z)));
  const bottom = plane(at(0, 0, o.underside), zAxis);
  const top = plane(at(0, 0, o.underside + sec.h / c), zAxis);
  const zOn = (pl: Plane, s: number): number => pl.point.z + s * t;
  const steps: BuildStep[] = [];

  // trave: 2 tavole (destra −w, sinistra +w) o trave singola
  const offsets = bolted ? [-(sp.b / 2 + sec.b / 2), sp.b / 2 + sec.b / 2] : [0];
  const beams: Placed[] = offsets.map((lat, k) => ({
    ref: bolted ? `${o.prefix}-tavola-${k}` : `${o.prefix}-trave`,
    type: bolted ? "tavola" : "trave",
    section: sec,
    length: o.length,
    pose: fromBasis(at(0, lat, o.underside + sec.h / (2 * c)), xAxis, zAxis),
  }));
  beams.forEach((b) => steps.push(placeStep(b)));

  // pilastri: testa a filo dell'estradosso (bullonata) o dell'intradosso (carpenteria)
  const headPlane = bolted ? top : bottom;
  const inclined = Math.abs(t) > 1e-9;
  // in carpenteria la testa resta a squadra: il taglio inclinato asporterebbe il tenone
  const cutHead = inclined && bolted && o.postHead === "inclinata";
  const tenon = { width: Math.round(sp.b / 3), height: Math.round((2 * sp.h) / 3), length: Math.min(60, sec.h / 2), gap: 1 };
  const posts: Placed[] = o.posts.map((s, i) => {
    const p = at(s);
    // carpenteria: la spalla del tenone sotto l'intradosso, il tenone (compreso nella lunghezza) entra nella trave
    const zTop = zOn(headPlane, s) + (cutHead ? 1 : -1) * (sp.h / 2) * Math.abs(t) + (bolted ? 0 : tenon.length);
    const step = columnStep(ctx, `${o.prefix}-pilastro-${i}`, p.x, p.y, zTop, sp, u);
    return { ref: step.ref, type: "pilastro", section: sp, length: step.length as number, pose: step.pose as Pose };
  });
  posts.forEach((p) => {
    steps.push(placeStep(p));
    if (cutHead) steps.push({ kind: "machining", target: p.ref, spec: headCutFromPlane(p, headPlane, "testa-fine") });
  });

  // collegamento pilastro–trave
  const d = o.boltDiameter ?? 12;
  const localX = (s: number, z: number): number => (s + z * sn) / c; // ascissa locale della trave per (s orizzontale, z locale)
  o.posts.forEach((s, i) => {
    const post = posts[i].ref;
    if (bolted)
      for (const off of [-sec.h / 4, sec.h / 4])
        steps.push({
          kind: "hardware",
          code: BOLT_STEP_CODE,
          pieces: [beams[0].ref, post, beams[1].ref],
          params: { face: "destra", at: localX(s, off), offset: off, diameter: d },
        });
    else
      steps.push({
        kind: "joint",
        type: "tenone-mortasa",
        a: post,
        b: beams[0].ref,
        params: tenon,
      });
  });

  // saette nel piano del portale, a 45° dal fianco del pilastro alla trave
  const braces: Placed[] = [];
  if (o.braces) {
    const sc = o.braces.section;
    if (bolted && sc.b > sp.b + 1e-9)
      throw new ParamError("sezioneControvento", sectionLabel(sc), `la saetta deve stare tra le tavole: base ≤ ${sp.b} mm (base del pilastro)`);
    const L = o.braces.length ?? BRACE_LENGTH;
    const rise = (L - sc.h) / Math.SQRT2;
    const reach = rise + sc.h / Math.SQRT2 + BRACE_MARGIN; // ingombro orizzontale dal fianco del pilastro
    const sEnds = [0, o.length * c];
    o.posts.forEach((s, i) => {
      for (const side of [-1, 1] as const) {
        const flank = s + (side * sp.h) / 2;
        const neighbours = o.posts.filter((q, j) => j !== i && (q - s) * side > 0).map((q) => (Math.abs(q - s) - sp.h) / 2);
        const room = Math.min(side > 0 ? sEnds[1] - flank : flank - sEnds[0], ...neighbours);
        const postTop = zOn(headPlane, s) - (sp.h / 2) * Math.abs(t); // spalla (carpenteria) o testa a squadra
        const foot = ctx.floorHeightAt(at(s).x, at(s).y) - ctx.embedment;
        if (room < reach || rise > (postTop - foot) / 2) continue;
        const ref = `${o.prefix}-saetta-${i}-${side < 0 ? "s" : "d"}`;
        const ax = normalize(add(scale(u, side * Math.SQRT1_2), vec3(0, 0, Math.SQRT1_2)));
        const az = normalize(add(scale(u, -side * Math.SQRT1_2), vec3(0, 0, Math.SQRT1_2)));
        const F = at(flank, 0, zOn(headPlane, flank) - rise);
        const T = intersectLinePlane(F, ax, headPlane).point;
        const length = norm(sub(T, F)) + sc.h;
        const brace: Placed = { ref, type: "controvento", section: sc, length, pose: fromBasis(sub(F, scale(ax, sc.h / 2)), ax, az) };
        braces.push(brace);
        const flankPlane = plane(at(flank), scale(u, side));
        steps.push(
          placeStep(brace),
          { kind: "machining", target: ref, spec: headCutFromPlane(brace, flankPlane, "testa-inizio") },
          { kind: "machining", target: ref, spec: headCutFromPlane(brace, headPlane, "testa-fine") },
        );
        if (bolted) {
          // bullone tra le tavole nel punto in cui l'asse della saetta incontra l'asse delle tavole
          const axisPlane = plane(at(0, 0, o.underside + sec.h / (2 * c)), zAxis);
          const Q = intersectLinePlane(F, ax, axisPlane).point;
          steps.push(
            { kind: "hardware", code: BOLT_STEP_CODE, pieces: [beams[0].ref, ref, beams[1].ref], params: { face: "destra", at: localX(dot(sub(Q, base), u), 0), offset: 0, diameter: d } },
            { kind: "hardware", code: BRACE_FOOT_SCREWS.code, pieces: [ref, posts[i].ref], params: { count: BRACE_FOOT_SCREWS.count } },
          );
        }
      }
    });
  }
  const width = bolted ? sp.b + 2 * sec.b : sec.b;
  return { steps, posts, beams, braces, top, bottom, width };
}

/** Travetto: asse in pianta da `from` a `to`, sezione. */
export interface JoistLine {
  readonly ref: string;
  readonly section: Section;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
}

export interface JoistOptions {
  readonly joists: readonly JoistLine[];
  /** Piano d'appoggio: le facce inferiori dei travetti in `bullonata` (estradosso degli appoggi). */
  readonly seat: Plane;
  /** Pezzi che possono sostenere i travetti (tavole, travi, banchine…). */
  readonly supports: readonly Placed[];
  /** Codice della vite d'appoggio (default `joistScrewFor`). */
  readonly screw?: string;
  /** Tipo dei pezzi posati (default `travetto`; `trave` per i correnti). */
  readonly type?: PieceType;
}

export interface JoistResult {
  readonly steps: BuildStep[];
  readonly joists: readonly Placed[];
}

/** Vertice del becco d'uccello: spigolo superiore a valle del supporto nel piano verticale del pezzo (locale). */
function edgeSeat(piece: Placed, support: Placed): { at: number; depth: number } | undefined {
  const X = axisOf(piece.pose, 0);
  const n = cross(X, vec3(0, 0, 1));
  if (norm(n) < 1e-9) return undefined;
  const mid = plane(applyToPoint(piece.pose, vec3(0, 0, 0)), n);
  const inv = invertRigid(piece.pose);
  const { b, h } = support.section;
  let best: Vec3 | undefined;
  for (const y of [-b / 2, b / 2]) {
    const p0 = applyToPoint(support.pose, vec3(0, y, h / 2));
    const dir = axisOf(support.pose, 0);
    if (Math.abs(dot(dir, mid.normal)) < 1e-9) continue;
    const hit = intersectLinePlane(p0, dir, mid);
    if (hit.t < -1e-6 || hit.t > support.length + 1e-6) continue;
    const q = applyToPoint(inv, hit.point);
    if (!best || q.x < best.x) best = q;
  }
  if (!best || best.x < 0 || best.x > piece.length) return undefined;
  return { at: best.x, depth: best.z + piece.section.h / 2 };
}

/**
 * Travetti sugli appoggi nei due modi costruttivi (E4). La faccia inferiore
 * di ogni travetto giace sul piano `seat` (asse X locale in salita, Z locale
 * normale al piano):
 * - `bullonata`: semplice appoggio, una vite (`joistScrewFor`) per ogni pezzo
 *   d'appoggio toccato (una per tavola della sandwich, come nelle distinte T-A/T-B);
 * - `carpenteria`: su appoggi con estradosso parallelo al piano (travetto e
 *   trave nello stesso piano di falda) giunto `mezzo-legno` con gli assi alla
 *   stessa quota (travetto abbassato di (h_trv + h_app)/2); su appoggi
 *   inclinati rispetto al travetto `becco-uccello` sullo spigolo a valle
 *   (travetto abbassato di `seatOffset`).
 */
export function joistsOnBeams(_ctx: BuildContext, mode: Construction, o: JoistOptions): JoistResult {
  const n0 = normalize(o.seat.normal);
  const n = n0.z < 0 ? scale(n0, -1) : n0;
  if (n.z < 1e-9) throw new TemplateError(_ctx.slug, "piano d'appoggio dei travetti verticale");
  const zOf = (p: { x: number; y: number }): number =>
    o.seat.point.z - (n.x * (p.x - o.seat.point.x) + n.y * (p.y - o.seat.point.y)) / n.z;
  const steps: BuildStep[] = [];
  const joists: Placed[] = [];
  for (const j of o.joists) {
    let A = vec3(j.from.x, j.from.y, zOf(j.from));
    let B = vec3(j.to.x, j.to.y, zOf(j.to));
    if (B.z < A.z - 1e-9) [A, B] = [B, A]; // asse in salita (becco d'uccello con angolo positivo)
    const X = normalize(sub(B, A));
    const length = norm(sub(B, A));
    const h = j.section.h;
    const resting: Placed = { ref: j.ref, type: o.type ?? "travetto", section: j.section, length, pose: fromBasis(add(A, scale(n, h / 2)), X, n) };
    const touched = o.supports.filter((s) => contactRange(probe(resting), probe(s)) !== undefined);
    if (touched.length === 0) throw new TemplateError(_ctx.slug, `il travetto ${j.ref} non appoggia su alcun supporto`);
    if (mode === "bullonata") {
      // la vite serra anche i pezzi poco sotto il travetto (spigoli di una sandwich inclinata)
      const screwed = o.supports.filter((s) => contactRange(probe(resting), probe(s), SCREW_GAP) !== undefined);
      joists.push(resting);
      steps.push(placeStep(resting), {
        kind: "hardware",
        code: o.screw ?? joistScrewFor(j.section),
        pieces: [j.ref, ...screwed.map((s) => s.ref)],
        params: { count: screwed.length },
      });
      continue;
    }
    const planar = touched.filter((s) => norm(cross(axisOf(s.pose, 2), n)) < 1e-6);
    const edge = touched.filter((s) => !planar.includes(s));
    if (planar.length && edge.length)
      throw new TemplateError(_ctx.slug, `il travetto ${j.ref} ha appoggi complanari e inclinati: unione non supportata`);
    if (planar.length) {
      const hs = new Set(planar.map((s) => s.section.h));
      if (hs.size > 1) throw new TemplateError(_ctx.slug, `il travetto ${j.ref} incrocia appoggi di altezze diverse: mezzo legno non uniforme`);
      const drop = (h + planar[0].section.h) / 2;
      const placed: Placed = { ...resting, pose: fromBasis(add(A, scale(n, h / 2 - drop)), X, n) };
      joists.push(placed);
      steps.push(placeStep(placed), ...planar.map((s): BuildStep => ({ kind: "joint", type: "mezzo-legno", a: s.ref, b: j.ref })));
      continue;
    }
    const slope = radToDeg(Math.asin(Math.min(1, Math.abs(X.z))));
    const drop = seatOffset(slope, edge.map((s) => s.section.b), j.section);
    const placed: Placed = { ...resting, pose: fromBasis(add(A, scale(n, h / 2 - drop)), X, n) };
    joists.push(placed);
    steps.push(placeStep(placed));
    for (const s of edge) {
      const seat = edgeSeat(placed, s);
      if (!seat || seat.depth <= 0.5) continue;
      steps.push({ kind: "machining", target: j.ref, spec: { type: "becco-uccello", face: "inferiore", at: seat.at, depth: seat.depth, angle: slope } });
    }
  }
  return { steps, joists };
}

/* ------------------------------------------------------------------ */
/* Ancoraggi a terra e attacchi a muro                                 */
/* ------------------------------------------------------------------ */

export const GROUND_ANCHORS = ["nessuno", "bicchiere", "lama-interna", "p-greco", "zanca-h"] as const;
export type GroundAnchor = (typeof GROUND_ANCHORS)[number];

const GROUND_PREFIX: Readonly<Record<Exclude<GroundAnchor, "nessuno">, string>> = {
  bicchiere: "staffa-terra-bicchiere-",
  "lama-interna": "staffa-terra-lama-interna-",
  "p-greco": "staffa-terra-p-greco",
  "zanca-h": "staffa-terra-zanca-h",
};

/** Parametro `ancoraggioTerra` (enum di `GROUND_ANCHORS`). */
export const groundAnchorParam = (def: GroundAnchor = "bicchiere", extra: Partial<Omit<EnumParamSpec, "kind" | "name">> = {}): EnumParamSpec => ({
  kind: "enum",
  name: "ancoraggioTerra",
  label: "Ancoraggio a terra",
  options: [
    { value: "nessuno", label: "Nessuno" },
    { value: "bicchiere", label: "Staffa a bicchiere", description: "Su platea, 4 viti 8×40; nessuna lavorazione del piede." },
    { value: "lama-interna", label: "Portapilastro a lama interna", description: "Fresata centrale al piede e 2 fori Ø13." },
    { value: "p-greco", label: "Staffa a P greco", description: "Fori laterali Ø11 al piede." },
    { value: "zanca-h", label: "Zanca ad H da cementare", description: "2 fori passanti Ø13 al piede." },
  ],
  default: def,
  ...extra,
});

/** Codice della staffa a terra per il tipo e la sezione del pilastro; `ParamError` se non a catalogo. */
export function groundAnchorCode(kind: Exclude<GroundAnchor, "nessuno">, section: Section, param = "ancoraggioTerra"): string {
  const prefix = GROUND_PREFIX[kind];
  const spec = hardwareFor("staffa-terra", section).find((s) => s.code.startsWith(prefix));
  if (!spec) throw new ParamError(param, kind, `nessuna staffa a catalogo per pilastri ${sectionLabel(section)}`);
  return spec.code;
}

/** Staffa a terra al piede del pilastro `postRef` (nessuno step per `nessuno`). */
export function groundAnchor(_ctx: BuildContext, kind: GroundAnchor, postRef: string, section: Section): BuildStep[] {
  if (kind === "nessuno") return [];
  return [{ kind: "hardware", code: groundAnchorCode(kind, section), pieces: [postRef], anchor: "piede" }];
}

export const WALL_ATTACHMENTS = ["listoni-paralleli", "staffa-inclinata-15", "staffa-inclinata-25", "scomparsa-17", "banchina"] as const;
export type WallAttachment = (typeof WALL_ATTACHMENTS)[number];

/** Pendenza imposta dalla ferramenta a muro (gradi), `undefined` se libera. */
export const WALL_SLOPE: Readonly<Partial<Record<WallAttachment, number>>> = {
  "staffa-inclinata-15": 15,
  "staffa-inclinata-25": 25,
  "scomparsa-17": 17,
};

/** Distanza del bullone della staffa a listoni paralleli dalla testa a muro (mm). DA VALIDARE CON UFFICIO TECNICO. */
export const WALL_BOLT_DISTANCE = 60;

export interface WallAttachmentOptions {
  /** Pezzi della trave che arrivano al muro: 2 tavole (bullonata) o 1 trave/mensola. */
  readonly beams: readonly Placed[];
  /** Testa dei pezzi verso il muro. */
  readonly face: HeadFace;
  /** Piano della faccia del muro. */
  readonly wall: Plane;
  /** Banchina a muro (solo `banchina`), già posizionata dal template. */
  readonly banchina?: Placed;
  /** Diametro del bullone della staffa a listoni (default 12). */
  readonly boltDiameter?: number;
}

/**
 * Attacco a muro di una trave (E4): teste a filo del piano del muro
 * (`headCutFromPlane`) e, secondo `kind`:
 * - `listoni-paralleli`: staffa con lama tra le 2 tavole + bullone passante
 *   tavola–lama–tavola a `WALL_BOLT_DISTANCE` dalla testa;
 * - `staffa-inclinata-15/25`: staffa (coppia SX/DX) sulla testa a muro;
 * - `scomparsa-17`: supporto con asola per lama e 2 fori nella testa (solo trave singola);
 * - `banchina`: becco d'uccello di ogni pezzo sullo spigolo a valle della banchina
 *   se la trave è inclinata (appoggio semplice se orizzontale).
 */
export function wallAttachment(ctx: BuildContext, kind: WallAttachment, o: WallAttachmentOptions): BuildStep[] {
  const steps: BuildStep[] = o.beams.map((b) => ({ kind: "machining", target: b.ref, spec: headCutFromPlane(b, o.wall, o.face) }));
  const anchor = o.face === "testa-fine" ? "testa" : "piede";
  switch (kind) {
    case "listoni-paralleli": {
      if (o.beams.length !== 2) throw new ParamError("attaccoMuro", kind, "la staffa a listoni paralleli serra una trave doppia (costruzione bullonata)");
      const code = hardwareFor("staffa-muro", o.beams[0].section).find((s) => s.code.startsWith("staffa-muro-listoni-paralleli-"))?.code;
      if (!code) throw new ParamError("attaccoMuro", kind, `nessuna staffa a listoni paralleli per tavole ${sectionLabel(o.beams[0].section)}`);
      const b = o.beams[0];
      const local = transformPlane(invertRigid(b.pose), o.wall);
      const xWall = dot(local.normal, local.point) / local.normal.x; // ascissa dell'asse sul piano del muro
      const at = o.face === "testa-fine" ? xWall - WALL_BOLT_DISTANCE : xWall + WALL_BOLT_DISTANCE;
      steps.push(
        { kind: "hardware", code, pieces: o.beams.map((x) => x.ref), anchor },
        { kind: "hardware", code: BOLT_STEP_CODE, pieces: [o.beams[0].ref, o.beams[1].ref], params: { face: "destra", at, offset: 0, diameter: o.boltDiameter ?? 12 } },
      );
      return steps;
    }
    case "staffa-inclinata-15":
    case "staffa-inclinata-25":
      steps.push({ kind: "hardware", code: kind, pieces: o.beams.map((x) => x.ref), anchor });
      return steps;
    case "scomparsa-17":
      if (o.beams.length !== 1) throw new ParamError("attaccoMuro", kind, "il supporto a scomparsa richiede una trave singola (costruzione carpenteria)");
      steps.push({ kind: "hardware", code: "supporto-scomparsa-17", pieces: [o.beams[0].ref], anchor });
      return steps;
    case "banchina": {
      if (!o.banchina) throw new TemplateError(ctx.slug, "attacco a banchina senza banchina");
      for (const b of o.beams) {
        const X = axisOf(b.pose, 0);
        if (Math.abs(X.z) < 1e-9) continue;
        if (X.z < 0) throw new TemplateError(ctx.slug, `becco d'uccello di ${b.ref}: l'asse deve salire verso la banchina`);
        const seat = edgeSeat(b, o.banchina);
        if (!seat || seat.depth <= 0.5) continue;
        steps.push({
          kind: "machining",
          target: b.ref,
          spec: { type: "becco-uccello", face: "inferiore", at: seat.at, depth: seat.depth, angle: radToDeg(Math.asin(X.z)) },
        });
      }
      return steps;
    }
  }
}
