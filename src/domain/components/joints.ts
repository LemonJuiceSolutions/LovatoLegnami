import { aabb } from "../math/aabb";
import { applyToPoint, applyToVector, invertRigid, multiply, type Mat4 } from "../math/mat4";
import { obbAabbPenetration, obbFromPose, obbVertices } from "../math/obb";
import { EPS, add, cross, dot, norm, normalize, scale, sub, vec3, type Vec3 } from "../math/vec3";
import { JointError, MachiningError } from "./errors";
import { addMachining } from "./machinings";
import type { DardoDiGioveJoint, HeadFace, Joint, LateralFace, MezzoLegnoJoint, Piece, TenoneMortasaJoint } from "./types";

/** Facce laterali con normale uscente nel sistema locale del pezzo. */
const LATERAL_FACES: readonly { face: LateralFace; normal: Vec3 }[] = [
  { face: "superiore", normal: vec3(0, 0, 1) },
  { face: "inferiore", normal: vec3(0, 0, -1) },
  { face: "sinistra", normal: vec3(0, 1, 0) },
  { face: "destra", normal: vec3(0, -1, 0) },
];

const localBox = (p: Piece) =>
  aabb(vec3(0, -p.section.b / 2, -p.section.h / 2), vec3(p.length, p.section.b / 2, p.section.h / 2));

const sizeOf = (p: Piece): Vec3 => vec3(p.length, p.section.b, p.section.h);

/** Distanza di un punto (locale) dal box locale del pezzo. */
function distanceToBox(p: Piece, q: Vec3): number {
  const { min, max } = localBox(p);
  const c = vec3(
    Math.min(Math.max(q.x, min.x), max.x),
    Math.min(Math.max(q.y, min.y), max.y),
    Math.min(Math.max(q.z, min.z), max.z),
  );
  return norm(sub(q, c));
}

/** Posa di `q` espressa nel sistema locale di `p`. */
const relativePose = (p: Piece, q: Piece): Mat4 => multiply(invertRigid(p.pose), q.pose);

function findPieces(joint: Joint, pieces: readonly Piece[]): [Piece, Piece] {
  const a = pieces.find((p) => p.id === joint.pieceA);
  const b = pieces.find((p) => p.id === joint.pieceB);
  const missing = [!a && joint.pieceA, !b && joint.pieceB].filter(Boolean);
  if (missing.length) throw new JointError(joint.id, `pezzi non trovati: ${missing.join(", ")}`);
  if (a!.id === b!.id) throw new JointError(joint.id, "un giunto richiede due pezzi distinti");
  return [a!, b!];
}

function normalizeAngle180(deg: number): number {
  let a = ((deg % 180) + 180) % 180;
  if (a > 180 - 1e-9 || a < 1e-9) a = 0;
  return a;
}

/** Riesegue gli errori di lavorazione come errori del giunto, mantenendo il dettaglio. */
function withJointContext<T>(joint: Joint, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof MachiningError) throw new JointError(joint.id, e.message);
    throw e;
  }
}

function expandTenoneMortasa(joint: TenoneMortasaJoint, a: Piece, b: Piece): [Piece, Piece] {
  const { width, height, length, gap } = joint.params;
  const rel = relativePose(b, a); // A nel sistema di B
  const start = applyToPoint(rel, vec3(0, 0, 0));
  const end = applyToPoint(rel, vec3(a.length, 0, 0));
  const atStart = distanceToBox(b, start) <= distanceToBox(b, end);
  const tip = atStart ? start : end;
  const into = normalize(atStart ? sub(start, end) : sub(end, start)); // verso di ingresso in B

  // faccia di B attraversata entrando: normale uscente più opposta alla direzione di ingresso
  let best = LATERAL_FACES[0];
  for (const f of LATERAL_FACES) if (dot(f.normal, into) < dot(best.normal, into)) best = f;
  const cosIn = dot(best.normal, into);
  if (cosIn > -EPS) throw new JointError(joint.id, `il pezzo ${a.id} non entra in ${b.id}`);

  const vertical = best.face === "superiore" || best.face === "inferiore";
  const planeDist = vertical ? b.section.h / 2 : b.section.b / 2;
  const t = (planeDist - dot(best.normal, tip)) / cosIn;
  const hit = add(tip, scale(into, t));
  const across = (v: Vec3): number => (vertical ? v.y : v.z);

  // direzione della larghezza del tenone (Y di A) proiettata sulla faccia di B
  const yA = applyToVector(rel, vec3(0, 1, 0));
  const angle =
    Math.hypot(yA.x, across(yA)) < EPS ? 0 : normalizeAngle180((Math.atan2(across(yA), yA.x) * 180) / Math.PI);

  return withJointContext(joint, () => [
    addMachining(a, {
      type: "tenone",
      width,
      height,
      length,
      at: atStart ? 0 : a.length,
      face: atStart ? "testa-inizio" : "testa-fine",
      jointId: joint.id,
    }),
    addMachining(b, {
      type: "mortasa",
      width: width + gap,
      height: height + gap,
      depth: length + gap,
      offset: across(hit),
      angle,
      at: hit.x,
      face: best.face,
      jointId: joint.id,
    }),
  ]);
}

/** Mezzo legno su `p` nella zona occupata da `other`; `preferTop` decide la faccia a parità di quota. */
function halfLapOn(joint: MezzoLegnoJoint, p: Piece, other: Piece, preferTop: boolean): Piece {
  const rel = relativePose(p, other);
  const o = obbFromPose(rel, sizeOf(other));
  if (obbAabbPenetration(o, localBox(p)) < -EPS)
    throw new JointError(joint.id, `i pezzi ${joint.pieceA} e ${joint.pieceB} non si sovrappongono`);
  const xs = obbVertices(o).map((v) => v.x);
  const x0 = Math.max(0, Math.min(...xs));
  const x1 = Math.min(p.length, Math.max(...xs));
  if (x1 - x0 <= EPS) throw new JointError(joint.id, `i pezzi ${joint.pieceA} e ${joint.pieceB} non si sovrappongono`);
  const zc = o.center.z;
  const face = zc > EPS ? "superiore" : zc < -EPS ? "inferiore" : preferTop ? "superiore" : "inferiore";
  return withJointContext(joint, () =>
    addMachining(p, { type: "mezzo-legno", width: x1 - x0, depth: p.section.h / 2, at: (x0 + x1) / 2, face, jointId: joint.id }),
  );
}

function expandMezzoLegno(joint: MezzoLegnoJoint, a: Piece, b: Piece): [Piece, Piece] {
  return [halfLapOn(joint, a, b, true), halfLapOn(joint, b, a, false)];
}

/** Tolleranze di collinearità del dardo di Giove (rad, mm). */
export const COLLINEAR_ANGLE_TOL = 1e-3;
export const COLLINEAR_DISTANCE_TOL = 1;

const fmt1 = (n: number): string => String(Math.round(n * 10) / 10).replace(".", ",");

/**
 * Dardo di Giove: verifica che gli assi siano collineari (angolo ≤ 1e-3 rad,
 * distanza ≤ 1 mm) e le facce superiori parallele, che le teste si
 * sovrappongano di `length` (± 1 mm) e mette su ciascuna testa affacciata il
 * profilo complementare: A con `angle` positivo, B specchiato.
 */
function expandDardo(joint: DardoDiGioveJoint, a: Piece, b: Piece): [Piece, Piece] {
  const { length, angle, step } = joint.params;
  const rel = relativePose(a, b); // B nel sistema di A
  const xB = applyToVector(rel, vec3(1, 0, 0));
  const zB = applyToVector(rel, vec3(0, 0, 1));
  const p0 = applyToPoint(rel, vec3(0, 0, 0));
  const p1 = applyToPoint(rel, vec3(b.length, 0, 0));
  const offAxis = Math.max(Math.hypot(p0.y, p0.z), Math.hypot(p1.y, p1.z));
  if (norm(cross(xB, vec3(1, 0, 0))) > COLLINEAR_ANGLE_TOL || offAxis > COLLINEAR_DISTANCE_TOL)
    throw new JointError(joint.id, `gli assi di ${a.id} e ${b.id} non sono collineari (scarto ${fmt1(offAxis)} mm)`);
  if (norm(cross(zB, vec3(0, 0, 1))) > COLLINEAR_ANGLE_TOL)
    throw new JointError(joint.id, `le facce superiori di ${a.id} e ${b.id} non sono parallele: il profilo non è complementare`);

  const lo = Math.max(0, Math.min(p0.x, p1.x));
  const hi = Math.min(a.length, Math.max(p0.x, p1.x));
  if (hi - lo <= EPS) throw new JointError(joint.id, `le teste di ${a.id} e ${b.id} non si sovrappongono`);
  const headOfA = (x: number): HeadFace | undefined =>
    Math.abs(x - a.length) <= COLLINEAR_DISTANCE_TOL ? "testa-fine" : Math.abs(x) <= COLLINEAR_DISTANCE_TOL ? "testa-inizio" : undefined;
  // la testa di A sta a un estremo della sovrapposizione, quella di B all'altro
  const aFace = lo > COLLINEAR_DISTANCE_TOL ? headOfA(hi) : hi < a.length - COLLINEAR_DISTANCE_TOL ? headOfA(lo) : undefined;
  if (!aFace) throw new JointError(joint.id, `la sovrapposizione di ${a.id} e ${b.id} non è tra due teste affacciate`);
  if (Math.abs(hi - lo - length) > COLLINEAR_DISTANCE_TOL)
    throw new JointError(
      joint.id,
      `sovrapposizione delle teste ${fmt1(hi - lo)} mm diversa dalla lunghezza del giunto (${fmt1(length)} mm)`,
    );
  const bEnd = aFace === "testa-fine" ? lo : hi; // estremo della sovrapposizione dove sta la testa di B
  const bFace: HeadFace = Math.abs(p0.x - bEnd) <= Math.abs(p1.x - bEnd) ? "testa-inizio" : "testa-fine";
  const bAngle = dot(zB, vec3(0, 0, 1)) > 0 ? -angle : angle;

  return withJointContext(joint, () => [
    addMachining(a, { type: "dardo-di-giove", face: aFace, at: aFace === "testa-fine" ? a.length : 0, length, angle, step, jointId: joint.id }),
    addMachining(b, {
      type: "dardo-di-giove",
      face: bFace,
      at: bFace === "testa-fine" ? b.length : 0,
      length,
      angle: bAngle,
      step,
      jointId: joint.id,
    }),
  ]);
}

/**
 * Espande un giunto in lavorazioni complementari sui due pezzi, calcolando la
 * posizione di incrocio dalle pose. Restituisce un nuovo elenco di pezzi (stesso
 * ordine) con le lavorazioni aggiunte; l'input non è mutato.
 *
 * - `tenone-mortasa`: tenone sulla testa di A più vicina a B; mortasa su B,
 *   sulla faccia attraversata dall'asse di A, con dimensioni = tenone + `gap`.
 * - `mezzo-legno`: su ciascun pezzo, tasca profonda metà della propria altezza
 *   lungo la zona occupata dall'altro; faccia verso l'altro pezzo (a parità di
 *   quota A è intagliato sopra e B sotto).
 * - `dardo-di-giove`: pezzi collineari con le teste sovrapposte di `length`;
 *   profili complementari sulle teste affacciate (vedi `expandDardo`).
 */
export function expandJoint(joint: Joint, pieces: readonly Piece[]): Piece[] {
  const [a, b] = findPieces(joint, pieces);
  const [na, nb] =
    joint.type === "tenone-mortasa"
      ? expandTenoneMortasa(joint, a, b)
      : joint.type === "dardo-di-giove"
        ? expandDardo(joint, a, b)
        : expandMezzoLegno(joint, a, b);
  return pieces.map((p) => (p.id === a.id ? na : p.id === b.id ? nb : p));
}

/** Espande tutti i giunti in ordine. */
export const expandJoints = (joints: readonly Joint[], pieces: readonly Piece[]): Piece[] =>
  joints.reduce<Piece[]>((acc, j) => expandJoint(j, acc), [...pieces]);
