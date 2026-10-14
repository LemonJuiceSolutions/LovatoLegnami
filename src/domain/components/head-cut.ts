import { arcFrame } from "../math/arc";
import { type Mat4, applyToPoint, applyToVector, invertRigid, multiply } from "../math/mat4";
import { GeometryError, type Plane, plane, transformPlane } from "../math/plane";
import { dot, vec3 } from "../math/vec3";
import type { Curve, HeadFace, MachiningSpec, Piece, TaglioTesta } from "./types";

/** Lavorazione `taglio-testa` richiesta (senza id/pieceId). */
export type TaglioTestaSpec = Extract<MachiningSpec, { type: "taglio-testa" }>;

const deg = (rad: number): number => (rad * 180) / Math.PI + 0;

/**
 * Taglio di testa equivalente a un piano (E2): il piano (sistema assieme) è
 * portato nel sistema locale del pezzo, `at` è l'intersezione dell'asse X con
 * il piano, `angle = atan(−n_z/n_x)` e `angle2 = atan(n_y/n_x)` (gradi), così
 * che la normale del taglio ∝ `(1, tan(angle2), −tan(angle))` coincida con
 * quella del piano. `angle2` è omesso quando è nullo. Lancia `GeometryError` se
 * il piano è parallelo all'asse del pezzo (|n_x| < 1e-9). L'applicabilità
 * (posizione entro la lunghezza, ingombro) è verificata da `createMachining`.
 */
export function headCutFromPlane(piece: Pick<Piece, "pose" | "length"> & { readonly curve?: Curve }, pl: Plane, face: HeadFace): TaglioTestaSpec {
  if (piece.curve) return arcHeadCutFromPlane(piece as Pick<Piece, "pose" | "length"> & { readonly curve: Curve }, pl, face);
  const local = transformPlane(invertRigid(piece.pose), pl);
  const n = local.normal;
  if (Math.abs(n.x) < 1e-9) throw new GeometryError("piano parallelo all'asse del pezzo: nessun taglio di testa possibile");
  const at = (n.x * local.point.x + n.y * local.point.y + n.z * local.point.z) / n.x;
  const angle = deg(Math.atan(-n.z / n.x));
  const angle2 = deg(Math.atan(n.y / n.x));
  return {
    type: "taglio-testa",
    face,
    at: at + 0,
    angle,
    ...(Math.abs(angle2) > 1e-12 ? { angle2 } : {}),
  };
}

/**
 * Taglio di testa radiale di un pezzo curvo (E2/E6) equivalente a un piano che
 * contiene la direzione Y locale (asse del cilindro): `at` = coordinata
 * curvilinea del punto dell'asse sul piano (la radice più vicina alla testa
 * indicata), `angle = atan(−n_N/n_T)` con `n_T`, `n_N` componenti della
 * normale lungo tangente e normale radiale in quel punto (`arcFrame`), cioè la
 * stessa convenzione dei pezzi dritti nel sistema della sezione in `at`.
 * `GeometryError` se il piano non contiene Y (taglio obliquo, non ammesso sui
 * curvi) o non interseca l'asse.
 */
function arcHeadCutFromPlane(piece: Pick<Piece, "pose" | "length"> & { readonly curve: Curve }, pl: Plane, face: HeadFace): TaglioTestaSpec {
  const R = piece.curve.radius;
  const sweep = piece.length / R;
  const local = transformPlane(invertRigid(piece.pose), pl);
  const n = local.normal;
  if (Math.abs(n.y) > 1e-9) throw new GeometryError("sui pezzi curvi il piano di taglio deve contenere l'asse Y locale (nessun angle2)");
  // n·P(φ) = d con P(φ) = (R sin φ, 0, R (1 − cos φ)) ⇒ A sin φ + B cos φ = C
  const d = dot(n, local.point);
  const [A, B, C] = [n.x * R, -n.z * R, d - n.z * R];
  const rho = Math.hypot(A, B);
  if (rho < 1e-12 || Math.abs(C) > rho + 1e-9) throw new GeometryError("il piano non interseca l'asse del pezzo curvo");
  const delta = Math.atan2(A, B);
  const w = Math.acos(Math.max(-1, Math.min(1, C / rho)));
  const roots = [delta + w, delta - w, delta + w + 2 * Math.PI, delta - w + 2 * Math.PI, delta + w - 2 * Math.PI, delta - w - 2 * Math.PI].filter(
    (phi) => phi >= -1e-9 && phi <= sweep + 1e-9,
  );
  if (!roots.length) throw new GeometryError("il piano non interseca l'asse del pezzo curvo entro lo sviluppo");
  const phi = face === "testa-inizio" ? Math.min(...roots) : Math.max(...roots);
  const at = Math.min(piece.length, Math.max(0, phi * R));
  const f = transformPlane(invertRigid(arcFrame(R, at)), local).normal;
  if (Math.abs(f.x) < 1e-9) throw new GeometryError("piano tangente all'asse del pezzo curvo: nessun taglio di testa possibile");
  return { type: "taglio-testa", face, at: at + 0, angle: deg(Math.atan(-f.z / f.x)) };
}

/**
 * Piano (sistema assieme) di un taglio di testa del pezzo: per il punto
 * `(at, 0, 0)` locale, normale ∝ `(1, tan(angle2), −tan(angle))` orientata
 * verso la testa tagliata (lato del materiale rimosso). Inversa di
 * `headCutFromPlane`, usata dai test e dai controlli geometrici.
 */
export function planeOfHeadCut(piece: Pick<Piece, "pose"> & { readonly curve?: Curve }, spec: Pick<TaglioTesta, "at" | "angle" | "angle2" | "face">): Plane {
  const r = (a: number): number => (a * Math.PI) / 180;
  const sign = spec.face === "testa-inizio" ? -1 : 1;
  const n = vec3(sign, sign * Math.tan(r(spec.angle2 ?? 0)), -sign * Math.tan(r(spec.angle)));
  if (piece.curve) {
    // pezzo curvo: stessa convenzione nel sistema della sezione in `at`
    const frame: Mat4 = multiply(piece.pose, arcFrame(piece.curve.radius, spec.at));
    return plane(applyToPoint(frame, vec3(0, 0, 0)), applyToVector(frame, n));
  }
  const pose: Mat4 = piece.pose;
  return plane(applyToPoint(pose, vec3(spec.at, 0, 0)), applyToVector(pose, n));
}
