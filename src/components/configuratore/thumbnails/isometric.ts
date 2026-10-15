import {
  add,
  cross,
  dot,
  generate,
  norm,
  obbVertices,
  pieceObbs,
  scale,
  sub,
  vec3,
  type OBB,
  type Piece,
  type PieceFamily,
  type Vec3,
} from "@/domain"
import { shadedFamilyColor, type FaceShade } from "../viewer/piece-colors"

/**
 * Miniature delle tipologie (spec `configuratore-ui`, "Miniature generate dal
 * modello"): proiezione assonometrica cabinet dei box dei pezzi (`pieceObbs`,
 * quindi anche i tratti degli archi) dell'assieme di default, facce visibili
 * dipinte dalla più lontana alla più vicina, colori per famiglia condivisi con
 * il viewer (`piece-colors.ts`), `viewBox` adattato al disegno. TS puro: il
 * risultato è una stringa SVG; contorni e ombra a terra usano `currentColor`,
 * quindi seguono il colore del testo del tema (chiaro/scuro).
 */

/** Riduzione degli spigoli in profondità (cabinet = 1/2) e loro inclinazione sullo schermo. */
const DEPTH_RATIO = 0.5
const DEPTH_ANGLE = (35 * Math.PI) / 180
const KX = DEPTH_RATIO * Math.cos(DEPTH_ANGLE)
const KZ = DEPTH_RATIO * Math.sin(DEPTH_ANGLE)

/** Larghezza del disegno nel `viewBox` (le coordinate sono scalate a questa misura). */
const DRAWING_WIDTH = 200
/** Margine attorno al disegno (frazione della larghezza). */
const MARGIN = 0.04
/** Tolleranza (mm) con cui due box a contatto si considerano separati. */
const CONTACT_TOL = 0.5

export interface Point2 {
  readonly x: number
  readonly y: number
}

/** Punto dello schermo (y verso il basso, come in SVG) del punto dell'assieme (mm, Z in alto). */
export function projectPoint(p: Vec3): Point2 {
  return { x: p.x + KX * p.y, y: -(p.z + KZ * p.y) }
}

/**
 * Direzione di vista (dall'osservatore verso la scena): i punti lungo questa
 * direzione hanno la stessa proiezione. Le facce con normale `n·VIEW_DIR < 0`
 * sono rivolte all'osservatore (fronte, alto e lato destro).
 */
export const VIEW_DIR: Vec3 = vec3(-KX, 1, -KZ)

export interface ThumbnailFace {
  readonly pieceId: string
  readonly family: PieceFamily
  readonly shade: FaceShade
  readonly points: readonly Point2[]
}

interface BoxItem {
  readonly pieceId: string
  readonly family: PieceFamily
  readonly obb: OBB
  readonly depth: number
  readonly min: Point2
  readonly max: Point2
}

const halfOf = (o: OBB, i: number) => (i === 0 ? o.halfSize.x : i === 1 ? o.halfSize.y : o.halfSize.z)

function screenBounds(o: OBB): { min: Point2; max: Point2 } {
  const pts = obbVertices(o).map(projectPoint)
  return {
    min: { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) },
    max: { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) },
  }
}

const overlap2d = (a: BoxItem, b: BoxItem) =>
  a.min.x < b.max.x - 1e-6 && b.min.x < a.max.x - 1e-6 && a.min.y < b.max.y - 1e-6 && b.min.y < a.max.y - 1e-6

const radiusAlong = (o: OBB, l: Vec3) => [0, 1, 2].reduce((r, i) => r + halfOf(o, i) * Math.abs(dot(o.axes[i], l)), 0)

/**
 * Ordine di pittura tra due box convessi: con un asse separatore (SAT, 15 assi)
 * che non sia perpendicolare alla vista, quello oltre il piano separatore è
 * più lontano. `1` = `a` più lontano di `b`, `-1` = più vicino, `0` = non
 * determinabile (box compenetrati: tenoni, sovrapposizioni dei box d'arco).
 */
function farther(a: OBB, b: OBB): -1 | 0 | 1 {
  const axes: Vec3[] = [...a.axes, ...b.axes]
  for (const u of a.axes) for (const w of b.axes) axes.push(cross(u, w))
  const ab = sub(b.center, a.center)
  for (const raw of axes) {
    const n = norm(raw)
    if (n < 1e-6) continue
    const l = scale(raw, 1 / n)
    const lv = dot(l, VIEW_DIR)
    if (Math.abs(lv) < 1e-6) continue
    const gap = Math.abs(dot(ab, l)) - radiusAlong(a, l) - radiusAlong(b, l)
    if (gap < -CONTACT_TOL) continue
    // b sta dalla parte positiva di l (orientato da a verso b): b più lontano se l·v > 0
    const bAbove = dot(ab, l) >= 0
    return (lv > 0) === bAbove ? -1 : 1
  }
  return 0
}

/** Box ordinati dal più lontano al più vicino (ordinamento topologico, cicli risolti per profondità del centro). */
function paintOrder(items: readonly BoxItem[]): BoxItem[] {
  const n = items.length
  const after: number[][] = Array.from({ length: n }, () => [])
  const indegree = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (!overlap2d(items[i], items[j])) continue
      let f = farther(items[i].obb, items[j].obb)
      if (f === 0) f = items[i].depth >= items[j].depth ? 1 : -1
      const [far, near] = f === 1 ? [i, j] : [j, i]
      after[far].push(near)
      indegree[near]++
    }
  const done = new Array<boolean>(n).fill(false)
  const out: BoxItem[] = []
  // a ogni passo il box libero più lontano (a parità, il primo): deterministico
  const pick = (free: boolean) => {
    let best = -1
    for (let i = 0; i < n; i++) {
      if (done[i] || (free && indegree[i] > 0)) continue
      if (best < 0 || items[i].depth > items[best].depth) best = i
    }
    return best
  }
  for (let k = 0; k < n; k++) {
    let i = pick(true)
    if (i < 0) i = pick(false) // ciclo: si rompe con la profondità
    done[i] = true
    out.push(items[i])
    for (const j of after[i]) indegree[j]--
  }
  return out
}

function shadeOf(normal: Vec3): FaceShade {
  const ax = Math.abs(normal.x)
  const ay = Math.abs(normal.y)
  const az = Math.abs(normal.z)
  if (az >= ax && az >= ay) return "alto"
  return ay >= ax ? "fronte" : "lato"
}

/** Facce visibili di un box (al più 3), con i vertici in ordine sul contorno. */
function visibleFaces(item: BoxItem): ThumbnailFace[] {
  const o = item.obb
  const faces: ThumbnailFace[] = []
  for (let i = 0; i < 3; i++)
    for (const s of [-1, 1]) {
      const normal = scale(o.axes[i], s)
      if (dot(normal, VIEW_DIR) > -1e-6) continue
      const j = (i + 1) % 3
      const k = (i + 2) % 3
      const c = add(o.center, scale(normal, halfOf(o, i)))
      const u = scale(o.axes[j], halfOf(o, j))
      const w = scale(o.axes[k], halfOf(o, k))
      const corners = [sub(sub(c, u), w), sub(add(c, u), w), add(add(c, u), w), add(sub(c, u), w)]
      faces.push({ pieceId: item.pieceId, family: item.family, shade: shadeOf(normal), points: corners.map(projectPoint) })
    }
  return faces
}

/** Facce visibili dei pezzi nell'ordine di pittura (dalla più lontana). */
export function thumbnailFaces(pieces: readonly Piece[]): ThumbnailFace[] {
  const items: BoxItem[] = pieces.flatMap((p) =>
    pieceObbs(p).map((obb) => ({ pieceId: p.id, family: p.family, obb, depth: dot(obb.center, VIEW_DIR), ...screenBounds(obb) })),
  )
  return paintOrder(items).flatMap(visibleFaces)
}

const fmt = (v: number) => {
  const r = Math.round(v * 10) / 10
  return Object.is(r, -0) ? "0" : String(r)
}

export interface IsometricOptions {
  /** Testo alternativo (`aria-label`) della miniatura. */
  readonly label?: string
}

/** SVG assonometrico dei pezzi: stringa deterministica (stessi pezzi → stessa stringa). */
export function isometricSvg(pieces: readonly Piece[], options: IsometricOptions = {}): string {
  const faces = thumbnailFaces(pieces)
  const label = (options.label ?? "Miniatura").replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`)
  if (faces.length === 0)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DRAWING_WIDTH} ${DRAWING_WIDTH / 2}" role="img" aria-label="${label}"></svg>`

  // ombra a terra: rettangolo dell'impronta in pianta alla quota minima
  const verts = pieces.flatMap((p) => pieceObbs(p).flatMap(obbVertices))
  const lo = vec3(Math.min(...verts.map((v) => v.x)), Math.min(...verts.map((v) => v.y)), Math.min(...verts.map((v) => v.z)))
  const hi = vec3(Math.max(...verts.map((v) => v.x)), Math.max(...verts.map((v) => v.y)), lo.z)
  const shadow = [vec3(lo.x, lo.y, lo.z), vec3(hi.x, lo.y, lo.z), vec3(hi.x, hi.y, lo.z), vec3(lo.x, hi.y, lo.z)].map(projectPoint)

  const all = [...shadow, ...faces.flatMap((f) => f.points)]
  const minX = Math.min(...all.map((p) => p.x))
  const maxX = Math.max(...all.map((p) => p.x))
  const minY = Math.min(...all.map((p) => p.y))
  const maxY = Math.max(...all.map((p) => p.y))
  const k = DRAWING_WIDTH / Math.max(maxX - minX, maxY - minY, 1)
  const pad = DRAWING_WIDTH * MARGIN
  const width = (maxX - minX) * k + 2 * pad
  const height = (maxY - minY) * k + 2 * pad
  const pts = (ps: readonly Point2[]) => ps.map((p) => `${fmt((p.x - minX) * k + pad)},${fmt((p.y - minY) * k + pad)}`).join(" ")

  const polygons = faces.map((f) => `<polygon points="${pts(f.points)}" fill="${shadedFamilyColor(f.family, f.shade)}"/>`).join("")
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" role="img" aria-label="${label}">` +
    `<path d="M${pts(shadow).replace(/ /g, "L")}Z" fill="currentColor" fill-opacity="0.08"/>` +
    `<g stroke="currentColor" stroke-opacity="0.35" stroke-width="0.6" stroke-linejoin="round" vector-effect="non-scaling-stroke">${polygons}</g>` +
    `</svg>`
  )
}

const cache = new Map<string, string>()

/**
 * Miniatura della tipologia dall'assieme di default, calcolata una volta per
 * slug. Se la generazione fallisce restituisce un SVG vuoto (non memorizzato).
 */
export function thumbnailFor(slug: string, name?: string): string {
  const hit = cache.get(slug)
  if (hit !== undefined) return hit
  try {
    const svg = isometricSvg(generate(slug).pieces, { label: name ?? slug })
    cache.set(slug, svg)
    return svg
  } catch {
    return isometricSvg([], { label: name ?? slug })
  }
}
