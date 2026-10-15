import { CLEAR_HEIGHT_TYPES, pieceAabb } from "../../assembly/bounds";
import { measureAssembly } from "../../assembly/measures";
import type { PieceType } from "../../components/types";
import { mul } from "../money";
import type { PricingWarning } from "../types";
import { append, fmt, fmtPrice, line, round6, type Phase, type PricingAssembly } from "./shared";

/**
 * Fase `covering` (spec "Ferramenta, trattamenti e copertura"): copertura scelta al m²
 * di falda in proiezione reale (area in pianta ÷ cos pendenza).
 */

/** Area di falda reale (m²) da area in pianta e pendenza (gradi). */
export const roofArea = (planAreaM2: number, slopeDeg: number): number => round6(planAreaM2 / Math.cos((slopeDeg * Math.PI) / 180));

/** Pezzi che portano la copertura: struttura di copertura (`CLEAR_HEIGHT_TYPES`) e archi. */
const ROOF_TYPES: readonly PieceType[] = [...CLEAR_HEIGHT_TYPES, "arco"];

export interface CoveringGeometry {
  /** Estensione in pianta della struttura di copertura (mm). */
  readonly widthMm: number;
  readonly depthMm: number;
  readonly planAreaM2: number;
  /** Pendenza di falda (gradi). */
  readonly slopeDeg: number;
  /** Area di falda in proiezione reale (m²). */
  readonly areaM2: number;
  /** Da dove viene la pendenza. */
  readonly slopeSource: "meta" | "travetti" | "piana";
}

/**
 * Geometria della copertura: AABB in pianta dei pezzi di copertura; pendenza dal metadato
 * `pendenza` dell'assieme (quella effettiva del template, anche imposta dalla ferramenta),
 * altrimenti dalla pendenza misurata dei travetti, altrimenti 0. Approssimazioni
 * dichiarate: pianta rettangolare (gazebo poligonali sovrastimati), archi come piani.
 */
export function coveringGeometry(assembly: PricingAssembly): CoveringGeometry {
  const roof = assembly.pieces.filter((p) => ROOF_TYPES.includes(p.type));
  let widthMm = 0;
  let depthMm = 0;
  if (roof.length > 0) {
    const boxes = roof.map(pieceAabb);
    widthMm = Math.max(...boxes.map((b) => b.max.x)) - Math.min(...boxes.map((b) => b.min.x));
    depthMm = Math.max(...boxes.map((b) => b.max.y)) - Math.min(...boxes.map((b) => b.min.y));
  }
  const planAreaM2 = round6((widthMm * depthMm) / 1e6);
  const meta = assembly.meta?.pendenza;
  let slopeDeg = 0;
  let slopeSource: CoveringGeometry["slopeSource"] = "piana";
  if (typeof meta === "number" && Number.isFinite(meta)) {
    slopeDeg = meta;
    slopeSource = "meta";
  } else {
    const measured = measureAssembly({ pieces: assembly.pieces }).slope;
    if (measured !== undefined && measured > 1e-6) {
      slopeDeg = measured;
      slopeSource = "travetti";
    }
  }
  slopeDeg = round6(slopeDeg);
  return { widthMm: round6(widthMm), depthMm: round6(depthMm), planAreaM2, slopeDeg, areaM2: roofArea(planAreaM2, slopeDeg), slopeSource };
}

export const coveringPhase: Phase = (ctx, state) => {
  const id = ctx.options.covering;
  if (!id) return state;
  const item = ctx.priceList.coverings.find((c) => c.id === id);
  const g = coveringGeometry(ctx.assembly);
  const warnings: PricingWarning[] = item
    ? []
    : [{ code: "prezzo-mancante", message: `copertura "${id}" non presente nel listino`, ref: id, blocking: true }];
  const l = line({
    code: `copertura-${id}`,
    category: "copertura",
    label: `Copertura – ${item?.label ?? id}`,
    quantity: g.areaM2,
    unit: "m²",
    unitPriceCents: item?.pricePerM2Cents ?? 0,
    amountCents: item ? mul(item.pricePerM2Cents, g.areaM2) : 0,
    explain: [
      `falda in pianta ${fmt(g.widthMm / 1000)} × ${fmt(g.depthMm / 1000)} m = ${fmt(g.planAreaM2)} m², pendenza ${fmt(g.slopeDeg, 1)}° ⇒ ${fmt(g.areaM2)} m² reali`,
      item ? `${fmt(g.areaM2)} m² × ${fmtPrice(item.pricePerM2Cents, "m²")}` : "prezzo mancante",
      ctx.versionLabel,
    ],
  });
  return append(state, [l], warnings);
};
