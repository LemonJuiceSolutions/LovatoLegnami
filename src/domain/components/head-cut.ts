import { type Mat4, applyToPoint, applyToVector, invertRigid } from "../math/mat4";
import { GeometryError, type Plane, plane, transformPlane } from "../math/plane";
import { vec3 } from "../math/vec3";
import type { HeadFace, MachiningSpec, Piece, TaglioTesta } from "./types";

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
export function headCutFromPlane(piece: Pick<Piece, "pose" | "length">, pl: Plane, face: HeadFace): TaglioTestaSpec {
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
 * Piano (sistema assieme) di un taglio di testa del pezzo: per il punto
 * `(at, 0, 0)` locale, normale ∝ `(1, tan(angle2), −tan(angle))` orientata
 * verso la testa tagliata (lato del materiale rimosso). Inversa di
 * `headCutFromPlane`, usata dai test e dai controlli geometrici.
 */
export function planeOfHeadCut(piece: Pick<Piece, "pose">, spec: Pick<TaglioTesta, "at" | "angle" | "angle2" | "face">): Plane {
  const r = (a: number): number => (a * Math.PI) / 180;
  const sign = spec.face === "testa-inizio" ? -1 : 1;
  const n = vec3(sign, sign * Math.tan(r(spec.angle2 ?? 0)), -sign * Math.tan(r(spec.angle)));
  const pose: Mat4 = piece.pose;
  return plane(applyToPoint(pose, vec3(spec.at, 0, 0)), applyToVector(pose, n));
}
