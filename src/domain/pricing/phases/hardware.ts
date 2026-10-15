import { findHardware, hasHardware } from "../../hardware/catalog";
import { mul } from "../money";
import type { PricingWarning, QuoteLine } from "../types";
import { append, fmtPrice, line, type Phase } from "./shared";

/**
 * Fase `hardware` (spec "Ferramenta, trattamenti e copertura"): una riga per codice di
 * catalogo con la quantità totale dell'assieme e il prezzo unitario del listino; codice
 * senza prezzo ⇒ riga a 0 e avviso `prezzo-mancante`.
 */
export const hardwarePhase: Phase = (ctx, state) => {
  const prices = ctx.priceList.hardware.priceCents;
  const qty = new Map<string, number>();
  for (const h of ctx.assembly.hardware ?? []) qty.set(h.code, (qty.get(h.code) ?? 0) + h.quantity);
  const lines: QuoteLine[] = [];
  const warnings: PricingWarning[] = [];
  for (const [code, quantity] of [...qty.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const price = prices[code];
    const name = hasHardware(code) ? findHardware(code).name : code;
    if (price === undefined) {
      warnings.push({ code: "prezzo-mancante", message: `prezzo mancante per la ferramenta "${code}"`, ref: code, blocking: true });
    }
    lines.push(
      line({
        code: `ferramenta-${code}`,
        category: "ferramenta",
        label: `Ferramenta – ${name}`,
        quantity,
        unit: "pz",
        unitPriceCents: price ?? 0,
        amountCents: price === undefined ? 0 : mul(price, quantity),
        explain: [
          price === undefined ? `codice ${code}: prezzo mancante` : `codice ${code}: ${quantity} × ${fmtPrice(price)}`,
          ctx.versionLabel,
        ],
      }),
    );
  }
  return append(state, lines, warnings);
};
