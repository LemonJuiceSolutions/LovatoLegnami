import { FAMILY_OF, HARDWARE_KINDS, PIECE_FAMILIES, isPieceType, type HardwareKind, type PieceFamily, type PieceType } from "../components/types";
import { HARDWARE_FAMILY_OF, type HardwareFamily, formatHardwareId, isHardwareFamily } from "../hardware/ids";

/** Numero a due cifre minime (`7` → `"07"`, `123` → `"123"`). */
const pad2 = (n: number): string => String(n).padStart(2, "0");

const isFamily = (v: string): v is PieceFamily => (PIECE_FAMILIES as readonly string[]).includes(v);

/** Id stabile di un pezzo: `<FAM>-<nn>` (es. `PIL-01`, `TVT-11`). */
export function formatPieceId(family: PieceFamily, n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`numero progressivo non valido: ${n}`);
  return `${family}-${pad2(n)}`;
}

/** Id stabile di un giunto: `G-<nn>`. */
export function formatJointId(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`numero progressivo non valido: ${n}`);
  return `G-${pad2(n)}`;
}

/** Scompone un id di pezzo `<FAM>-<nn>`; `undefined` se non nel formato. */
export function parsePieceId(id: string): { family: PieceFamily; n: number } | undefined {
  const m = /^([A-Z]{3})-(\d{2,})$/.exec(id);
  if (!m || !isFamily(m[1])) return undefined;
  return { family: m[1], n: Number(m[2]) };
}

/**
 * Generatore deterministico di id: un contatore per famiglia, incrementato
 * nell'ordine di generazione. Due generatori nuovi chiamati con la stessa
 * sequenza producono gli stessi id.
 */
export interface IdGenerator {
  /** Prossimo id per la famiglia (o per il tipo di pezzo, da cui è derivata). */
  nextPiece(familyOrType: PieceFamily | PieceType): string;
  /** Prossimo id di giunto. */
  nextJoint(): string;
  /** Prossimo id di ferramenta per famiglia (o per tipo di ferramenta): `BUL-01`, `STT-01`, … */
  nextHardware(familyOrKind: HardwareFamily | HardwareKind): string;
}

const isHardwareKind = (v: string): v is HardwareKind => (HARDWARE_KINDS as readonly string[]).includes(v);

export function createIdGenerator(): IdGenerator {
  const counters = new Map<PieceFamily, number>();
  const hardware = new Map<HardwareFamily, number>();
  let joints = 0;
  return {
    nextPiece(familyOrType) {
      const family = isPieceType(familyOrType) ? FAMILY_OF[familyOrType] : familyOrType;
      if (!isFamily(family)) throw new Error(`famiglia o tipo di pezzo sconosciuto: ${String(familyOrType)}`);
      const n = (counters.get(family) ?? 0) + 1;
      counters.set(family, n);
      return formatPieceId(family, n);
    },
    nextJoint() {
      joints += 1;
      return formatJointId(joints);
    },
    nextHardware(familyOrKind) {
      const family = isHardwareKind(familyOrKind) ? HARDWARE_FAMILY_OF[familyOrKind] : familyOrKind;
      if (!isHardwareFamily(family)) throw new Error(`famiglia o tipo di ferramenta sconosciuto: ${String(familyOrKind)}`);
      const n = (hardware.get(family) ?? 0) + 1;
      hardware.set(family, n);
      return formatHardwareId(family, n);
    },
  };
}
