import { formatPath } from "../components/errors";

/**
 * Differenze tra due documenti JSON (listini, regole, …): base del registro modifiche
 * (6.4), dell'anteprima di pubblicazione (9.4) e dell'import CSV (4.6).
 */

export interface DiffEntry {
  /** Percorso del campo, es. `timber.pricePerM3.abete.lamellare`, `transport.zones[1].priceCents`. */
  readonly path: string;
  /** Valore precedente (assente se il campo è stato aggiunto). */
  readonly before?: unknown;
  /** Valore nuovo (assente se il campo è stato rimosso). */
  readonly after?: unknown;
}

type Json = unknown;

const isObject = (v: Json): v is Record<string, Json> => typeof v === "object" && v !== null && !Array.isArray(v);

function walk(a: Json, b: Json, path: (string | number)[], out: DiffEntry[]): void {
  if (Object.is(a, b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (i >= a.length) out.push({ path: formatPath([...path, i]), after: b[i] });
      else if (i >= b.length) out.push({ path: formatPath([...path, i]), before: a[i] });
      else walk(a[i], b[i], [...path, i], out);
    }
    return;
  }
  if (isObject(a) && isObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      const inA = a[k] !== undefined;
      const inB = b[k] !== undefined;
      if (inA && !inB) out.push({ path: formatPath([...path, k]), before: a[k] });
      else if (!inA && inB) out.push({ path: formatPath([...path, k]), after: b[k] });
      else if (inA && inB) walk(a[k], b[k], [...path, k], out);
    }
    return;
  }
  out.push({ path: formatPath(path), ...(a !== undefined ? { before: a } : {}), ...(b !== undefined ? { after: b } : {}) });
}

/**
 * Elenco dei campi diversi tra `a` e `b`, in ordine deterministico (chiavi ordinate,
 * elementi degli array per indice). I sottoalberi aggiunti o rimossi sono una voce sola;
 * un valore che cambia tipo (es. numero → oggetto) è una voce sola sul suo percorso.
 */
export function diffDocuments(a: unknown, b: unknown): DiffEntry[] {
  const out: DiffEntry[] = [];
  walk(a, b, [], out);
  return out;
}
