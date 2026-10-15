import { HARDWARE_KINDS, JOINT_TYPES, PIECE_FAMILIES, type HardwareKind, type JointType, type PieceFamily } from "../../components/types";
import { roundHalfUp } from "../money";
import type { PricingWarning, QuoteLine } from "../types";
import { append, fmt, fmtPrice, line, round6, type Phase } from "./shared";

/**
 * Fase `labour` (spec "Montaggio e complicazioni"): ore di montaggio = tempi unitari per
 * pezzo (per famiglia), per giunto (per tipo) e per ferramenta (per tipo, × quantità) più
 * il tempo fisso di allestimento. Le ore sono **ore-uomo**: la squadra divide il lavoro
 * (viaggi in `transport`). Le ore base alimentano le complicazioni `percento-ore`.
 */

const cost = (rate: number, hours: number) => roundHalfUp(rate * hours);

function tally<K extends string>(order: readonly K[], items: readonly { key: K; n: number }[], perUnit: Partial<Record<K, number>>) {
  const counts = new Map<K, number>();
  for (const it of items) counts.set(it.key, (counts.get(it.key) ?? 0) + it.n);
  let minutes = 0;
  const parts: string[] = [];
  const missing: K[] = [];
  for (const k of order) {
    const n = counts.get(k);
    if (!n) continue;
    const m = perUnit[k];
    if (m === undefined) {
      missing.push(k);
      parts.push(`${n} × ${k} (tariffa mancante)`);
      continue;
    }
    minutes += n * m;
    parts.push(`${n} × ${k} (${fmt(m)} min)`);
  }
  return { minutes: round6(minutes), parts, missing, count: [...counts.values()].reduce((s, n) => s + n, 0) };
}

export const labourPhase: Phase = (ctx, state) => {
  const lab = ctx.priceList.labour;
  const rate = lab.hourlyRateCents;
  const a = ctx.assembly;
  const pieces = tally<PieceFamily>(PIECE_FAMILIES, a.pieces.map((p) => ({ key: p.family, n: 1 })), lab.minPerPiece);
  const joints = tally<JointType>(JOINT_TYPES, (a.joints ?? []).map((j) => ({ key: j.type, n: 1 })), lab.minPerJoint);
  const hardware = tally<HardwareKind>(HARDWARE_KINDS, (a.hardware ?? []).map((h) => ({ key: h.kind, n: h.quantity })), lab.minPerHardware);

  const warnings: PricingWarning[] = [
    ...pieces.missing.map((k) => ({ code: "tariffa-mancante" as const, message: `tempo di montaggio mancante per i pezzi "${k}"`, ref: k, blocking: true })),
    ...joints.missing.map((k) => ({ code: "tariffa-mancante" as const, message: `tempo di montaggio mancante per il giunto "${k}"`, ref: k, blocking: true })),
    ...hardware.missing.map((k) => ({ code: "tariffa-mancante" as const, message: `tempo di montaggio mancante per la ferramenta "${k}"`, ref: k, blocking: true })),
  ];

  const rows: { code: string; label: string; minutes: number; detail: string }[] = [];
  if (pieces.count > 0) rows.push({ code: "montaggio-pezzi", label: "Montaggio – posa dei pezzi", minutes: pieces.minutes, detail: pieces.parts.join(", ") });
  if (joints.count > 0) rows.push({ code: "montaggio-giunti", label: "Montaggio – giunti", minutes: joints.minutes, detail: joints.parts.join(", ") });
  if (hardware.count > 0) rows.push({ code: "montaggio-ferramenta", label: "Montaggio – ferramenta", minutes: hardware.minutes, detail: hardware.parts.join(", ") });

  const lines: QuoteLine[] = rows.map((r) =>
    line({
      code: r.code,
      category: "montaggio",
      label: r.label,
      quantity: r.minutes / 60,
      unit: "h",
      unitPriceCents: rate,
      amountCents: cost(rate, r.minutes / 60),
      explain: [`${r.detail} = ${fmt(r.minutes)} min`, `${fmt(r.minutes / 60)} h × ${fmtPrice(rate, "h")}`, ctx.versionLabel],
    }),
  );
  lines.push(
    line({
      code: "montaggio-allestimento",
      category: "montaggio",
      label: "Montaggio – allestimento del cantiere",
      quantity: lab.setupHours,
      unit: "h",
      unitPriceCents: rate,
      amountCents: cost(rate, lab.setupHours),
      explain: [`tempo fisso di cantiere ${fmt(lab.setupHours)} h × ${fmtPrice(rate, "h")}`, ctx.versionLabel],
    }),
  );
  const baseHours = round6((pieces.minutes + joints.minutes + hardware.minutes) / 60 + lab.setupHours);
  return append(state, lines, warnings, { labourBaseHours: baseHours });
};
