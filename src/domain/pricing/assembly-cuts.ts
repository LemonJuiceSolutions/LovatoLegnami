import { sectionLabel } from "../components/sections";
import { CURVED_PIECE_TYPES, type Assembly, type Piece, type PieceType, type Section } from "../components/types";
import { planCuts, type PlanTuning } from "./cutting-stock";
import { roundHalfUp, type Cents } from "./money";
import type { CutDemand, CuttingPlan, PriceList, PricingOptions, PricingWarning, StockOption } from "./types";

/**
 * Piano di taglio dell'assieme (3.3, spec `ottimizzazione-taglio`): pezzi dritti
 * raggruppati per (specie, qualità, sezione), barre e prezzi dal listino, sfrido per
 * gruppo. Curvi e pannelli sono esclusi dal piano e restituiti a parte (prezzati dalla
 * fase `timber` al ml di sviluppo e al m²).
 */

/** Come è prezzata la barra di un gruppo (priorità decrescente). */
export type BarPricing = "barra" | "ml" | "m3" | "mancante";

export interface CutGroup {
  /** `specie|qualità|b×h`. */
  readonly key: string;
  readonly species: string;
  readonly quality: string;
  /** Sezione normalizzata (`b ≤ h`). */
  readonly section: Section;
  readonly sectionLabel: string;
  /**
   * Origine del prezzo: `barra` (prezzo della lunghezza commerciale), `ml` (cent/ml della
   * sezione), `m3` (cent/m³ di specie e qualità × volume della barra), `mancante`.
   */
  readonly pricing: BarPricing;
  /** Prezzo unitario dell'origine: cent/ml, cent/m³ (0 per `barra` e `mancante`). */
  readonly unitPriceCents: Cents;
  readonly plan: CuttingPlan;
  readonly pieceIds: readonly string[];
  /** Somma delle lunghezze nette dei pezzi (mm). */
  readonly piecesLengthMm: number;
  /** Somma delle lunghezze delle barre consumate (mm). */
  readonly barsLengthMm: number;
  readonly piecesVolumeM3: number;
  readonly barsVolumeM3: number;
  /** (volume barre − volume pezzi) / volume barre × 100. */
  readonly wastePct: number;
  readonly costCents: Cents;
  /** Lunghezze degli spezzoni riutilizzabili (mm), in ordine decrescente. */
  readonly reusableOffcuts: readonly number[];
  /** Costo pro quota degli spezzoni riutilizzabili (prezzo barra × spezzone / lunghezza). */
  readonly reusableOffcutCostCents: Cents;
}

export interface CurvedPiece {
  readonly id: string;
  readonly type: PieceType;
  readonly section: Section;
  readonly sectionLabel: string;
  /** Sviluppo dell'asse (mm) = `length` del pezzo curvo. */
  readonly developmentMm: number;
  readonly radius: number;
  readonly sweep: number;
}

export interface PanelPiece {
  readonly id: string;
  readonly type: PieceType;
  /** Lunghezza × lato maggiore della sezione (m²). */
  readonly areaM2: number;
}

export interface AssemblyCutPlan {
  readonly species: string;
  readonly quality: string;
  readonly groups: readonly CutGroup[];
  readonly curved: readonly CurvedPiece[];
  readonly panels: readonly PanelPiece[];
  readonly warnings: readonly PricingWarning[];
  readonly totals: {
    readonly piecesVolumeM3: number;
    readonly barsVolumeM3: number;
    readonly wastePct: number;
    readonly costCents: Cents;
  };
}

const round6 = (x: number): number => {
  const r = Math.round(x * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

/** Sezione con il lato minore come base (le chiavi del listino sono `b ≤ h`). */
const normalize = (s: Section): Section => (s.b <= s.h ? { b: s.b, h: s.h } : { b: s.h, h: s.b });

const volumeM3 = (s: Section, lengthMm: number): number => (s.b * s.h * lengthMm) / 1e9;

const wastePct = (bars: number, pieces: number): number => (bars > 0 ? round6(((bars - pieces) / bars) * 100) : 0);

/** Prezzo di una lunghezza commerciale (centesimi), `undefined` se manca ogni fonte. */
function barPrice(
  length: number,
  explicit: Cents | undefined,
  perMl: Cents | undefined,
  perM3: Cents | undefined,
  section: Section,
): { price?: Cents } {
  if (explicit !== undefined) return { price: explicit };
  if (perMl !== undefined) return { price: roundHalfUp((perMl * length) / 1000) };
  if (perM3 !== undefined) return { price: roundHalfUp(perM3 * volumeM3(section, length)) };
  return {};
}

/**
 * Piano di taglio dell'assieme con specie e qualità delle opzioni commerciali.
 * Avvisi: `lunghezze-mancanti` (sezione senza lunghezze commerciali per la qualità),
 * `prezzo-mancante` (né prezzo della barra, né €/ml, né €/m³), `non-ricavabile` (pezzo
 * più lungo della lunghezza utile massima); tutti bloccanti.
 */
export function planAssemblyCuts(
  assembly: Pick<Assembly, "pieces">,
  priceList: PriceList,
  options: Pick<PricingOptions, "species" | "quality">,
  tuning?: PlanTuning,
): AssemblyCutPlan {
  const { species, quality } = options;
  const t = priceList.timber;
  const warnings: PricingWarning[] = [];
  const curved: CurvedPiece[] = [];
  const panels: PanelPiece[] = [];
  const byKey = new Map<string, { section: Section; pieces: Piece[] }>();

  for (const p of assembly.pieces) {
    if (p.curve || CURVED_PIECE_TYPES.includes(p.type)) {
      const section = normalize(p.section);
      curved.push({
        id: p.id,
        type: p.type,
        section,
        sectionLabel: sectionLabel(section),
        developmentMm: p.length,
        radius: p.curve?.radius ?? 0,
        sweep: p.curve?.sweep ?? 0,
      });
      continue;
    }
    if (t.panelsPerM2[p.type] !== undefined) {
      panels.push({ id: p.id, type: p.type, areaM2: round6((p.length * Math.max(p.section.b, p.section.h)) / 1e6) });
      continue;
    }
    const section = normalize(p.section);
    const key = `${species}|${quality}|${sectionLabel(section)}`;
    const g = byKey.get(key) ?? { section, pieces: [] };
    g.pieces.push(p);
    byKey.set(key, g);
  }

  const perM3 = t.pricePerM3[species]?.[quality];
  const groups: CutGroup[] = [];
  for (const [key, { section, pieces }] of [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const label = sectionLabel(section);
    const lengths = (t.stockLengths[label] ?? []).filter((l) => !l.qualities || l.qualities.includes(quality));
    const perMl = t.pricePerMl?.[label];
    if (lengths.length === 0) {
      warnings.push({
        code: "lunghezze-mancanti",
        message: `nessuna lunghezza commerciale per la sezione ${label} in qualità ${quality}`,
        ref: label,
        blocking: true,
      });
    }

    // prezzi delle barre: prezzo della lunghezza > €/ml della sezione > €/m³ di specie e qualità;
    // senza prezzo si ottimizza con un costo proporzionale alla lunghezza e il gruppo vale 0
    const base: BarPricing = perMl !== undefined ? "ml" : perM3 !== undefined ? "m3" : "mancante";
    const priced = lengths.map((l) => ({ length: l.length, price: barPrice(l.length, l.priceCents, perMl, perM3, section).price }));
    const missing = priced.some((p) => p.price === undefined);
    const pricing: BarPricing = missing ? "mancante" : lengths.every((l) => l.priceCents !== undefined) ? "barra" : base;
    if (missing) {
      warnings.push({
        code: "prezzo-mancante",
        message: `prezzo mancante per ${species} ${quality} sezione ${label} (né prezzo della barra, né €/ml, né €/m³)`,
        ref: `${species}|${quality}|${label}`,
        blocking: true,
      });
    }
    const stock: StockOption[] = priced.map((p) => ({ length: p.length, priceCents: missing ? p.length : p.price! }));
    const demands: CutDemand[] = pieces.map((p) => ({ id: p.id, length: p.length }));
    const opts = {
      kerf: t.kerf,
      endTrim: t.endTrim,
      minReusableOffcut: t.minReusableOffcut[label] ?? Number.POSITIVE_INFINITY,
    };
    const raw = planCuts(demands, stock, opts, tuning);
    const plan: CuttingPlan = missing
      ? { ...raw, costCents: 0, bars: raw.bars.map((b) => ({ ...b, priceCents: 0 })) }
      : raw;

    for (const d of plan.nonRicavabili) {
      const max = lengths.reduce((m, l) => Math.max(m, l.length), 0);
      if (max === 0) continue; // già segnalato come lunghezze mancanti
      warnings.push({
        code: "non-ricavabile",
        message: `pezzo ${d.id} lungo ${d.length} mm non ricavabile (sezione ${label}, lunghezza commerciale massima ${max} mm)`,
        ref: d.id,
        blocking: true,
      });
    }

    const piecesLengthMm = round6(pieces.reduce((s, p) => s + p.length, 0));
    const barsLengthMm = plan.bars.reduce((s, b) => s + b.length, 0);
    const usedPiecesLength = round6(plan.bars.reduce((s, b) => s + b.cuts.reduce((x, c) => x + c.length, 0), 0));
    const reusable = plan.bars.filter((b) => b.reusable);
    groups.push({
      key,
      species,
      quality,
      section,
      sectionLabel: label,
      pricing,
      unitPriceCents: pricing === "ml" ? perMl! : pricing === "m3" ? perM3! : 0,
      plan,
      pieceIds: pieces.map((p) => p.id),
      piecesLengthMm,
      barsLengthMm,
      piecesVolumeM3: round6(volumeM3(section, usedPiecesLength)),
      barsVolumeM3: round6(volumeM3(section, barsLengthMm)),
      wastePct: wastePct(barsLengthMm, usedPiecesLength),
      costCents: plan.costCents,
      reusableOffcuts: reusable.map((b) => b.offcut).sort((a, b) => b - a),
      reusableOffcutCostCents: reusable.reduce((s, b) => s + roundHalfUp((b.priceCents * b.offcut) / b.length), 0),
    });
  }

  const piecesVolumeM3 = round6(groups.reduce((s, g) => s + g.piecesVolumeM3, 0));
  const barsVolumeM3 = round6(groups.reduce((s, g) => s + g.barsVolumeM3, 0));
  return {
    species,
    quality,
    groups,
    curved: curved.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    panels: panels.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    warnings,
    totals: {
      piecesVolumeM3,
      barsVolumeM3,
      wastePct: barsVolumeM3 > 0 ? round6(((barsVolumeM3 - piecesVolumeM3) / barsVolumeM3) * 100) : 0,
      costCents: groups.reduce((s, g) => s + g.costCents, 0),
    },
  };
}
