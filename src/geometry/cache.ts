import type { Machining, PieceType, Section } from "@/domain/components/types";

/**
 * Cache dei solidi per pezzo (D6): la chiave dipende solo da tipo, sezione,
 * lunghezza e lavorazioni (senza id, pezzo, giunto né posa), così pezzi
 * identici in posizioni diverse — es. i travetti — condividono il solido.
 */

export interface CacheKeyInput {
  readonly type: PieceType;
  readonly section: Section;
  readonly length: number;
  readonly machinings: readonly Machining[];
}

/** Campi delle lavorazioni che non influenzano la geometria. */
const NON_GEOMETRIC = new Set(["id", "pieceId", "jointId"]);

/** Numeri arrotondati a 1e-6 mm (rumore numerico) e senza `-0`. */
const canonNumber = (n: number): number => {
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
};

/** JSON canonico: chiavi ordinate, campi non geometrici delle lavorazioni esclusi. */
export function canonicalJson(value: unknown, skip: ReadonlySet<string> = new Set()): string {
  if (typeof value === "number") return JSON.stringify(canonNumber(value));
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v, skip)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([k, v]) => v !== undefined && !skip.has(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v, skip)}`).join(",")}}`;
}

/** Hash stabile a 53 bit (cyrb53) in esadecimale. */
export function stableHash(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** Chiave di cache del pezzo: hash di tipo + sezione + lunghezza + lavorazioni. */
export function pieceCacheKey(piece: CacheKeyInput): string {
  const machinings = piece.machinings.map((m) => canonicalJson(m, NON_GEOMETRIC));
  return stableHash(
    canonicalJson({ type: piece.type, section: piece.section, length: piece.length }) + "|" + machinings.join("|"),
  );
}

/** Cache LRU con capacità massima; `onEvict` libera le risorse (es. solidi OCCT). */
export class LruCache<V> {
  private readonly map = new Map<string, V>();

  constructor(
    readonly capacity: number = 512,
    private readonly onEvict?: (value: V, key: string) => void,
  ) {}

  get size(): number {
    return this.map.size;
  }

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, value: V): void {
    const old = this.map.get(key);
    if (old !== undefined) {
      this.map.delete(key);
      if (old !== value) this.onEvict?.(old, key);
    }
    this.map.set(key, value);
    while (this.map.size > this.capacity) {
      const [k, v] = this.map.entries().next().value as [string, V];
      this.map.delete(k);
      this.onEvict?.(v, k);
    }
  }

  clear(): void {
    for (const [k, v] of this.map) this.onEvict?.(v, k);
    this.map.clear();
  }
}
