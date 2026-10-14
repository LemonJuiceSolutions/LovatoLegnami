import { ValidationError } from "./errors";
import { parseAssembly } from "./schemas";
import type { Assembly } from "./types";

/** Copia con le chiavi degli oggetti in ordine alfabetico (array invariati). */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/**
 * Serializza l'assieme in JSON stabile (chiavi ordinate, indentazione 2,
 * unità mm e gradi). L'assieme è validato prima della scrittura.
 */
export function toJSON(assembly: Assembly): string {
  return JSON.stringify(sortKeys(parseAssembly(assembly)), null, 2);
}

/** Deserializza e valida; errori come `ValidationError` con il percorso del campo. */
export function fromJSON(text: string): Assembly {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ValidationError("JSON non valido", [{ path: "(radice)", message: (e as Error).message }]);
  }
  return parseAssembly(data);
}
