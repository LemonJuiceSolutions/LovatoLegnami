import {
  aabbUnion,
  assemblyBounds,
  envelopeAabb,
  pieceAabb,
  vec3,
  type AABB,
  type Assembly,
  type Envelope,
  type Measures,
} from "@/domain"
import { VIEWS, type ViewName } from "@/stores/viewer-store"
import { formatDeg, formatMm } from "./layer-helpers"

/**
 * Viste predefinite, inquadratura e quote del visualizzatore (funzioni pure).
 * Sistema della scena: X = fronte (larghezza), Y = profondità (verso il muro),
 * Z = alto; il fronte dell'ingombro è a Y = 0.
 */

export { VIEWS, type ViewName }

export const VIEW_LABELS: Readonly<Record<ViewName, string>> = {
  prospettica: "Prospettica",
  fronte: "Fronte",
  lato: "Lato",
  pianta: "Pianta",
}

type V3 = [number, number, number]

const normalize = ([x, y, z]: V3): V3 => {
  const l = Math.hypot(x, y, z)
  return [x / l, y / l, z / l]
}

/**
 * Direzione (versore) dal centro inquadrato alla camera. La pianta ha una
 * minima componente −Y così, con Z come "alto" della camera, il fronte resta
 * in basso sullo schermo.
 */
export function viewDirection(view: ViewName): V3 {
  switch (view) {
    case "prospettica":
      return normalize([-0.5, -0.85, 0.55])
    case "fronte":
      return [0, -1, 0]
    case "lato":
      return [-1, 0, 0]
    case "pianta":
      return normalize([0, -1e-4, 1])
  }
}

/** Fronte, lato e pianta sono in proiezione ortografica. */
export const isOrthographicView = (view: ViewName): boolean => view !== "prospettica"

/** Unione dei bounding box di pergola e ingombro (Z dal pavimento più basso). */
export function sceneBounds(assembly: Pick<Assembly, "pieces"> | null, envelope: Envelope): AABB {
  const c = envelope.floor.corners
  const floorMin = Math.min(0, c.frontLeft, c.frontRight, c.backLeft, c.backRight, ...envelope.floor.points.map((p) => p.z))
  const env = envelopeAabb(envelope)
  let box: AABB = { min: vec3(env.min.x, env.min.y, floorMin), max: env.max }
  const a = assembly ? assemblyBounds(assembly) : undefined
  if (a) box = aabbUnion(box, a)
  return box
}

export interface CameraPose {
  readonly position: V3
  readonly target: V3
  /** Distanza camera–centro (mm). */
  readonly distance: number
}

/**
 * Posa della camera che inquadra `box` dalla vista indicata. In prospettica la
 * distanza è quella della sfera circoscritta che entra nel campo visivo
 * (verticale e orizzontale); in ortografica la camera sta fuori dal box e
 * l'inquadratura la fa lo zoom (`orthoZoom`).
 */
export function viewPose(view: ViewName, box: AABB, fovDeg = 40, aspect = 1.6, margin = 1.15): CameraPose {
  const target: V3 = [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2]
  const radius = Math.max(1, Math.hypot(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) / 2)
  let distance: number
  if (isOrthographicView(view)) distance = radius * 4
  else {
    const vFov = (fovDeg * Math.PI) / 180
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 1e-3))
    distance = (margin * radius) / Math.sin(Math.min(vFov, hFov) / 2)
  }
  const d = viewDirection(view)
  return { target, distance, position: [target[0] + d[0] * distance, target[1] + d[1] * distance, target[2] + d[2] * distance] }
}

/** Estensione del box sullo schermo (larghezza, altezza in mm) per le viste ortografiche. */
export function orthoExtent(view: ViewName, box: AABB): [number, number] {
  const sx = box.max.x - box.min.x
  const sy = box.max.y - box.min.y
  const sz = box.max.z - box.min.z
  switch (view) {
    case "fronte":
      return [sx, sz]
    case "lato":
      return [sy, sz]
    case "pianta":
      return [sx, sy]
    case "prospettica":
      return [Math.max(sx, sy), sz]
  }
}

/** Zoom ortografico (pixel per mm) perché il box entri nella vista con margine. */
export function orthoZoom(view: ViewName, box: AABB, viewportWidth: number, viewportHeight: number, margin = 1.3): number {
  const [w, h] = orthoExtent(view, box)
  const zx = viewportWidth / Math.max(1, w * margin)
  const zy = viewportHeight / Math.max(1, h * margin)
  return Math.max(1e-4, Math.min(zx, zy))
}

/* ------------------------------------------------------------------ */
/* Quote                                                               */
/* ------------------------------------------------------------------ */

export type DimensionKey = "larghezza" | "profondita" | "sottoTrave" | "altezzaMax" | "pendenza"

export interface Dimension {
  readonly key: DimensionKey
  readonly label: string
  readonly value: number
  /** Testo dell'etichetta (es. "Larghezza 5.000 mm"). */
  readonly text: string
  /** Estremi della linea di quota (coincidenti per la pendenza: solo etichetta). */
  readonly from: V3
  readonly to: V3
  readonly labelAt: V3
}

/** Distanza delle linee di quota dalla pergola (mm). */
export const DIMENSION_OFFSET = 400

const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]

/**
 * Le cinque quote principali dai valori correnti: larghezza e profondità
 * (ingombro in pianta della pergola), altezza libera sotto trave (sotto il
 * pezzo che la determina), altezza massima (quota assoluta del punto più alto)
 * e pendenza effettiva.
 */
export function computeDimensions(assembly: Pick<Assembly, "pieces"> | null, measures: Measures | null): Dimension[] {
  if (!assembly) return []
  const b = assemblyBounds(assembly)
  if (!b) return []
  const off = DIMENSION_OFFSET
  const z0 = b.min.z
  const out: Dimension[] = []
  const push = (key: DimensionKey, label: string, value: number, text: string, from: V3, to: V3, labelAt = mid(from, to)) =>
    out.push({ key, label, value, text, from, to, labelAt })

  const w = b.max.x - b.min.x
  push("larghezza", "Larghezza", w, `Larghezza ${formatMm(w)}`, [b.min.x, b.min.y - off, z0], [b.max.x, b.min.y - off, z0])
  const d = b.max.y - b.min.y
  push("profondita", "Profondità", d, `Profondità ${formatMm(d)}`, [b.max.x + off, b.min.y, z0], [b.max.x + off, b.max.y, z0])

  const clear = measures?.clearHeight
  const limiting = clear ? assembly.pieces.find((p) => p.id === clear.pieceId) : undefined
  if (clear && limiting) {
    const pb = pieceAabb(limiting)
    const cx = (pb.min.x + pb.max.x) / 2
    const cy = (pb.min.y + pb.max.y) / 2
    const top: V3 = [cx, cy, pb.min.z]
    push("sottoTrave", "Altezza sotto trave", clear.value, `Sotto trave ${formatMm(clear.value)}`, [cx, cy, pb.min.z - clear.value], top)
  }

  push("altezzaMax", "Altezza massima", b.max.z, `Altezza max ${formatMm(b.max.z)}`, [b.min.x - off, b.min.y - off, 0], [b.min.x - off, b.min.y - off, b.max.z])

  if (measures?.slope !== undefined) {
    const top: V3 = [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z + off / 2]
    push("pendenza", "Pendenza", measures.slope, `Pendenza ${formatDeg(measures.slope)}`, top, top, top)
  }
  return out
}
