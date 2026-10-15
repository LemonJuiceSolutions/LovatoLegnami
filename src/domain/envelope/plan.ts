import { type Plane, plane } from "../math/plane";
import { vec3 } from "../math/vec3";
import type { Envelope, EnvelopeBox, WallSide } from "./types";

/**
 * Pianta quadrilatera dell'ingombro (P4, spec `ingombro-cliente` – fuorisquadra).
 * Sistema dell'assieme: X lungo il fronte, Y in profondità verso il muro; la
 * pianta di default è il rettangolo del box `[0, L] × [0, P]`.
 */

/** Punto in pianta (mm, sistema dell'assieme). */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** Angoli della pianta, in ordine antiorario. */
export const PLAN_CORNERS = ["anterioreSinistro", "anterioreDestro", "posterioreDestro", "posterioreSinistro"] as const;
export type PlanCorner = (typeof PLAN_CORNERS)[number];
export const PLAN_CORNER_LABELS: Readonly<Record<PlanCorner, string>> = {
  anterioreSinistro: "anteriore sinistro",
  anterioreDestro: "anteriore destro",
  posterioreDestro: "posteriore destro",
  posterioreSinistro: "posteriore sinistro",
};

/**
 * Pianta fuori squadra: i quattro angoli in ordine antiorario (anteriore
 * sinistro, anteriore destro, posteriore destro, posteriore sinistro).
 * Convessa, lati > 0, con il box come rettangolo contenitore (origine
 * nell'angolo minimo, tolleranza 1 mm).
 */
export interface EnvelopePlan {
  readonly corners: readonly [Vec2, Vec2, Vec2, Vec2];
}

/** Pianta sempre definita (il rettangolo del box se l'ingombro non ne dichiara una). */
export type Plan = EnvelopePlan;

/** Tolleranza tra pianta e box (mm). */
export const PLAN_BOX_TOLERANCE = 1;

/** Lati della pianta in ordine antiorario: lato i = angolo i → angolo i+1. */
const CCW_SIDES: readonly WallSide[] = ["anteriore", "destro", "posteriore", "sinistro"];
const SIDE_EDGE: Readonly<Record<WallSide, number>> = { anteriore: 0, destro: 1, posteriore: 2, sinistro: 3 };

const sub2 = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const cross2 = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
const len2 = (a: Vec2): number => Math.hypot(a.x, a.y);
const deg = (rad: number): number => (rad * 180) / Math.PI + 0;

/** Rettangolo del box come pianta. */
export const rectanglePlan = (box: Pick<EnvelopeBox, "width" | "depth">): Plan => ({
  corners: [
    { x: 0, y: 0 },
    { x: box.width, y: 0 },
    { x: box.width, y: box.depth },
    { x: 0, y: box.depth },
  ],
});

/** Pianta dell'ingombro: quella dichiarata o il rettangolo del box. */
export const planOf = (envelope: Pick<Envelope, "box" | "plan">): Plan => envelope.plan ?? rectanglePlan(envelope.box);

/** Rettangolo che contiene la pianta. */
export function planBounds(plan: Plan): { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number } {
  const xs = plan.corners.map((c) => c.x);
  const ys = plan.corners.map((c) => c.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Box (larghezza, profondità) che contiene la pianta; l'altezza è quella data. */
export function boxOfPlan(plan: Plan, height: number): EnvelopeBox {
  const b = planBounds(plan);
  return { width: b.maxX, depth: b.maxY, height };
}

export interface PlanIssue {
  /** Indice dell'angolo (0..3) a cui si riferisce il problema. */
  readonly corner: number;
  readonly message: string;
}

const fmt = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");

/**
 * Problemi di validità della pianta rispetto al box: lati di lunghezza nulla,
 * angoli rientranti (pianta non convessa o in senso orario) e rettangolo
 * contenitore diverso dal box oltre `PLAN_BOX_TOLERANCE`. Ogni problema cita
 * l'angolo. Elenco vuoto = pianta valida.
 */
export function planIssues(plan: Plan, box: Pick<EnvelopeBox, "width" | "depth">): PlanIssue[] {
  const c = plan.corners;
  const out: PlanIssue[] = [];
  const name = (i: number) => PLAN_CORNER_LABELS[PLAN_CORNERS[i]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    if (len2(sub2(c[j], c[i])) < 1e-6) out.push({ corner: j, message: `lato ${CCW_SIDES[i]} di lunghezza nulla (angoli ${name(i)} e ${name(j)} coincidenti)` });
  }
  if (out.length) return out;
  for (let i = 0; i < 4; i++) {
    const a = sub2(c[i], c[(i + 3) % 4]);
    const b = sub2(c[(i + 1) % 4], c[i]);
    // convessa e antioraria: ogni svolta a sinistra (prodotto vettoriale > 0)
    if (cross2(a, b) <= 1e-9 * len2(a) * len2(b))
      out.push({ corner: i, message: `angolo ${name(i)} rientrante: la pianta deve essere un quadrilatero convesso con gli angoli in ordine antiorario` });
  }
  if (out.length) return out;
  const extreme = (key: "x" | "y", pick: (a: number, b: number) => boolean): number =>
    c.reduce((best, p, i) => (pick(p[key], c[best][key]) ? i : best), 0);
  const checks: [number, "x" | "y", number, string][] = [
    [extreme("x", (a, b) => a < b), "x", 0, "partire da x = 0"],
    [extreme("y", (a, b) => a < b), "y", 0, "partire da y = 0"],
    [extreme("x", (a, b) => a > b), "x", box.width, `arrivare alla larghezza del box (${fmt(box.width)} mm)`],
    [extreme("y", (a, b) => a > b), "y", box.depth, `arrivare alla profondità del box (${fmt(box.depth)} mm)`],
  ];
  for (const [i, key, expected, what] of checks)
    if (Math.abs(c[i][key] - expected) > PLAN_BOX_TOLERANCE)
      out.push({ corner: i, message: `angolo ${name(i)} a ${key} = ${fmt(c[i][key])} mm: la pianta deve ${what}, il box è il rettangolo che la contiene` });
  return out;
}

/** Segmento del lato nel verso della coordinata `u` degli ostacoli (fronte/muro da sinistra, fianchi dal fronte). */
export interface SideSegment {
  readonly start: Vec2;
  readonly end: Vec2;
  readonly length: number;
  /** Versore da `start` a `end`. */
  readonly direction: Vec2;
  /** Normale orizzontale verso l'interno della pianta. */
  readonly inward: Vec2;
}

/** Lato verticale della pianta come segmento (verso degli ostacoli) con normale entrante. */
export function sideSegment(plan: Plan, side: WallSide): SideSegment {
  const c = plan.corners;
  const [start, end] =
    side === "anteriore" ? [c[0], c[1]] : side === "posteriore" ? [c[3], c[2]] : side === "sinistro" ? [c[0], c[3]] : [c[1], c[2]];
  const d = sub2(end, start);
  const length = len2(d);
  const direction = { x: d.x / length, y: d.y / length };
  // normale entrante: a sinistra del lato percorso in senso antiorario
  const i = SIDE_EDGE[side];
  const e = sub2(c[(i + 1) % 4], c[i]);
  const el = len2(e);
  const inward = { x: -e.y / el + 0, y: e.x / el + 0 };
  return { start, end, length, direction, inward };
}

/** Piano verticale del lato (sistema dell'assieme) con normale verso l'interno della pianta. */
export function sidePlane(envelope: Pick<Envelope, "box" | "plan">, side: WallSide): Plane {
  const s = sideSegment(planOf(envelope), side);
  return plane(vec3(s.start.x, s.start.y, 0), vec3(s.inward.x, s.inward.y, 0));
}

/** Piano del muro (`envelope.wallSide`), normale verso l'interno. */
export const wallPlane = (envelope: Pick<Envelope, "box" | "plan" | "wallSide">): Plane => sidePlane(envelope, envelope.wallSide);

export interface PlanDeviations {
  /**
   * Rotazione con segno (gradi, antioraria positiva) di ogni lato rispetto al
   * lato corrispondente del rettangolo: fronte e muro rispetto a +X, fianchi
   * rispetto a +Y (nel verso di `sideSegment`).
   */
  readonly sides: Readonly<Record<WallSide, number>>;
  /** Angolo interno − 90° per ogni angolo (gradi, con segno). */
  readonly corners: Readonly<Record<PlanCorner, number>>;
  /** Massima deviazione assoluta di un angolo da 90°. */
  readonly maxCornerDeg: number;
}

/** Deviazioni dallo squadro della pianta (0 per il rettangolo). */
export function planDeviations(plan: Plan): PlanDeviations {
  const c = plan.corners;
  const sides = {} as Record<WallSide, number>;
  for (const side of CCW_SIDES) {
    const d = sideSegment(plan, side).direction;
    sides[side] = side === "anteriore" || side === "posteriore" ? deg(Math.atan2(d.y, d.x)) : deg(Math.atan2(-d.x, d.y));
  }
  const corners = {} as Record<PlanCorner, number>;
  let maxCornerDeg = 0;
  PLAN_CORNERS.forEach((name, i) => {
    const a = sub2(c[(i + 3) % 4], c[i]);
    const b = sub2(c[(i + 1) % 4], c[i]);
    const cos = (a.x * b.x + a.y * b.y) / (len2(a) * len2(b));
    const dev = deg(Math.acos(Math.max(-1, Math.min(1, cos)))) - 90 + 0;
    corners[name] = dev;
    maxCornerDeg = Math.max(maxCornerDeg, Math.abs(dev));
  });
  return { sides, corners, maxCornerDeg };
}

/** Sforamento di un punto dalla pianta: lato più violato e distanza con segno (> 0 fuori, ≤ 0 dentro). */
export interface PlanPenetration {
  readonly side: WallSide;
  readonly depth: number;
}

/** Ordine dei lati nei pareggi (lo stesso del controllo collisioni). */
const PENETRATION_ORDER: readonly WallSide[] = ["sinistro", "destro", "anteriore", "posteriore"];

/** Distanza del punto oltre ciascun lato (> 0 fuori), nell'ordine sinistro, destro, anteriore, posteriore. */
export function sideExcesses(plan: Plan, p: Vec2): [WallSide, number][] {
  return PENETRATION_ORDER.map((side) => {
    const s = sideSegment(plan, side);
    return [side, -(s.inward.x * (p.x - s.start.x) + s.inward.y * (p.y - s.start.y))];
  });
}

/** Lato più violato e distanza con segno del punto dalla pianta. */
export function planPenetration(plan: Plan, p: Vec2): PlanPenetration {
  const [side, depth] = sideExcesses(plan, p).reduce((a, b) => (b[1] > a[1] ? b : a));
  return { side, depth };
}

/** Il punto è nella pianta (bordo incluso) entro `tol` mm. */
export const pointInPlan = (plan: Plan, p: Vec2, tol = 0): boolean => planPenetration(plan, p).depth <= tol;
