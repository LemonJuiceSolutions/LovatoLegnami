import { addMachining } from "../components/machinings";
import type { HardwareItem, HardwareKind, LateralFace, MachiningSpec, Piece } from "../components/types";
import { arcFrame } from "../math/arc";
import { applyToPoint, applyToVector, fromBasis, invertRigid, multiply, rotationZ, type Mat4 } from "../math/mat4";
import { type Vec3, add, cross, dot, norm, normalize, scale, sub, vec3 } from "../math/vec3";
import { findHardware, hardwareFor } from "./catalog";
import { HardwareError } from "./errors";
import { HARDWARE_FAMILY_OF } from "./ids";
import type { HardwareAnchor, HardwareSpec, HoleFeature, JointNodeSpec } from "./types";

/**
 * Espansione della ferramenta in lavorazioni sui pezzi di legno e in voci
 * dell'elenco ferramenta (E3). Funzioni pure: restituiscono nuovi pezzi.
 */

/** Margine tra spessore serrato e lunghezza del bullone (dado + rondelle), mm. DA VALIDARE CON UFFICIO TECNICO. */
export const BOLT_MARGIN = 20;

/** Gioco del foro rispetto al diametro del bullone (mm): Ø12 → foro Ø13. DA VALIDARE CON UFFICIO TECNICO. */
export const BOLT_HOLE_CLEARANCE = 1;

/**
 * Bullone passante: asse perpendicolare alla faccia `face` del primo pezzo
 * nel punto (`at`, `offset`) (convenzione del `foro`: `offset` lungo Z per
 * sinistra/destra, lungo Y per superiore/inferiore), diretto verso l'interno.
 * `pieces` = id dei pezzi attraversati, il primo è quello di partenza.
 */
export interface BoltStep {
  /** Id della voce di ferramenta (`BUL-nn`), assegnato da chi espande. */
  readonly id: string;
  readonly pieces: readonly string[];
  readonly face: LateralFace;
  readonly at: number;
  readonly offset: number;
  /** Diametro nominale del bullone (mm). */
  readonly diameter: number;
}

export interface HardwareExpansion {
  /** Elenco completo dei pezzi (stesso ordine), con le lavorazioni indotte. */
  readonly pieces: Piece[];
  /** Voce principale (bullone, staffa, giunto, cuspide). */
  readonly item: HardwareItem;
  /**
   * Voci collegate: accessori singoli (es. piastre di una cuspide, id definitivi)
   * e conteggi di viti/tasselli con id provvisorio `<FAM>:<codice>`, fusi e
   * numerati da `mergeHardware`.
   */
  readonly extras: HardwareItem[];
}

/** Generatore degli id di ferramenta (sottoinsieme di `IdGenerator`). */
export interface HardwareIds {
  nextHardware(kind: HardwareKind): string;
}

/** Id provvisorio di un conteggio di viti/tasselli: `<FAM>:<codice>` (es. `VIT:vite-8x40`). */
export const countId = (code: string): string => `${HARDWARE_FAMILY_OF[findHardware(code).kind]}:${code}`;

/** `true` per i tipi conteggiati (una voce per codice, senza posa). */
export const isCountedKind = (kind: HardwareKind): boolean => kind === "vite" || kind === "tassello";

/** Voce di conteggio (viti/tasselli) per `count` pezzi collegati a `pieceIds`. */
export function countItem(code: string, count: number, pieceIds: readonly string[]): HardwareItem {
  const spec = findHardware(code);
  return {
    id: countId(code),
    code,
    kind: spec.kind,
    description: spec.name,
    quantity: count,
    pieceIds: [...pieceIds],
    machiningIds: [],
    params: {},
  };
}

/** Conteggi delle viti dichiarate dalla voce, moltiplicati per `times`. */
const screwItems = (spec: HardwareSpec, pieceIds: readonly string[], times = 1): HardwareItem[] =>
  (spec.screws ?? []).map((sc) => countItem(sc.code, sc.count * times, pieceIds));

/** Normale uscente e componente trasversale (`offset`) di una faccia laterale, nel locale. */
const FACE_FRAMES: Readonly<Record<LateralFace, { n: Vec3; across: "y" | "z" }>> = {
  superiore: { n: vec3(0, 0, 1), across: "y" },
  inferiore: { n: vec3(0, 0, -1), across: "y" },
  sinistra: { n: vec3(0, 1, 0), across: "z" },
  destra: { n: vec3(0, -1, 0), across: "z" },
};

const fmt = (n: number): string => String(Math.round(n * 10) / 10).replace(".", ",");

interface Crossing {
  /** Parametri d'ingresso e uscita lungo la retta del bullone (mm, direzione unitaria). */
  readonly t0: number;
  readonly t1: number;
  readonly face: LateralFace;
  readonly at: number;
  readonly offset: number;
}

/** Faccia laterale con normale uscente opposta a `d` (locale), se `d` è perpendicolare a una faccia. */
function entryFace(d: Vec3): LateralFace | undefined {
  for (const [face, { n }] of Object.entries(FACE_FRAMES) as [LateralFace, (typeof FACE_FRAMES)[LateralFace]][])
    if (dot(n, d) < -1 + 1e-6) return face;
  return undefined;
}

/**
 * Attraversamento della retta `o + t·d` (sistema assieme, `d` unitario) con il
 * pezzo: intervallo del box (pezzi dritti, metodo delle lastre) oppure dello
 * spessore lungo Y alla coordinata curvilinea del punto (pezzi curvi).
 * `undefined` se il pezzo non è attraversato.
 */
function crossing(p: Piece, o: Vec3, d: Vec3, boltId: string, code: string): Crossing | undefined {
  const inv = invertRigid(p.pose);
  const lo = applyToPoint(inv, o);
  const ld = applyToVector(inv, d);
  const { b, h } = p.section;
  const face = entryFace(ld);
  if (!face)
    throw new HardwareError(code, `l'asse del bullone non è perpendicolare a una faccia laterale del pezzo ${p.id}`, boltId);
  const axis = face === "sinistra" || face === "destra" ? "y" : "z";
  const half = axis === "y" ? b / 2 : h / 2;
  // ingresso e uscita sui due piani della faccia (la retta è perpendicolare)
  const c = axis === "y" ? lo.y : lo.z;
  const v = axis === "y" ? ld.y : ld.z;
  const ta = (half - c) / v;
  const tb = (-half - c) / v;
  const t0 = Math.min(ta, tb);
  const t1 = Math.max(ta, tb);
  const q = add(lo, scale(ld, t0)); // punto d'ingresso (locale)
  if (p.curve) {
    if (axis !== "y") throw new HardwareError(code, `sul pezzo curvo ${p.id} il bullone deve attraversare le facce laterali sinistra/destra`, boltId);
    const R = p.curve.radius;
    const theta = Math.atan2(q.x, R - q.z);
    const r = Math.hypot(q.x, R - q.z);
    const at = R * theta;
    const offset = R - r;
    if (theta < 0 || at > p.length || Math.abs(offset) > h / 2) return undefined;
    return { t0, t1, face, at, offset };
  }
  const offset = axis === "y" ? q.z : q.y;
  const crossAxis = axis === "y" ? h / 2 : b / 2;
  if (q.x < 0 || q.x > p.length || Math.abs(offset) > crossAxis) return undefined;
  return { t0, t1, face, at: q.x, offset };
}

/** Bullone più corto a catalogo con il diametro dato e lunghezza ≥ `grip + BOLT_MARGIN`. */
export function boltFor(diameter: number, grip: number, boltId?: string): HardwareSpec {
  const candidates = hardwareFor("bullone")
    .filter((s) => s.diameter === diameter)
    .sort((a, b) => a.length! - b.length!);
  const spec = candidates.find((s) => s.length! >= grip + BOLT_MARGIN - 1e-6);
  if (!spec)
    throw new HardwareError(
      `bullone-m${diameter}`,
      `nessun bullone M${diameter} a catalogo per uno spessore di ${fmt(grip)} mm (servono ${fmt(grip + BOLT_MARGIN)} mm; disponibili: ${candidates.map((s) => s.length).join(", ") || "nessuno"})`,
      boltId,
    );
  return spec;
}

/**
 * Bullone passante su più strati (spec `ferramenta-e-ancoraggi`): retta
 * dell'asse dal punto sulla faccia del primo pezzo, un `foro` passante Ø
 * `diameter + 1` su ogni pezzo dichiarato (faccia d'ingresso, `at` e `offset`
 * locali, `jointId` = id del bullone) e una voce `bullone` con la lunghezza di
 * catalogo minima ≥ spessore serrato + `BOLT_MARGIN`. Un pezzo dichiarato e
 * non attraversato → `HardwareError` con pezzo e bullone.
 */
export function expandBolt(step: BoltStep, pieces: readonly Piece[]): HardwareExpansion {
  const code = `bullone-m${step.diameter}`;
  if (step.pieces.length === 0) throw new HardwareError(code, "nessun pezzo da attraversare", step.id);
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const declared = step.pieces.map((id) => {
    const p = byId.get(id);
    if (!p) throw new HardwareError(code, `pezzo ${id} non trovato`, step.id);
    return p;
  });
  if (new Set(step.pieces).size !== step.pieces.length) throw new HardwareError(code, "pezzo ripetuto nell'elenco", step.id);

  // asse del bullone nel sistema assieme
  const first = declared[0];
  const ff = FACE_FRAMES[step.face];
  const { b, h } = first.section;
  const dist = ff.across === "z" ? b / 2 : h / 2;
  let localStart = add(scale(ff.n, dist), ff.across === "z" ? vec3(step.at, 0, step.offset) : vec3(step.at, step.offset, 0));
  if (first.curve) {
    // pezzo curvo: punto della sezione alla coordinata curvilinea `at` (solo facce sinistra/destra)
    if (ff.across !== "z") throw new HardwareError(code, `sul pezzo curvo ${first.id} il bullone deve partire da sinistra/destra`, step.id);
    localStart = applyToPoint(arcFrame(first.curve.radius, step.at), vec3(0, ff.n.y * dist, step.offset));
  }
  const o = applyToPoint(first.pose, localStart);
  const d = normalize(applyToVector(first.pose, scale(ff.n, -1)));

  const crossings = declared.map((p) => {
    const c = crossing(p, o, d, step.id, code);
    if (!c) throw new HardwareError(code, `il pezzo ${p.id} non è attraversato dall'asse del bullone ${step.id}`, step.id);
    return c;
  });
  const tStart = Math.min(...crossings.map((c) => c.t0));
  const tEnd = Math.max(...crossings.map((c) => c.t1));
  const grip = tEnd - tStart;
  const spec = boltFor(step.diameter, grip, step.id);

  const machiningIds: string[] = [];
  const updated = new Map<string, Piece>();
  declared.forEach((p, i) => {
    const c = crossings[i];
    const np = addMachining(p, {
      type: "foro",
      face: c.face,
      at: c.at,
      offset: c.offset,
      diameter: step.diameter + BOLT_HOLE_CLEARANCE,
      jointId: step.id,
    });
    machiningIds.push(np.machinings[np.machinings.length - 1].id);
    updated.set(p.id, np);
  });

  // posa: origine all'ingresso, X lungo l'asse del bullone
  const helper = Math.abs(d.z) < 0.9 ? vec3(0, 0, 1) : vec3(1, 0, 0);
  const z = normalize(cross(cross(d, helper), d));
  const pose: Mat4 = fromBasis(add(o, scale(d, tStart)), d, z);
  const item: HardwareItem = {
    id: step.id,
    code: spec.code,
    kind: "bullone",
    description: spec.name,
    quantity: 1,
    pose,
    dims: spec.dims,
    pieceIds: [...step.pieces],
    machiningIds,
    params: { diameter: step.diameter, length: spec.length!, grip },
  };
  return { pieces: pieces.map((p) => updated.get(p.id) ?? p), item, extras: [] };
}

// ---------------------------------------------------------------------------
// Staffe e supporti

/**
 * Staffa a muro/a terra o supporto applicato a un pezzo. `anchor` (default
 * quello della voce) sceglie il riferimento dello schema di foratura: `piede` =
 * testa iniziale, `testa` = testa finale, `faccia` = punto `at` dell'asse.
 */
export interface BracketStep {
  readonly id: string;
  readonly code: string;
  readonly piece: string;
  readonly anchor?: HardwareAnchor;
  /** Solo con `anchor: "faccia"`: posizione lungo l'asse del pezzo (mm). */
  readonly at?: number;
}

export interface BracketExpansion extends HardwareExpansion {
  /** Il pezzo con le lavorazioni indotte. */
  readonly piece: Piece;
}

/** Lavorazione del pezzo corrispondente a un elemento dello schema di foratura. */
function featureSpec(f: HoleFeature, piece: Piece, anchor: HardwareAnchor, origin: number, id: string, code: string): MachiningSpec {
  const L = piece.length;
  if (f.kind === "asola") {
    if (anchor === "faccia") throw new HardwareError(code, "un'asola per lama richiede l'attacco su una testa (piede o testa)", id);
    return {
      type: "asola-lama",
      face: anchor === "piede" ? "testa-inizio" : "testa-fine",
      at: anchor === "piede" ? 0 : L,
      width: f.width,
      height: f.height,
      depth: f.depth,
      ...(f.offset !== undefined ? { offset: f.offset } : {}),
      jointId: id,
    };
  }
  const at = anchor === "testa" ? L - f.along : origin + f.along;
  return {
    type: "foro",
    face: f.axis === "y" ? "sinistra" : "superiore",
    at,
    offset: f.offset,
    diameter: f.diameter,
    ...(f.depth !== undefined ? { depth: f.depth } : {}),
    jointId: id,
  };
}

/** Posa della ferramenta nel punto d'attacco, con X verso l'interno del pezzo. */
function anchorPose(piece: Piece, anchor: HardwareAnchor, at: number): Mat4 {
  const x = anchor === "testa" ? piece.length : anchor === "piede" ? 0 : at;
  const frame = piece.curve ? arcFrame(piece.curve.radius, x) : fromBasis(vec3(x, 0, 0), vec3(1, 0, 0), vec3(0, 0, 1));
  // sulla testa finale la ferramenta guarda verso l'interno: rotazione di 180° attorno a Z
  return multiply(piece.pose, anchor === "testa" ? multiply(frame, rotationZ(Math.PI)) : frame);
}

/**
 * Staffa o supporto (spec `ferramenta-e-ancoraggi`): lo schema di fori/asole
 * della voce è tradotto in lavorazioni nel locale del pezzo in base al punto
 * d'attacco (`jointId` = id della staffa); le viti/tasselli della voce sono
 * conteggiati in `extras`. Le staffe senza schema (bicchiere) non lavorano il
 * legno. L'angolo imposto della voce è riportato in `item.params.angle`.
 */
export function expandBracket(step: BracketStep, piece: Piece): BracketExpansion {
  const spec = findHardware(step.code);
  if (piece.id !== step.piece) throw new HardwareError(step.code, `pezzo ${step.piece} atteso, ricevuto ${piece.id}`, step.id);
  const { b, h } = piece.section;
  if (spec.forSections && !spec.forSections.some((f) => (f.b === b && f.h === h) || (f.b === h && f.h === b)))
    throw new HardwareError(
      step.code,
      `sezione ${b}×${h} del pezzo ${piece.id} non compatibile (ammesse: ${spec.forSections.map((f) => `${f.b}×${f.h}`).join(", ")})`,
      step.id,
    );
  const anchor = step.anchor ?? spec.holes?.anchor ?? "piede";
  if (anchor === "faccia" && step.at === undefined) throw new HardwareError(step.code, "attacco su faccia senza posizione at", step.id);
  const origin = anchor === "faccia" ? step.at! : 0;
  let p = piece;
  const machiningIds: string[] = [];
  for (const f of spec.holes?.features ?? []) {
    try {
      p = addMachining(p, featureSpec(f, p, anchor, origin, step.id, step.code));
    } catch (e) {
      if (e instanceof HardwareError) throw e;
      throw new HardwareError(step.code, `applicazione al pezzo ${piece.id} impossibile: ${(e as Error).message}`, step.id);
    }
    machiningIds.push(p.machinings[p.machinings.length - 1].id);
  }
  const item: HardwareItem = {
    id: step.id,
    code: spec.code,
    kind: spec.kind,
    description: spec.name,
    quantity: 1,
    pose: anchorPose(piece, anchor, origin),
    dims: spec.dims,
    pieceIds: [piece.id],
    machiningIds,
    params: { anchor, ...(spec.angle !== undefined ? { angle: spec.angle } : {}) },
  };
  return { piece: p, pieces: [p], item, extras: screwItems(spec, [piece.id]) };
}

// ---------------------------------------------------------------------------
// Giunti a N vie e cuspidi

/** Distanza massima (mm) tra il centro del nodo e la testa di un'asta che vi converge. DA VALIDARE CON UFFICIO TECNICO. */
export const NODE_REACH = 400;

/**
 * Nodo metallico: giunto a N vie (voce scelta dal numero di vie, dalla
 * sezione e dall'angolo, oppure indicata da `code`) o cuspide (`code`
 * obbligatorio). `pieces` = aste che convergono nel nodo `point`.
 */
export interface JointNodeStep {
  readonly id: string;
  readonly point: Vec3;
  readonly pieces: readonly string[];
  readonly code?: string;
  /** Linea dei giunti quando la voce è scelta automaticamente: JOINT (default) o zincati. */
  readonly line?: "joint" | "zincato";
}

export interface NodeWays {
  readonly ways: number;
  readonly layout: JointNodeSpec["layout"];
  /** Angolo tra l'asta verticale e le altre (75, 90 o 105), 90 se non c'è un'asta verticale. */
  readonly angle: 75 | 90 | 105;
  /** Direzioni uscenti dal nodo (versori). */
  readonly directions: readonly Vec3[];
}

/** Direzioni uscenti dal nodo per un'asta: 1 se vi termina, 2 se lo attraversa. */
function waysOf(p: Piece, point: Vec3, id: string, code: string): Vec3[] {
  const o = applyToPoint(p.pose, vec3(0, 0, 0));
  const ax = applyToVector(p.pose, vec3(1, 0, 0));
  const s = dot(sub(point, o), ax);
  const off = norm(sub(sub(point, o), scale(ax, s)));
  if (off > NODE_REACH || s < -NODE_REACH || s > p.length + NODE_REACH)
    throw new HardwareError(code, `l'asta ${p.id} non converge nel nodo`, id);
  if (s <= NODE_REACH) return [ax];
  if (s >= p.length - NODE_REACH) return [scale(ax, -1)];
  return [ax, scale(ax, -1)];
}

/** Vie del nodo derivate dalle aste che vi convergono (spec: "numero di vie derivato"). */
export function nodeWays(point: Vec3, pieces: readonly Piece[], id = "", code = "giunto"): NodeWays {
  const directions = pieces.flatMap((p) => waysOf(p, point, id, code));
  const ways = directions.length;
  let layout: NodeWays["layout"];
  if (ways === 2) layout = "2";
  else if (ways === 3) {
    const collinear = directions.some((a, i) => directions.some((b, j) => j > i && dot(a, b) < -1 + 1e-3));
    layout = collinear ? "3L" : "3A";
  } else if (ways === 4) layout = "4";
  else if (ways === 5) layout = "5";
  else throw new HardwareError(code, `${ways} vie nel nodo: ammessi giunti da 2 a 5 vie`, id);
  // angolo tra l'asta verticale (verso il basso) e le altre aste
  const down = directions.find((d) => d.z < -1 + 1e-3);
  let angle: NodeWays["angle"] = 90;
  if (down) {
    const others = directions.filter((d) => d !== down && Math.abs(d.z) < 1 - 1e-3);
    const degs = others.map((d) => (Math.acos(Math.max(-1, Math.min(1, dot(d, down)))) * 180) / Math.PI);
    const off = degs.reduce((best, a) => (Math.abs(a - 90) > Math.abs(best - 90) ? a : best), 90);
    angle = Math.abs(off - 75) < 2 ? 75 : Math.abs(off - 105) < 2 ? 105 : 90;
  }
  return { ways, layout, angle, directions };
}

const ANGLE_TOL_DEG = 2;

/**
 * Giunto metallico a N vie o cuspide (spec `ferramenta-e-ancoraggi`): vie
 * derivate dalle aste convergenti, voce di catalogo scelta per vie, sezione e
 * angolo (o verificata se indicata da `code`), viti della voce in `extras`.
 * Le cuspidi richiedono tante aste quante falde e aggiungono gli accessori
 * (piastre di testa) come voci singole con id da `ids`. Nessuna lavorazione:
 * le aste sono tagliate a squadra dal template (lunghezza netta).
 */
export function expandJointNode(step: JointNodeStep, pieces: readonly Piece[], ids?: HardwareIds): HardwareExpansion {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const label = step.code ?? "giunto";
  const members = step.pieces.map((id) => {
    const p = byId.get(id);
    if (!p) throw new HardwareError(label, `pezzo ${id} non trovato`, step.id);
    return p;
  });
  if (members.length === 0) throw new HardwareError(label, "nessuna asta nel nodo", step.id);
  let spec: HardwareSpec;
  const params: Record<string, number | string> = {};
  const given = step.code ? findHardware(step.code) : undefined;
  if (given?.kind === "cuspide") {
    spec = given;
    if (members.length !== spec.slopes)
      throw new HardwareError(spec.code, `la cuspide a ${spec.slopes} falde richiede ${spec.slopes} aste, ricevute ${members.length}`, step.id);
    params.slopes = spec.slopes!;
    params.angle = spec.angle!;
  } else {
    const w = nodeWays(step.point, members, step.id, label);
    const section = members[0].section;
    if (given) {
      if (given.kind !== "giunto-vie" || !given.joint) throw new HardwareError(given.code, "la voce non è un giunto o una cuspide", step.id);
      if (given.joint.ways !== w.ways)
        throw new HardwareError(given.code, `giunto a ${given.joint.ways} vie ma nel nodo convergono ${w.ways} vie`, step.id);
      spec = given;
    } else {
      const prefix = (step.line ?? "joint") === "joint" ? "giunto-joint-" : "giunto-";
      const candidates = hardwareFor("giunto-vie", section).filter(
        (s) =>
          s.code.startsWith(prefix) &&
          (prefix === "giunto-" ? !s.code.startsWith("giunto-joint-") && !s.code.startsWith("giunto-gazebo-") : true) &&
          s.joint?.layout === w.layout &&
          Math.abs((s.angle ?? 90) - w.angle) < ANGLE_TOL_DEG,
      );
      if (candidates.length === 0)
        throw new HardwareError(
          `giunto-${w.layout.toLowerCase()}`,
          `nessun giunto ${w.layout} a ${w.angle}° per la sezione ${section.b}×${section.h} nella linea ${step.line ?? "joint"}`,
          step.id,
        );
      spec = candidates[0];
    }
    params.ways = w.ways;
    params.layout = w.layout;
    params.angle = w.angle;
  }
  const item: HardwareItem = {
    id: step.id,
    code: spec.code,
    kind: spec.kind,
    description: spec.name,
    quantity: 1,
    pose: fromBasis(step.point, vec3(1, 0, 0), vec3(0, 0, 1)),
    dims: spec.dims,
    pieceIds: [...step.pieces],
    machiningIds: [],
    params,
  };
  const extras: HardwareItem[] = [];
  for (const acc of spec.accessories ?? []) {
    const accSpec = findHardware(acc.code);
    if (isCountedKind(accSpec.kind)) {
      extras.push(countItem(acc.code, acc.count, step.pieces));
      continue;
    }
    if (!ids) throw new HardwareError(spec.code, "servono gli id per gli accessori della voce", step.id);
    for (let i = 0; i < acc.count; i++)
      extras.push({
        id: ids.nextHardware(accSpec.kind),
        code: accSpec.code,
        kind: accSpec.kind,
        description: accSpec.name,
        quantity: 1,
        dims: accSpec.dims,
        pieceIds: step.pieces.length === acc.count ? [step.pieces[i]] : [...step.pieces],
        machiningIds: [],
        params: { of: step.id },
      });
  }
  extras.push(...screwItems(spec, step.pieces));
  return { pieces: [...pieces], item, extras };
}
