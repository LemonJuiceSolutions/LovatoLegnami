import type { HardwareItem } from "../components/types";
import { HARDWARE_FAMILY_OF, type HardwareFamily, formatHardwareId } from "./ids";
import { isCountedKind } from "./expand";

/**
 * Fonde l'elenco ferramenta (spec "Conteggio di viti e tasselli"): viti e
 * tasselli diventano **una voce per codice** con la quantità sommata, i pezzi
 * collegati uniti (ordine di prima comparsa), senza posa né lavorazioni, e
 * con id `VIT-nn`/`TAS-nn` numerati nell'ordine di prima comparsa del codice;
 * ogni voce fusa prende il posto della prima occorrenza. Le altre voci
 * restano singole e invariate. Deterministica.
 */
export function mergeHardware(items: readonly HardwareItem[]): HardwareItem[] {
  const out: (HardwareItem | { code: string })[] = [];
  const merged = new Map<string, { quantity: number; pieceIds: string[]; first: HardwareItem }>();
  for (const it of items) {
    if (!isCountedKind(it.kind)) {
      out.push(it);
      continue;
    }
    const m = merged.get(it.code);
    if (m) {
      m.quantity += it.quantity;
      for (const id of it.pieceIds) if (!m.pieceIds.includes(id)) m.pieceIds.push(id);
    } else {
      merged.set(it.code, { quantity: it.quantity, pieceIds: [...it.pieceIds], first: it });
      out.push({ code: it.code });
    }
  }
  const counters = new Map<HardwareFamily, number>();
  return out.map((o) => {
    if ("id" in o) return o;
    const m = merged.get(o.code)!;
    const family = HARDWARE_FAMILY_OF[m.first.kind];
    const n = (counters.get(family) ?? 0) + 1;
    counters.set(family, n);
    return {
      id: formatHardwareId(family, n),
      code: m.first.code,
      kind: m.first.kind,
      description: m.first.description,
      quantity: m.quantity,
      pieceIds: m.pieceIds,
      machiningIds: [],
      params: {},
    };
  });
}
