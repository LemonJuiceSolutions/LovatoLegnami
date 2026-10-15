import type { PieceFamily } from "@/domain"
import { mixHex } from "./theme-colors"

/**
 * Colori dei pezzi per famiglia, condivisi dal visualizzatore 3D e dalle
 * miniature delle tipologie (`thumbnails/isometric.ts`). Toni legno fissi
 * (non dipendono dal tema: il legno resta legno anche in modalità scura);
 * sfondo, contorni ed evidenziazioni seguono invece i token del tema.
 * Modulo puro, senza React né Three.
 */

/** Toni legno per famiglia (pezzi strutturali): distinguibili ma coerenti. */
export const FAMILY_COLORS: Readonly<Record<PieceFamily, string>> = {
  PIL: "#8b5a2b",
  TRV: "#b07a3e",
  TVT: "#d9b27c",
  PNT: "#a0662f",
  COL: "#6f4521",
  CTV: "#c4925a",
  BNC: "#9c7a54",
  TAV: "#c08a4a",
  ARC: "#7d4f26",
  CAN: "#94592a",
  MON: "#5e3a1c",
  MEN: "#b5824a",
  FAS: "#e0c194",
  GRG: "#cfae86",
}

export const FAMILY_LABELS: Readonly<Record<PieceFamily, string>> = {
  PIL: "Pilastri",
  TRV: "Travi",
  TVT: "Travetti",
  PNT: "Puntoni",
  COL: "Colmo",
  CTV: "Controventi",
  BNC: "Banchina",
  TAV: "Tavole",
  ARC: "Archi",
  CAN: "Cantonali",
  MON: "Monaci",
  MEN: "Mensole",
  FAS: "Fasce",
  GRG: "Grigliati",
}

/** Orientamento di una faccia per l'ombreggiatura piatta delle miniature. */
export type FaceShade = "alto" | "fronte" | "lato"

/** Fattori di schiarimento (verso il bianco) / scurimento (verso il nero) per orientamento. */
const SHADE: Readonly<Record<FaceShade, { readonly toward: string; readonly t: number }>> = {
  alto: { toward: "#ffffff", t: 0.18 },
  fronte: { toward: "#000000", t: 0 },
  lato: { toward: "#000000", t: 0.22 },
}

/** Colore della famiglia ombreggiato per l'orientamento della faccia. */
export function shadedFamilyColor(family: PieceFamily, shade: FaceShade): string {
  const s = SHADE[shade]
  return s.t === 0 ? FAMILY_COLORS[family] : mixHex(FAMILY_COLORS[family], s.toward, s.t)
}
