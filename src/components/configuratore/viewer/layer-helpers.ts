import { absoluteObstacles, floorFunction, type Envelope, type ObstacleType } from "@/domain"

/**
 * Dati dei livelli ingombro, ostacoli e pavimento (funzioni pure, senza Three):
 * il rendering è in `envelope-layer.tsx`, `obstacles-layer.tsx`, `floor-layer.tsx`.
 */

/** Millimetri in formato italiano ("1.250 mm"); `signed` aggiunge "+" ai positivi. */
export function formatMm(v: number, signed = false): string {
  const r = Math.round(v)
  const text = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  const sign = r < 0 ? "−" : signed && r > 0 ? "+" : signed ? "±" : ""
  return `${sign}${text} mm`
}

/** Gradi in formato italiano con un decimale ("12,5°"). */
export const formatDeg = (v: number): string => `${(Math.round(v * 10) / 10).toFixed(1).replace(".", ",")}°`

export interface ObstacleBox {
  readonly id: string
  readonly type: ObstacleType
  readonly label: string
  readonly center: [number, number, number]
  /** Dimensioni lungo gli assi propri dell'ostacolo (lato, sporgenza, quota). */
  readonly size: [number, number, number]
  /** Rotazione attorno a Z (radianti): ostacoli sui lati inclinati della pianta; 0 sul box. */
  readonly rotationZ: number
  /** Fuori dal box base: ignorato nelle collisioni, reso più tenue. */
  readonly ignored: boolean
}

/** Ostacoli come box orientati (centro, dimensioni, rotazione in pianta) per il rendering. */
export function obstacleBoxes(envelope: Envelope): ObstacleBox[] {
  return absoluteObstacles(envelope).map((o) => {
    const c = o.box.center
    const h = o.box.halfSize
    const s = { x: 2 * h.x, y: 2 * h.y, z: 2 * h.z }
    const ax = o.box.axes[0]
    return {
      id: o.obstacleId,
      type: o.obstacle.type,
      label: o.obstacle.label ?? o.obstacleId,
      center: [c.x, c.y, c.z],
      size: [Math.max(s.x, 1), Math.max(s.y, 1), Math.max(s.z, 1)],
      rotationZ: Math.atan2(ax.y, ax.x) + 0,
      ignored: o.ignored,
    }
  })
}

/** Tipi di ostacolo presenti, nell'ordine di comparsa. */
export function obstacleTypes(envelope: Envelope): ObstacleType[] {
  return [...new Set(envelope.obstacles.map((o) => o.type))]
}

export interface FloorGrid {
  /** Vertici (x, y, z) della griglia (divisions + 1)² in ordine riga per riga (y esterno, x interno). */
  readonly positions: Float32Array
  /** Triangoli (due per cella). */
  readonly indices: Uint32Array
  /** Segmenti delle linee della griglia (coppie di vertici xyz). */
  readonly lines: Float32Array
  readonly corners: readonly { readonly x: number; readonly y: number; readonly z: number; readonly name: string }[]
}

/**
 * Superficie del pavimento interpolata (`floorFunction`, bilineare o Delaunay)
 * campionata su una griglia regolare del box base, più le quote agli angoli.
 */
export function floorGrid(envelope: Pick<Envelope, "box" | "floor">, divisions = 16): FloorGrid {
  const n = Math.max(1, Math.floor(divisions))
  const { width: L, depth: P } = envelope.box
  const f = floorFunction(envelope)
  const positions = new Float32Array((n + 1) * (n + 1) * 3)
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = (L * i) / n
      const y = (P * j) / n
      const k = (j * (n + 1) + i) * 3
      positions[k] = x
      positions[k + 1] = y
      positions[k + 2] = f(x, y)
    }
  const indices = new Uint32Array(n * n * 6)
  let t = 0
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i
      const b = a + 1
      const c = a + n + 1
      const d = c + 1
      indices.set([a, b, d, a, d, c], t)
      t += 6
    }
  // linee: per ogni riga e colonna i segmenti tra vertici consecutivi
  const segs: number[] = []
  const v = (i: number, j: number) => {
    const k = (j * (n + 1) + i) * 3
    return [positions[k], positions[k + 1], positions[k + 2]]
  }
  for (let j = 0; j <= n; j++) for (let i = 0; i < n; i++) segs.push(...v(i, j), ...v(i + 1, j))
  for (let i = 0; i <= n; i++) for (let j = 0; j < n; j++) segs.push(...v(i, j), ...v(i, j + 1))
  const c = envelope.floor.corners
  return {
    positions,
    indices,
    lines: new Float32Array(segs),
    corners: [
      { x: 0, y: 0, z: c.frontLeft, name: "Anteriore sinistro" },
      { x: L, y: 0, z: c.frontRight, name: "Anteriore destro" },
      { x: 0, y: P, z: c.backLeft, name: "Posteriore sinistro" },
      { x: L, y: P, z: c.backRight, name: "Posteriore destro" },
    ],
  }
}
