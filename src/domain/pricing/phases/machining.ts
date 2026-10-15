import { sectionLabel } from "../../components/sections";
import { PIECE_TYPES, type Machining, type MachiningType, type Piece, type PieceType } from "../../components/types";
import { roundHalfUp } from "../money";
import type { PriceList, PricingWarning, QuoteLine } from "../types";
import { append, fmt, fmtPrice, line, normalizeSection, pieceTypeName, round6, type Phase } from "./shared";

/**
 * Fase `machining` (spec "Costo delle lavorazioni CNC"): tempo macchina = Σ per
 * lavorazione (tempo base del tipo + tempo proporzionale alla grandezza nell'unità del
 * listino) + movimentazione per pezzo, convertito con la tariffa oraria. Una riga per
 * (tipo di pezzo, sezione); i pezzi identici contano per ogni occorrenza.
 */

type MachiningRates = PriceList["machining"];
type RateUnit = MachiningRates["perType"][MachiningType] extends infer R ? (R extends { unit: infer U } ? U : never) : never;

/** Larghezza della faccia laterale (mm): `b` per superiore/inferiore, `h` per sinistra/destra. */
const faceWidth = (p: Piece, face: string): number => (face === "superiore" || face === "inferiore" ? p.section.b : p.section.h);
/** Spessore attraversato perpendicolarmente alla faccia (mm). */
const faceDepth = (p: Piece, face: string): number => (face === "superiore" || face === "inferiore" ? p.section.h : p.section.b);

/**
 * Grandezza della lavorazione nell'unità del listino: `n` = 1 per lavorazione; `mm` =
 * dimensione lineare caratteristica (profondità del foro o spessore se passante, lunghezza
 * di tenone e dardo, larghezza del mezzo legno, profondità di mortasa, asola e becco,
 * altezza della sezione per il taglio di testa); `cm2` = area lavorata (apertura di
 * mortasa, tenone e asola, larghezza × faccia del mezzo legno, sezione del foro, sezione
 * inclinata del taglio di testa, lunghezza × base del dardo, profondità × faccia del becco).
 */
export function machiningMagnitude(m: Machining, piece: Piece, unit: RateUnit): number {
  if (unit === "n") return 1;
  const cos = (deg: number) => Math.max(Math.cos((Math.abs(deg) * Math.PI) / 180), 0.1);
  let mm: number;
  let mm2: number;
  switch (m.type) {
    case "mezzo-legno":
      mm = m.width;
      mm2 = m.width * faceWidth(piece, m.face);
      break;
    case "tenone":
      mm = m.length;
      mm2 = m.width * m.height;
      break;
    case "mortasa":
      mm = m.depth;
      mm2 = m.width * m.height;
      break;
    case "becco-uccello":
      mm = m.depth;
      mm2 = m.depth * faceWidth(piece, m.face);
      break;
    case "foro":
      mm = m.depth ?? faceDepth(piece, m.face);
      mm2 = (Math.PI * m.diameter * m.diameter) / 4;
      break;
    case "taglio-testa":
      mm = piece.section.h / cos(m.angle);
      mm2 = (piece.section.b * piece.section.h) / (cos(m.angle) * cos(m.angle2 ?? 0));
      break;
    case "asola-lama":
      mm = m.depth;
      mm2 = m.width * m.height;
      break;
    case "dardo-di-giove":
      mm = m.length;
      mm2 = m.length * piece.section.b;
      break;
  }
  return unit === "mm" ? mm : mm2 / 100;
}

export interface PieceMachiningTime {
  /** Σ tempi base (min). */
  readonly baseMin: number;
  /** Σ tempi proporzionali (min). */
  readonly proportionalMin: number;
  /** Movimentazione del pezzo (min). */
  readonly handlingMin: number;
  readonly totalMin: number;
  /** Lavorazioni per tipo (conteggi). */
  readonly counts: Readonly<Partial<Record<MachiningType, number>>>;
  /** Tipi senza tariffa nel listino (tempo non conteggiato). */
  readonly missing: readonly MachiningType[];
}

/** Tempo macchina di un pezzo con le tariffe del listino. */
export function pieceMachiningTime(piece: Piece, rates: MachiningRates): PieceMachiningTime {
  let baseMin = 0;
  let proportionalMin = 0;
  const counts: Partial<Record<MachiningType, number>> = {};
  const missing: MachiningType[] = [];
  for (const m of piece.machinings) {
    counts[m.type] = (counts[m.type] ?? 0) + 1;
    const r = rates.perType[m.type];
    if (!r) {
      if (!missing.includes(m.type)) missing.push(m.type);
      continue;
    }
    baseMin += r.baseMin;
    proportionalMin += r.perUnitMin * machiningMagnitude(m, piece, r.unit);
  }
  const handlingMin = rates.handlingMinPerPiece;
  return {
    baseMin: round6(baseMin),
    proportionalMin: round6(proportionalMin),
    handlingMin,
    totalMin: round6(baseMin + proportionalMin + handlingMin),
    counts,
    missing,
  };
}

export const machiningPhase: Phase = (ctx, state) => {
  const rates = ctx.priceList.machining;
  const groups = new Map<string, { type: PieceType; sec: string; pieces: Piece[] }>();
  for (const p of ctx.assembly.pieces) {
    const sec = sectionLabel(normalizeSection(p.section));
    const key = `${String(PIECE_TYPES.indexOf(p.type)).padStart(2, "0")}|${sec}`;
    const g = groups.get(key) ?? { type: p.type, sec, pieces: [] };
    g.pieces.push(p);
    groups.set(key, g);
  }
  const warned = new Set<MachiningType>();
  const warnings: PricingWarning[] = [];
  const lines: QuoteLine[] = [];
  for (const [, g] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    let base = 0;
    let prop = 0;
    let handling = 0;
    const counts = new Map<MachiningType, number>();
    for (const p of g.pieces) {
      const t = pieceMachiningTime(p, rates);
      base += t.baseMin;
      prop += t.proportionalMin;
      handling += t.handlingMin;
      for (const [type, n] of Object.entries(t.counts) as [MachiningType, number][]) counts.set(type, (counts.get(type) ?? 0) + n);
      for (const type of t.missing)
        if (!warned.has(type)) {
          warned.add(type);
          warnings.push({ code: "tariffa-mancante", message: `tariffa mancante per la lavorazione "${type}"`, ref: type, blocking: true });
        }
    }
    const totalMin = round6(base + prop + handling);
    const n = g.pieces.length;
    const detail = [...counts.entries()]
      .map(([type, c]) => {
        const r = rates.perType[type];
        return r ? `${c} × ${type} (${fmt(r.baseMin)} min)` : `${c} × ${type} (tariffa mancante)`;
      })
      .join(", ");
    lines.push(
      line({
        code: `cnc-${g.type}-${g.sec}`,
        category: "lavorazioni",
        label: `Lavorazioni CNC – ${pieceTypeName(g.type, n)} ${g.sec}`,
        quantity: totalMin / 60,
        unit: "h",
        unitPriceCents: rates.hourlyRateCents,
        amountCents: roundHalfUp((rates.hourlyRateCents * totalMin) / 60),
        explain: [
          `${n} ${n === 1 ? "pezzo" : "pezzi"}${detail ? `: ${detail}` : ", nessuna lavorazione"} = ${fmt(base)} min base`,
          `proporzionale alla grandezza ${fmt(prop)} min, movimentazione ${n} × ${fmt(rates.handlingMinPerPiece)} min = ${fmt(handling)} min`,
          `totale ${fmt(totalMin)} min × ${fmtPrice(rates.hourlyRateCents, "h")}`,
          ctx.versionLabel,
        ],
      }),
    );
  }
  return append(state, lines, warnings);
};
