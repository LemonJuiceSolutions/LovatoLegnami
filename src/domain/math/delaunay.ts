import type { InterpResult } from "./interp";
import { EPS, type Vec3 } from "./vec3";

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

/** Triangolo come terna di indici nei punti di input, in senso antiorario. */
export type Triangle = readonly [number, number, number];

/** Triangolazione di punti quotati (z = valore da interpolare). */
export interface Triangulation {
  readonly points: readonly Vec3[];
  readonly triangles: readonly Triangle[];
}

const orient = (a: Point2, b: Point2, c: Point2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

interface Circle {
  cx: number;
  cy: number;
  r2: number;
}

function circumcircle(a: Point2, b: Point2, c: Point2): Circle {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { cx, cy, r2: (a.x - cx) ** 2 + (a.y - cy) ** 2 };
}

/**
 * Triangolazione di Delaunay 2D (Bowyer–Watson). Restituisce triangoli
 * antiorari come indici in `points`. Punti co-circolari: il test "dentro il
 * cerchio" è stretto, quindi l'esito dipende solo dall'ordine di input
 * (deterministico). I punti devono essere distinti.
 */
export function delaunay(points: readonly Point2[]): Triangle[] {
  const n = points.length;
  if (n < 3) throw new Error("delaunay: servono almeno 3 punti");

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const d = Math.max(maxX - minX, maxY - minY, 1);
  const mx = (minX + maxX) / 2;
  const my = (minY + maxY) / 2;
  // Super-triangolo molto ampio per non deformare l'involucro convesso.
  const big = 1000 * d;
  const pts: Point2[] = [
    ...points,
    { x: mx - big, y: my - big },
    { x: mx + big, y: my - big },
    { x: mx, y: my + big },
  ];

  interface Tri {
    v: [number, number, number];
    c: Circle;
  }
  const make = (a: number, b: number, c: number): Tri => {
    const v: [number, number, number] = orient(pts[a], pts[b], pts[c]) > 0 ? [a, b, c] : [a, c, b];
    return { v, c: circumcircle(pts[v[0]], pts[v[1]], pts[v[2]]) };
  };

  let tris: Tri[] = [make(n, n + 1, n + 2)];

  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const bad: Tri[] = [];
    const good: Tri[] = [];
    for (const t of tris) {
      const dist2 = (p.x - t.c.cx) ** 2 + (p.y - t.c.cy) ** 2;
      (dist2 < t.c.r2 * (1 - 1e-12) ? bad : good).push(t);
    }
    // Bordo della cavità: spigoli dei triangoli "bad" non condivisi.
    const edgeCount = new Map<string, [number, number]>();
    const counts = new Map<string, number>();
    for (const t of bad) {
      for (let k = 0; k < 3; k++) {
        const a = t.v[k];
        const b = t.v[(k + 1) % 3];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        edgeCount.set(key, [a, b]);
      }
    }
    tris = good;
    for (const [key, [a, b]] of edgeCount) {
      if (counts.get(key) === 1 && Math.abs(orient(pts[a], pts[b], p)) > 0) tris.push(make(a, b, i));
    }
  }

  return tris
    .filter((t) => t.v.every((idx) => idx < n))
    .filter((t) => orient(pts[t.v[0]], pts[t.v[1]], pts[t.v[2]]) > EPS)
    .map((t) => [t.v[0], t.v[1], t.v[2]] as const);
}

/**
 * Triangola punti quotati. Punti con stesse (x, y) entro 1e-6 vengono
 * accorpati: vince l'ultimo. Lancia un errore se i punti sono meno di 3 o
 * tutti allineati.
 */
export function triangulate(input: readonly Vec3[]): Triangulation {
  const points: Vec3[] = [];
  for (const p of input) {
    const i = points.findIndex((q) => Math.abs(q.x - p.x) <= EPS && Math.abs(q.y - p.y) <= EPS);
    if (i >= 0) points[i] = p;
    else points.push(p);
  }
  const triangles = delaunay(points);
  if (triangles.length === 0) throw new Error("triangulate: punti allineati, triangolazione impossibile");
  return { points, triangles };
}

/**
 * Quota interpolata (baricentrica) in (x, y). Fuori dall'involucro convesso il
 * punto viene proiettato sullo spigolo di bordo più vicino e interpolato
 * linearmente lungo di esso, con `outside: true`.
 */
export function interpolateAt(t: Triangulation, x: number, y: number): InterpResult {
  const P = t.points;
  for (const [a, b, c] of t.triangles) {
    const A = P[a], B = P[b], C = P[c];
    const area = orient(A, B, C);
    const wa = orient({ x, y }, B, C) / area;
    const wb = orient(A, { x, y }, C) / area;
    const wc = 1 - wa - wb;
    const tol = 1e-9;
    if (wa >= -tol && wb >= -tol && wc >= -tol) {
      // Ritorno esatto sui vertici per evitare residui di arrotondamento.
      if (wa >= 1 - tol) return { value: A.z, outside: false };
      if (wb >= 1 - tol) return { value: B.z, outside: false };
      if (wc >= 1 - tol) return { value: C.z, outside: false };
      return { value: wa * A.z + wb * B.z + wc * C.z, outside: false };
    }
  }

  // Spigoli di bordo: appartengono a un solo triangolo.
  const counts = new Map<string, [number, number, number]>();
  for (const tri of t.triangles) {
    for (let k = 0; k < 3; k++) {
      const a = tri[k];
      const b = tri[(k + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const prev = counts.get(key);
      counts.set(key, [a, b, (prev?.[2] ?? 0) + 1]);
    }
  }
  let best = { d2: Infinity, value: 0 };
  for (const [a, b, count] of counts.values()) {
    if (count !== 1) continue;
    const A = P[a], B = P[b];
    const ex = B.x - A.x, ey = B.y - A.y;
    const s = Math.min(1, Math.max(0, ((x - A.x) * ex + (y - A.y) * ey) / (ex * ex + ey * ey)));
    const px = A.x + s * ex, py = A.y + s * ey;
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 < best.d2) best = { d2, value: A.z + s * (B.z - A.z) };
  }
  return { value: best.value, outside: true };
}
