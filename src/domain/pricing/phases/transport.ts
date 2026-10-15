import { mul, roundHalfUp } from "../money";
import type { PriceList, PricingWarning } from "../types";
import { append, fmt, fmtPrice, line, round6, type Phase } from "./shared";

/**
 * Fase `transport` (spec "Trasporto per zona"): prezzo per viaggio dalla zona del CAP
 * (prefisso più lungo), oppure dalla distanza inserita dall'ufficio (`km` × `perKmCents`);
 * viaggi = ⌈ore di montaggio (base + complicazioni) / (squadra × ore per giornata)⌉, almeno 1.
 */

type Zone = PriceList["transport"]["zones"][number];

export interface ZoneMatch {
  readonly zone: Zone;
  /** Prefisso che ha deciso la zona; assente se si è usato il ripiego. */
  readonly prefix?: string;
  readonly fallback: boolean;
}

/** Zona del CAP: prefisso più lungo tra tutte le zone, altrimenti la zona di ripiego. */
export function zoneForCap(transport: PriceList["transport"], cap: string | undefined): ZoneMatch {
  let best: { zone: Zone; prefix: string } | undefined;
  if (cap)
    for (const zone of transport.zones)
      for (const p of zone.capPrefixes) if (cap.startsWith(p) && (!best || p.length > best.prefix.length)) best = { zone, prefix: p };
  if (best) return { zone: best.zone, prefix: best.prefix, fallback: false };
  return { zone: transport.zones.find((z) => z.name === transport.fallbackZone)!, fallback: true };
}

/** Viaggi necessari per le ore di montaggio (ore-uomo) con la squadra del listino. */
export const tripsFor = (hours: number, labour: PriceList["labour"]): number =>
  Math.max(1, Math.ceil(round6(hours / (labour.crewSize * labour.hoursPerDay))));

export const transportPhase: Phase = (ctx, state) => {
  const t = ctx.priceList.transport;
  const lab = ctx.priceList.labour;
  const hours = round6(state.labourBaseHours + state.labourExtraHours);
  const trips = tripsFor(hours, lab);
  const tripsWhy = `${fmt(hours)} h di montaggio / (squadra di ${lab.crewSize} × ${fmt(lab.hoursPerDay)} h al giorno) ⇒ ${trips} ${trips === 1 ? "viaggio" : "viaggi"}`;
  const warnings: PricingWarning[] = [];
  const { km, cap } = ctx.options;

  if (km !== undefined) {
    const perKm = t.perKmCents;
    if (perKm === undefined) {
      warnings.push({ code: "tariffa-mancante", message: "prezzo al km mancante nel listino per la distanza inserita", ref: "transport.perKmCents", blocking: true });
    }
    const price = perKm === undefined ? 0 : roundHalfUp(perKm * km);
    return append(
      state,
      [
        line({
          code: "trasporto",
          category: "trasporto",
          label: `Trasporto – ${fmt(km, 1)} km`,
          quantity: trips,
          unit: "viaggi",
          unitPriceCents: price,
          amountCents: mul(price, trips),
          explain: [
            perKm === undefined ? `distanza ${fmt(km, 1)} km inserita dall'ufficio: prezzo al km mancante` : `distanza ${fmt(km, 1)} km inserita dall'ufficio × ${fmtPrice(perKm, "km")} = ${fmtPrice(price)} a viaggio`,
            tripsWhy,
            ctx.versionLabel,
          ],
        }),
      ],
      warnings,
    );
  }

  const match = zoneForCap(t, cap);
  if (match.fallback) {
    warnings.push({
      code: "zona-da-verificare",
      message: cap ? `CAP ${cap} fuori dalle zone del listino: zona di ripiego "${match.zone.name}" da verificare` : `CAP non indicato: zona di ripiego "${match.zone.name}" da verificare`,
      ref: cap ?? "cap",
      blocking: false,
    });
  }
  return append(
    state,
    [
      line({
        code: "trasporto",
        category: "trasporto",
        label: `Trasporto – zona ${match.zone.name}`,
        quantity: trips,
        unit: "viaggi",
        unitPriceCents: match.zone.priceCents,
        amountCents: mul(match.zone.priceCents, trips),
        explain: [
          match.fallback
            ? `${cap ? `CAP ${cap} non in tabella` : "CAP non indicato"}: zona di ripiego "${match.zone.name}" (${fmt(match.zone.km, 0)} km), da verificare`
            : `CAP ${cap} (prefisso ${match.prefix}) ⇒ zona "${match.zone.name}" (${fmt(match.zone.km, 0)} km)`,
          `${fmtPrice(match.zone.priceCents)} a viaggio; ${tripsWhy}`,
          ctx.versionLabel,
        ],
      }),
    ],
    warnings,
  );
};
