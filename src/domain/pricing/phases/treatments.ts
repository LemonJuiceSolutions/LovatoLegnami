import type { Piece } from "../../components/types";
import { mul } from "../money";
import type { PricingWarning, QuoteLine } from "../types";
import { append, fmt, fmtPrice, line, round6, type Phase } from "./shared";

/**
 * Fase `treatments` (spec "Ferramenta, trattamenti e copertura"): trattamento al m² di
 * superficie sviluppata del legno (perimetro della sezione × lunghezza di ogni pezzo).
 */

/** Superficie sviluppata del pezzo (m²): perimetro della sezione × lunghezza (sviluppo per i curvi). */
export const pieceSurfaceM2 = (p: Pick<Piece, "section" | "length">): number => round6((2 * (p.section.b + p.section.h) * p.length) / 1e6);

export const treatmentsPhase: Phase = (ctx, state) => {
  const id = ctx.options.treatment;
  if (!id) return state;
  const item = ctx.priceList.treatments.find((t) => t.id === id);
  const area = round6(ctx.assembly.pieces.reduce((s, p) => s + pieceSurfaceM2(p), 0));
  const warnings: PricingWarning[] = item
    ? []
    : [{ code: "prezzo-mancante", message: `trattamento "${id}" non presente nel listino`, ref: id, blocking: true }];
  const l: QuoteLine = line({
    code: `trattamento-${id}`,
    category: "trattamenti",
    label: `Trattamento – ${item?.label ?? id}`,
    quantity: area,
    unit: "m²",
    unitPriceCents: item?.pricePerM2Cents ?? 0,
    amountCents: item ? mul(item.pricePerM2Cents, area) : 0,
    explain: [
      `superficie sviluppata di ${ctx.assembly.pieces.length} pezzi (perimetro della sezione × lunghezza): ${fmt(area)} m²`,
      item ? `${fmt(area)} m² × ${fmtPrice(item.pricePerM2Cents, "m²")}` : "prezzo mancante",
      ctx.versionLabel,
    ],
  });
  return append(state, [l], warnings);
};
