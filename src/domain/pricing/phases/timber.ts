import type { PieceType } from "../../components/types";
import type { CutGroup } from "../assembly-cuts";
import { mul, percent, roundHalfUp, sub, type Cents } from "../money";
import type { PricingWarning, QuoteLine } from "../types";
import { append, fmt, fmtPrice, labelOf, line, pieceTypesLabel, round6, type Phase, type PricingContext } from "./shared";

/**
 * Fase `timber` (spec "Costo del legno dalle barre consumate"): per ogni gruppo del piano
 * di taglio una riga **legno netto** (volume o metri dei pezzi) e una riga **sfrido**
 * (barre consumate − pezzi, con la percentuale), più l'eventuale **recupero spezzoni**
 * negativo; curvi al metro lineare di sviluppo più un fisso di curvatura per pezzo;
 * pannelli al m². Gli avvisi del piano di taglio (prezzi o lunghezze mancanti, pezzi non
 * ricavabili) passano al preventivo.
 */

const barsSummary = (g: CutGroup): string => {
  const byLength = new Map<number, number>();
  for (const b of g.plan.bars) byLength.set(b.length, (byLength.get(b.length) ?? 0) + 1);
  return [...byLength.entries()]
    .sort(([a], [b]) => b - a)
    .map(([l, n]) => `${n} × ${l} mm`)
    .join(", ");
};

function groupLines(ctx: PricingContext, g: CutGroup, typeOf: ReadonlyMap<string, PieceType>): QuoteLine[] {
  const t = ctx.priceList.timber;
  const sec = g.sectionLabel;
  const what = `${pieceTypesLabel(g.pieceIds.map((id) => typeOf.get(id)!))} ${sec}`;
  const wood = `${labelOf(t.species, g.species)}, ${labelOf(t.qualities, g.quality)}`;
  const usedLengthMm = g.plan.bars.reduce((s, b) => s + b.cuts.reduce((x, c) => x + c.length, 0), 0);
  const n = g.pieceIds.length;
  const cost = g.costCents;

  let net: { quantity: number; unit: string; unitPriceCents: Cents; amountCents: Cents; how: string };
  let wasteQty: number;
  switch (g.pricing) {
    case "ml":
      net = {
        quantity: usedLengthMm / 1000,
        unit: "ml",
        unitPriceCents: g.unitPriceCents,
        amountCents: mul(g.unitPriceCents, round6(usedLengthMm / 1000)),
        how: `prezzo al metro lineare della sezione ${sec}: ${fmt(usedLengthMm / 1000)} ml × ${fmtPrice(g.unitPriceCents, "ml")}`,
      };
      wasteQty = (g.barsLengthMm - usedLengthMm) / 1000;
      break;
    case "m3":
      net = {
        quantity: g.piecesVolumeM3,
        unit: "m³",
        unitPriceCents: g.unitPriceCents,
        amountCents: mul(g.unitPriceCents, g.piecesVolumeM3),
        how: `${fmt(g.piecesVolumeM3, 6)} m³ × ${fmtPrice(g.unitPriceCents, "m³")}`,
      };
      wasteQty = g.barsVolumeM3 - g.piecesVolumeM3;
      break;
    case "barra": {
      const avg = g.barsVolumeM3 > 0 ? roundHalfUp(cost / g.barsVolumeM3) : 0;
      net = {
        quantity: g.piecesVolumeM3,
        unit: "m³",
        unitPriceCents: avg,
        amountCents: g.barsVolumeM3 > 0 ? roundHalfUp((cost * g.piecesVolumeM3) / g.barsVolumeM3) : 0,
        how: `prezzo per barra dal listino (media ${fmtPrice(avg, "m³")}): ${fmt(g.piecesVolumeM3, 6)} m³`,
      };
      wasteQty = g.barsVolumeM3 - g.piecesVolumeM3;
      break;
    }
    case "mancante":
      net = { quantity: g.piecesVolumeM3, unit: "m³", unitPriceCents: 0, amountCents: 0, how: `prezzo mancante per ${wood} sezione ${sec}` };
      wasteQty = g.barsVolumeM3 - g.piecesVolumeM3;
      break;
  }
  // il netto non supera mai il costo delle barre (arrotondamenti per barra)
  const netAmount = Math.min(net.amountCents, cost);
  const out: QuoteLine[] = [
    line({
      code: `legno-${sec}`,
      category: "legno",
      label: `Legno – ${what}`,
      quantity: net.quantity,
      unit: net.unit,
      unitPriceCents: net.unitPriceCents,
      amountCents: g.pricing === "mancante" ? 0 : netAmount,
      explain: [
        `${wood}, sezione ${sec}: ${n} ${n === 1 ? "pezzo" : "pezzi"}, ${fmt(usedLengthMm / 1000)} ml netti`,
        net.how,
        ctx.versionLabel,
      ],
    }),
  ];
  if (g.plan.bars.length > 0) {
    out.push(
      line({
        code: `sfrido-${sec}`,
        category: "sfrido",
        label: `Sfrido – ${what}`,
        quantity: wasteQty,
        unit: net.unit,
        unitPriceCents: net.unitPriceCents,
        amountCents: g.pricing === "mancante" ? 0 : sub(cost, netAmount),
        explain: [
          `sfrido ${fmt(g.wastePct, 1)}%: barre ${fmt(g.barsVolumeM3, 6)} m³ − pezzi ${fmt(g.piecesVolumeM3, 6)} m³`,
          `barre consumate: ${barsSummary(g)} (lama ${fmt(t.kerf)} mm, rifili ${fmt(t.endTrim)} mm per testa)`,
          ctx.versionLabel,
        ],
      }),
    );
  }
  if (t.offcutRecoveryPct > 0 && g.reusableOffcutCostCents > 0) {
    out.push(
      line({
        code: `recupero-${sec}`,
        category: "sfrido",
        label: `Recupero spezzoni – ${sec}`,
        quantity: t.offcutRecoveryPct,
        unit: "%",
        unitPriceCents: g.reusableOffcutCostCents,
        amountCents: -percent(g.reusableOffcutCostCents, t.offcutRecoveryPct),
        explain: [
          `spezzoni riutilizzabili: ${g.reusableOffcuts.map((l) => `${fmt(l)} mm`).join(", ")} (valore ${fmtPrice(g.reusableOffcutCostCents)})`,
          `recupero ${fmt(t.offcutRecoveryPct)}% del valore`,
          ctx.versionLabel,
        ],
      }),
    );
  }
  return out;
}

export const timberPhase: Phase = (ctx, state) => {
  const t = ctx.priceList.timber;
  const plan = ctx.cutPlan;
  const typeOf = new Map(ctx.assembly.pieces.map((p) => [p.id, p.type]));
  const lines: QuoteLine[] = plan.groups.flatMap((g) => groupLines(ctx, g, typeOf));
  const warnings: PricingWarning[] = [...plan.warnings];

  // curvi: per sezione, metri lineari di sviluppo + fisso di curvatura per pezzo
  const curvedBySection = new Map<string, typeof plan.curved>();
  for (const c of plan.curved) curvedBySection.set(c.sectionLabel, [...(curvedBySection.get(c.sectionLabel) ?? []), c]);
  for (const [sec, pieces] of [...curvedBySection.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const perMl = t.curvedPerMl[sec];
    const ml = round6(pieces.reduce((s, p) => s + p.developmentMm, 0) / 1000);
    const what = `${pieceTypesLabel(pieces.map((p) => p.type))} ${sec}`;
    if (perMl === undefined) {
      warnings.push({ code: "prezzo-mancante", message: `prezzo mancante per i pezzi curvi della sezione ${sec}`, ref: `curvo|${sec}`, blocking: true });
    }
    lines.push(
      line({
        code: `legno-curvo-${sec}`,
        category: "legno",
        label: `Legno curvo – ${what}`,
        quantity: ml,
        unit: "ml",
        unitPriceCents: perMl ?? 0,
        amountCents: perMl === undefined ? 0 : mul(perMl, ml),
        explain: [
          `${pieces.length} ${pieces.length === 1 ? "pezzo curvo" : "pezzi curvi"} (${pieces.map((p) => `${p.id} R ${fmt(p.radius, 0)} mm`).join(", ")}), ${fmt(ml)} ml di sviluppo`,
          perMl === undefined ? `prezzo mancante per la sezione ${sec}` : `${fmt(ml)} ml × ${fmtPrice(perMl, "ml")} (lamellare curvo, prezzo per sezione)`,
          ctx.versionLabel,
        ],
      }),
      line({
        code: `curvatura-${sec}`,
        category: "legno",
        label: `Curvatura – ${what}`,
        quantity: pieces.length,
        unit: "pz",
        unitPriceCents: t.curvedSetupCents,
        amountCents: mul(t.curvedSetupCents, pieces.length),
        explain: [`fisso di curvatura per pezzo: ${pieces.length} × ${fmtPrice(t.curvedSetupCents)}`, ctx.versionLabel],
      }),
    );
  }

  // pannelli al m²
  const panelsByType = new Map<PieceType, number>();
  for (const p of plan.panels) panelsByType.set(p.type, (panelsByType.get(p.type) ?? 0) + p.areaM2);
  for (const [type, area] of panelsByType) {
    const price = t.panelsPerM2[type] ?? 0;
    const count = plan.panels.filter((p) => p.type === type).length;
    lines.push(
      line({
        code: `pannelli-${type}`,
        category: "legno",
        label: `Pannelli – ${pieceTypesLabel(plan.panels.filter((p) => p.type === type).map((p) => p.type))}`,
        quantity: round6(area),
        unit: "m²",
        unitPriceCents: price,
        amountCents: mul(price, round6(area)),
        explain: [`${count} ${count === 1 ? "pannello" : "pannelli"}: ${fmt(area)} m² × ${fmtPrice(price, "m²")}`, ctx.versionLabel],
      }),
    );
  }
  return append(state, lines, warnings);
};
