import { pieceHullVertices, pieceObbs } from "../assembly/bounds";
import type { Assembly } from "../components/types";
import { obbObbPenetration } from "../math/obb";
import { planOf, sideExcesses } from "./plan";
import { type Envelope, type Side, absoluteObstacles } from "./types";

/**
 * Controllo collisioni (D5): ogni pezzo come OBB (sezione × lunghezza nella
 * sua posa, lavorazioni ignorate: approssimazione conservativa; per i pezzi
 * curvi la catena di box di segmento di `pieceObbs`) deve stare dentro il
 * prisma dell'ingombro (pianta `planOf` × [pavimento, altezza]: con pianta
 * rettangolare è il box base) e non compenetrare gli ostacoli (OBB–OBB: sui
 * lati inclinati gli ostacoli seguono il lato reale). Per l'ingombro i box
 * sono ritagliati dai tagli di testa (`pieceHullVertices`): la testa prolungata
 * oltre un muro o il pavimento e poi tagliata non sfora. Per gli ostacoli resta
 * il box intero (conservativo).
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

/** Tolleranza geometrica minima (D3): residui numerici non sono collisioni. */
const GEOMETRIC_EPS = 1e-6;

const fmt = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");

/**
 * Collisioni dell'assieme con l'ingombro. Il contatto non è collisione:
 * interferenze ≤ `tolerance` (mm) sono ammesse. Il piede dei pilastri può
 * scendere sotto il pavimento (affondamento); gli altri pezzi non possono
 * scendere sotto la quota minima del pavimento. Gli ostacoli fuori ingombro
 * sono ignorati.
 */
export function checkCollisions(assembly: Pick<Assembly, "pieces">, envelope: Envelope, tolerance = 0): Collision[] {
  const H = envelope.box.height;
  const plan = planOf(envelope);
  const c = envelope.floor.corners;
  const floorMin = Math.min(0, c.frontLeft, c.frontRight, c.backLeft, c.backRight, ...envelope.floor.points.map((p) => p.z));
  const obstacles = absoluteObstacles(envelope).filter((o) => !o.ignored);
  const tol = Math.max(tolerance, GEOMETRIC_EPS);
  const out: Collision[] = [];
  for (const p of assembly.pieces) {
    const obbs = pieceObbs(p);
    // sforamento del box base: per lato, massimo eccesso dei vertici
    const excess: [Side, number][] = [
      ["sinistro", 0],
      ["destro", 0],
      ["anteriore", 0],
      ["posteriore", 0],
      ["pavimento", 0],
      ["soffitto", 0],
    ];
    for (const v of pieceHullVertices(p)) {
      // lati della pianta (prisma verticale): sinistro, destro, anteriore, posteriore
      sideExcesses(plan, v).forEach(([, e], i) => (excess[i][1] = Math.max(excess[i][1], e)));
      if (p.type !== "pilastro") excess[4][1] = Math.max(excess[4][1], floorMin - v.z);
      excess[5][1] = Math.max(excess[5][1], v.z - H);
    }
    const [side, depth] = excess.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (depth > tol)
      out.push({
        pieceId: p.id,
        obstacleId: ENVELOPE_ID,
        depth,
        side,
        message: `${p.id} esce dall'ingombro sul lato ${side} di ${fmt(depth)} mm`,
      });
    for (const o of obstacles) {
      const pen = Math.max(...obbs.map((obb) => obbObbPenetration(obb, o.box)));
      if (pen > tol)
        out.push({ pieceId: p.id, obstacleId: o.obstacleId, depth: pen, message: `${p.id} interferisce con ${o.obstacle.type} ${o.obstacleId} (${fmt(pen)} mm)` });
    }
  }
  return out;
}
