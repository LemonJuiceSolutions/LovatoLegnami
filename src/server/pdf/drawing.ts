import { pieceObbs, obbVertices, type Piece } from "@/domain";
import { projectPoint, thumbnailFaces, type Point2 } from "@/components/configuratore/thumbnails/isometric";
import { shadedFamilyColor } from "@/components/configuratore/viewer/piece-colors";

/**
 * Disegni vettoriali del PDF (P7): assonometria dei pezzi (stesse facce e colori della
 * miniatura `thumbnails/isometric.ts`, ripiego quando manca l'immagine della scena) e
 * pianta dell'ingombro. Restituiscono dati (poligoni in coordinate del `viewBox`), non
 * SVG testuale: `@react-pdf/renderer` disegna con i suoi componenti `Svg`/`Polygon`.
 */

export interface DrawingPolygon {
  readonly points: string;
  readonly fill: string;
}

export interface VectorDrawing {
  readonly width: number;
  readonly height: number;
  readonly shadow: string | null;
  readonly polygons: readonly DrawingPolygon[];
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
const DRAWING_WIDTH = 200;

export function isometricDrawing(pieces: readonly Piece[]): VectorDrawing {
  const faces = thumbnailFaces(pieces);
  if (faces.length === 0) return { width: DRAWING_WIDTH, height: DRAWING_WIDTH / 2, shadow: null, polygons: [] };
  const verts = pieces.flatMap((p) => pieceObbs(p).flatMap(obbVertices));
  const lo = { x: Math.min(...verts.map((v) => v.x)), y: Math.min(...verts.map((v) => v.y)), z: Math.min(...verts.map((v) => v.z)) };
  const hi = { x: Math.max(...verts.map((v) => v.x)), y: Math.max(...verts.map((v) => v.y)) };
  const shadow = [
    { x: lo.x, y: lo.y, z: lo.z },
    { x: hi.x, y: lo.y, z: lo.z },
    { x: hi.x, y: hi.y, z: lo.z },
    { x: lo.x, y: hi.y, z: lo.z },
  ].map(projectPoint);
  const all = [...shadow, ...faces.flatMap((f) => f.points)];
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const k = DRAWING_WIDTH / Math.max(maxX - minX, maxY - minY, 1);
  const pad = DRAWING_WIDTH * 0.04;
  const pts = (ps: readonly Point2[]) => ps.map((p) => `${fmt((p.x - minX) * k + pad)},${fmt((p.y - minY) * k + pad)}`).join(" ");
  return {
    width: Number(fmt((maxX - minX) * k + 2 * pad)),
    height: Number(fmt((maxY - minY) * k + 2 * pad)),
    shadow: pts(shadow),
    polygons: faces.map((f) => ({ points: pts(f.points), fill: shadedFamilyColor(f.family, f.shade) })),
  };
}

export interface PlanDrawing {
  readonly width: number;
  readonly height: number;
  /** Angoli della pianta (y verso il basso: il fronte è in basso, il muro in alto). */
  readonly outline: string;
  /** Rettangolo contenitore (tratteggiato) per leggere la deviazione dallo squadro. */
  readonly box: string;
  /** Lato del muro (segmento), se c'è. */
  readonly wall: string | null;
}

export type PlanSide = "anteriore" | "posteriore" | "sinistro" | "destro";

/**
 * Pianta: angoli `[fl, fr, br, bl]` in mm (origine anteriore sinistro, y verso il muro),
 * scalati a 120 di larghezza massima, con il fronte in basso.
 */
export function planDrawing(corners: readonly { x: number; y: number }[], box: { width: number; depth: number }, wallSide?: PlanSide | null): PlanDrawing {
  const size = 120;
  const pad = 6;
  const k = size / Math.max(box.width, box.depth, 1);
  const map = (p: { x: number; y: number }) => `${fmt(p.x * k + pad)},${fmt((box.depth - p.y) * k + pad)}`;
  const [fl, fr, br, bl] = corners;
  const wall = wallSide === "posteriore" ? [bl, br] : wallSide === "sinistro" ? [fl, bl] : wallSide === "destro" ? [fr, br] : wallSide === "anteriore" ? [fl, fr] : null;
  return {
    width: Number(fmt(box.width * k + 2 * pad)),
    height: Number(fmt(box.depth * k + 2 * pad)),
    outline: corners.map(map).join(" "),
    box: [
      { x: 0, y: 0 },
      { x: box.width, y: 0 },
      { x: box.width, y: box.depth },
      { x: 0, y: box.depth },
    ]
      .map(map)
      .join(" "),
    wall: wall && wall[0] && wall[1] ? `${map(wall[0])} ${map(wall[1])}` : null,
  };
}
