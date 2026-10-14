import type { HardwareKind } from "../components/types";

/** Famiglie di id della ferramenta (prefisso `<FAM>-<nn>`, E3). */
export const HARDWARE_FAMILIES = ["BUL", "VIT", "TAS", "STM", "STT", "GNT", "CUS", "PST"] as const;
export type HardwareFamily = (typeof HARDWARE_FAMILIES)[number];

export const HARDWARE_FAMILY_OF: Readonly<Record<HardwareKind, HardwareFamily>> = {
  bullone: "BUL",
  vite: "VIT",
  tassello: "TAS",
  "staffa-muro": "STM",
  "staffa-terra": "STT",
  "giunto-vie": "GNT",
  cuspide: "CUS",
  piastra: "PST",
};

export const isHardwareFamily = (v: string): v is HardwareFamily => (HARDWARE_FAMILIES as readonly string[]).includes(v);

/** Id stabile di una voce di ferramenta: `<FAM>-<nn>` (es. `BUL-01`). */
export function formatHardwareId(family: HardwareFamily, n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`numero progressivo non valido: ${n}`);
  return `${family}-${String(n).padStart(2, "0")}`;
}
