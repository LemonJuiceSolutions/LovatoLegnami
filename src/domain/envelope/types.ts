import { z } from "zod";
import { parseWith } from "../components/schemas";
import { type AABB, aabb, aabbFromPoints, aabbPenetrationDepth } from "../math/aabb";
import { type OBB, obbAabbPenetration, obbFromAabb, obbVertices } from "../math/obb";
import { vec3 } from "../math/vec3";
import { type EnvelopePlan, PLAN_CORNERS, PLAN_CORNER_LABELS, planIssues, planOf, sideSegment } from "./plan";

/**
 * Ingombro del cliente (spec `ingombro-cliente`, D5): box base L×P×H con
 * origine coincidente con quella dell'assieme (angolo anteriore sinistro, quota
 * pavimento di riferimento 0; X lungo il fronte, Y in profondità verso il
 * muro, Z in alto), ostacoli relativi a un lato e pavimento quotato.
 */

export const SIDES = ["posteriore", "anteriore", "sinistro", "destro", "pavimento", "soffitto"] as const;
export type Side = (typeof SIDES)[number];
export const WALL_SIDES = ["posteriore", "anteriore", "sinistro", "destro"] as const;
export type WallSide = (typeof WALL_SIDES)[number];

export const OBSTACLE_TYPES = ["sottomuro", "finestra", "grondaia", "sporgenza", "generico"] as const;
export type ObstacleType = (typeof OBSTACLE_TYPES)[number];

/** Box base dell'ingombro (mm): `width` lungo X (fronte), `depth` lungo Y, `height` lungo Z. */
export interface EnvelopeBox {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/**
 * Ostacolo come box relativo a un lato. Ogni lato ha un riferimento piano
 * (u, v) e una normale entrante n:
 * - `anteriore` / `posteriore`: u = X da sinistra, v = Z (quota), n = ±Y;
 * - `sinistro` / `destro`: u = Y dal fronte, v = Z (quota), n = ±X;
 * - `pavimento` / `soffitto`: u = X da sinistra, v = Y dal fronte, n = ±Z.
 * `offset`/`width` sono posizione ed estensione lungo u (default: da 0 per
 * tutta la lunghezza del lato), `elevation`/`height` lungo v, `projection`
 * la sporgenza dal piano del lato verso l'interno.
 */
export interface Obstacle {
  readonly id: string;
  readonly type: ObstacleType;
  readonly side: Side;
  readonly label?: string;
  readonly offset: number;
  /** Estensione lungo u; assente = fino alla fine del lato. */
  readonly width?: number;
  readonly elevation: number;
  readonly height: number;
  readonly projection: number;
}

/** Quote del pavimento (mm, positive verso l'alto) agli angoli del box e in punti extra. */
export interface FloorSpec {
  readonly corners: {
    /** (0, 0) */
    readonly frontLeft: number;
    /** (L, 0) */
    readonly frontRight: number;
    /** (0, P) */
    readonly backLeft: number;
    /** (L, P) */
    readonly backRight: number;
  };
  readonly points: readonly { readonly x: number; readonly y: number; readonly z: number }[];
}

export interface Envelope {
  readonly box: EnvelopeBox;
  /** Pianta fuori squadra; assente = rettangolo del box (`planOf`). */
  readonly plan?: EnvelopePlan;
  /** Lato del muro di appoggio per le tipologie addossate (default `posteriore`). */
  readonly wallSide: WallSide;
  readonly obstacles: readonly Obstacle[];
  readonly floor: FloorSpec;
}

/** Sporgenza di default per tipo di ostacolo quando non indicata (mm). */
export const DEFAULT_PROJECTION: Readonly<Record<ObstacleType, number>> = {
  sottomuro: 100,
  finestra: 100,
  grondaia: 150,
  sporgenza: 100,
  generico: 100,
};

/* ------------------------------------------------------------------ */
/* Schemi zod                                                          */
/* ------------------------------------------------------------------ */

const num = (field: string) => z.number({ invalid_type_error: `${field}: deve essere un numero`, required_error: `${field}: obbligatorio` }).finite(`${field}: deve essere finito`);
const positive = (field: string) => num(field).positive(`${field}: deve essere maggiore di 0`);
const nonNegative = (field: string) => num(field).nonnegative(`${field}: deve essere maggiore o uguale a 0`);
const enumOf = <T extends readonly [string, ...string[]]>(values: T, what: string) =>
  z.enum(values, { errorMap: (_i, ctx) => ({ message: `${what} non valido: ${JSON.stringify(ctx.data)} (ammessi: ${values.join(", ")})` }) });

export const EnvelopeBoxSchema = z
  .object({ width: positive("larghezza"), depth: positive("profondità"), height: positive("altezza") })
  .strict();

export const ObstacleSchema = z
  .object({
    id: z.string().min(1, "id mancante"),
    type: enumOf(OBSTACLE_TYPES, "tipo di ostacolo"),
    side: enumOf(SIDES, "lato"),
    label: z.string().optional(),
    offset: num("offset").default(0),
    width: positive("larghezza").optional(),
    elevation: num("quota").default(0),
    height: positive("altezza"),
    projection: positive("sporgenza").optional(),
  })
  .strict()
  .transform((o): Obstacle => ({ ...o, projection: o.projection ?? DEFAULT_PROJECTION[o.type] }));

const floorZ = (field: string) => num(field).default(0);
export const FloorSpecSchema = z
  .object({
    corners: z
      .object({
        frontLeft: floorZ("quota anteriore sinistra"),
        frontRight: floorZ("quota anteriore destra"),
        backLeft: floorZ("quota posteriore sinistra"),
        backRight: floorZ("quota posteriore destra"),
      })
      .strict()
      .default({}),
    points: z.array(z.object({ x: num("x"), y: num("y"), z: num("quota") }).strict()).default([]),
  })
  .strict();

const planPoint = (i: number) => z.object({ x: num(`x dell'angolo ${PLAN_CORNER_LABELS[PLAN_CORNERS[i]]}`), y: num(`y dell'angolo ${PLAN_CORNER_LABELS[PLAN_CORNERS[i]]}`) }).strict();
export const EnvelopePlanSchema = z.object({ corners: z.tuple([planPoint(0), planPoint(1), planPoint(2), planPoint(3)]).readonly() }).strict();

export const EnvelopeSchema = z
  .object({
    box: EnvelopeBoxSchema,
    plan: EnvelopePlanSchema.optional(),
    wallSide: enumOf(WALL_SIDES, "lato muro").default("posteriore"),
    obstacles: z.array(ObstacleSchema).default([]),
    floor: FloorSpecSchema.default({}),
  })
  .strict()
  .superRefine((e, ctx) => {
    const seen = new Set<string>();
    e.obstacles.forEach((o, i) => {
      if (seen.has(o.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["obstacles", i, "id"], message: `id ostacolo duplicato: ${o.id}` });
      seen.add(o.id);
    });
    if (e.plan)
      for (const issue of planIssues(e.plan, e.box))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["plan", "corners", issue.corner], message: issue.message });
  });

/** Input accettato da `parseEnvelope` (campi con default facoltativi). */
export type EnvelopeInput = z.input<typeof EnvelopeSchema>;

/** Valida l'ingombro applicando i default; `ValidationError` con il percorso del campo (es. `box.height`). */
export const parseEnvelope = (data: unknown): Envelope => parseWith(EnvelopeSchema as z.ZodType<Envelope>, data, "ingombro non valido");

/* ------------------------------------------------------------------ */
/* Box assoluti                                                        */
/* ------------------------------------------------------------------ */

/** AABB del box base dell'ingombro (Z da 0 a H). */
export const envelopeAabb = (e: Pick<Envelope, "box">): AABB => aabb(vec3(0, 0, 0), vec3(e.box.width, e.box.depth, e.box.height));

/** Ostacolo convertito nel sistema dell'assieme. */
export interface AbsoluteObstacle {
  readonly obstacleId: string;
  readonly obstacle: Obstacle;
  /**
   * Volume dell'ostacolo: per i lati verticali un box orientato sul lato reale
   * della pianta (u lungo il lato, sporgenza lungo la normale entrante, Z in
   * alto); per pavimento e soffitto, e con pianta rettangolare, allineato agli
   * assi (identico all'AABB di sempre).
   */
  readonly box: OBB;
  /** Box allineato che contiene `box` (impronta per i fattori di cantiere). */
  readonly aabb: AABB;
  /** `true` se l'ostacolo è interamente fuori dal box base: ignorato nelle collisioni. */
  readonly ignored: boolean;
  readonly warning?: string;
}

/** Lunghezza del lato lungo il suo asse u. */
const sideLength = (e: Envelope, side: Side): number => (side === "sinistro" || side === "destro" ? e.box.depth : e.box.width);

/** AABB dell'ostacolo sul box rettangolare (pianta assente). */
function boxAabb(envelope: Envelope, obstacle: Obstacle): AABB {
  const { width: L, depth: P, height: H } = envelope.box;
  const u0 = obstacle.offset;
  const u1 = obstacle.width !== undefined ? u0 + obstacle.width : sideLength(envelope, obstacle.side);
  const v0 = obstacle.elevation;
  const v1 = v0 + obstacle.height;
  const n = obstacle.projection;
  switch (obstacle.side) {
    case "anteriore":
      return aabb(vec3(u0, 0, v0), vec3(u1, n, v1));
    case "posteriore":
      return aabb(vec3(u0, P - n, v0), vec3(u1, P, v1));
    case "sinistro":
      return aabb(vec3(0, u0, v0), vec3(n, u1, v1));
    case "destro":
      return aabb(vec3(L - n, u0, v0), vec3(L, u1, v1));
    case "pavimento":
      return aabb(vec3(u0, v0, 0), vec3(u1, v1, n));
    case "soffitto":
      return aabb(vec3(u0, v0, H - n), vec3(u1, v1, H));
  }
}

/** OBB dell'ostacolo di un lato verticale sul lato reale della pianta. */
function sideObb(envelope: Envelope, obstacle: Obstacle & { side: WallSide }): OBB {
  const s = sideSegment(planOf(envelope), obstacle.side);
  const u0 = obstacle.offset;
  const u1 = obstacle.width !== undefined ? u0 + obstacle.width : s.length;
  const v0 = obstacle.elevation;
  const v1 = v0 + obstacle.height;
  const n = obstacle.projection;
  const um = (u0 + u1) / 2;
  return {
    center: vec3(s.start.x + s.direction.x * um + (s.inward.x * n) / 2, s.start.y + s.direction.y * um + (s.inward.y * n) / 2, (v0 + v1) / 2),
    axes: [vec3(s.direction.x, s.direction.y, 0), vec3(s.inward.x, s.inward.y, 0), vec3(0, 0, 1)],
    halfSize: vec3((u1 - u0) / 2, n / 2, (v1 - v0) / 2),
  };
}

const isWallSide = (side: Side): side is WallSide => (WALL_SIDES as readonly Side[]).includes(side);

/**
 * Volume assoluto dell'ostacolo nel sistema dell'assieme, per i 6 lati. Senza
 * pianta (o per pavimento/soffitto) è l'AABB sul box; con la pianta gli
 * ostacoli dei lati verticali seguono il lato reale (OBB). Un ostacolo
 * interamente fuori dal box base è marcato `ignored` con l'avviso "ostacolo
 * fuori ingombro".
 */
export function toAbsoluteBox(envelope: Envelope, obstacle: Obstacle): AbsoluteObstacle {
  let box: OBB;
  let bounds: AABB;
  let ignored: boolean;
  if (envelope.plan && isWallSide(obstacle.side)) {
    box = sideObb(envelope, { ...obstacle, side: obstacle.side });
    bounds = aabbFromPoints(obbVertices(box));
    ignored = obbAabbPenetration(box, envelopeAabb(envelope)) <= 0;
  } else {
    bounds = boxAabb(envelope, obstacle);
    box = obbFromAabb(bounds);
    // fuori ingombro: nessuna sovrapposizione di volume col box base
    ignored = aabbPenetrationDepth(bounds, envelopeAabb(envelope)) <= 0;
  }
  return {
    obstacleId: obstacle.id,
    obstacle,
    box,
    aabb: bounds,
    ignored,
    ...(ignored ? { warning: `ostacolo fuori ingombro: ${obstacle.id} è interamente fuori dal box base e viene ignorato` } : {}),
  };
}

/** Tutti gli ostacoli dell'ingombro come box assoluti, nell'ordine dato. */
export const absoluteObstacles = (envelope: Envelope): AbsoluteObstacle[] => envelope.obstacles.map((o) => toAbsoluteBox(envelope, o));
