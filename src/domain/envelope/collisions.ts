import { pieceObb } from "../assembly/bounds";
import type { Assembly } from "../components/types";
import { obbAabbPenetration, obbVertices } from "../math/obb";
import { type Envelope, type Side, absoluteObstacles } from "./types";

/**
 * Controllo collisioni (D5): ogni pezzo come OBB (sezione × lunghezza nella
 * sua posa, lavorazioni ignorate: approssimazione conservativa) deve stare
 * dentro il box base dell'ingombro e non compenetrare gli ostacoli.
 */

/** Id convenzionale del box base nelle collisioni. */
export const ENVELOPE_ID = "ingombro";

export interface Collision {
  readonly pieceId: string;
  /** Id dell'ostacolo, o `"ingombro"` se il pezzo esce dal box base. */
  readonly obstacleId: string;
  /**
   * Profondità di interferenza (mm): per gli ostacoli la penetrazione stimata
   * (SAT), per l'ingombro lo sforamento massimo oltre il box.
   */
  readonly depth: number;
  /** Lato del box base sforato (solo per `"ingombro"`). */
  readonly side?: Side;
  readonly message: string;
}

const fmt = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");

/**
 * Collisioni dell'assieme con l'ingombro. Il contatto non è collisione:
 * interferenze ≤ `tolerance` (mm) sono ammesse. Il piede dei pilastri può
 * scendere sotto il pavimento (affondamento); gli altri pezzi non possono
 * scendere sotto la quota minima del pavimento. Gli ostacoli fuori ingombro
 * sono ignorati.
 */
export function checkCollisions(assembly: Pick<Assembly, "pieces">, envelope: Envelope, tolerance = 0): Collision[] {
  const { width: L, depth: P, height: H } = envelope.box;
  const c = envelope.floor.corners;
  const floorMin = Math.min(0, c.frontLeft, c.frontRight, c.backLeft, c.backRight, ...envelope.floor.points.map((p) => p.z));
  const obstacles = absoluteObstacles(envelope).filter((o) => !o.ignored);
  const out: Collision[] = [];
  for (const p of assembly.pieces) {
    const obb = pieceObb(p);
    // sforamento del box base: per lato, massimo eccesso dei vertici
    const excess: [Side, number][] = [
      ["sinistro", 0],
      ["destro", 0],
      ["anteriore", 0],
      ["posteriore", 0],
      ["pavimento", 0],
      ["soffitto", 0],
    ];
    for (const v of obbVertices(obb)) {
      excess[0][1] = Math.max(excess[0][1], -v.x);
      excess[1][1] = Math.max(excess[1][1], v.x - L);
      excess[2][1] = Math.max(excess[2][1], -v.y);
      excess[3][1] = Math.max(excess[3][1], v.y - P);
      if (p.type !== "pilastro") excess[4][1] = Math.max(excess[4][1], floorMin - v.z);
      excess[5][1] = Math.max(excess[5][1], v.z - H);
    }
    const [side, depth] = excess.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (depth > tolerance)
      out.push({
        pieceId: p.id,
        obstacleId: ENVELOPE_ID,
        depth,
        side,
        message: `${p.id} esce dall'ingombro sul lato ${side} di ${fmt(depth)} mm`,
      });
    for (const o of obstacles) {
      const pen = obbAabbPenetration(obb, o.box);
      if (pen > tolerance)
        out.push({ pieceId: p.id, obstacleId: o.obstacleId, depth: pen, message: `${p.id} interferisce con ${o.obstacle.type} ${o.obstacleId} (${fmt(pen)} mm)` });
    }
  }
  return out;
}
