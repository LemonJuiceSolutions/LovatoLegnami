import {
  customerView,
  officeView,
  priceAssembly,
  type CustomerQuote,
  type OfficeView,
  type PriceList,
  type PriceListVersion,
  type PricingOptionsInput,
  type SiteFactors,
} from "@/domain";
import { assemblyFromConfig, type AssemblyConfig } from "@/server/quotes/generate";

/**
 * Simulatore del preventivo (9.8, spec `back-office-admin`): la stessa configurazione
 * prezzata con il listino in bozza e con quello attivo, fattori di cantiere sostituibili,
 * confronto riga per riga. Funzioni pure sui documenti; la action carica i dati.
 */

export interface SimulationSide {
  readonly versionLabel: string;
  readonly office: OfficeView;
  readonly customer: CustomerQuote;
}

export interface LineDelta {
  readonly code: string;
  readonly label: string;
  readonly category: string;
  readonly activeCents: number | null;
  readonly draftCents: number | null;
  readonly deltaCents: number;
}

export interface Simulation {
  readonly draft: SimulationSide | null;
  readonly active: SimulationSide | null;
  /** Fattori di cantiere usati (calcolati e poi sostituiti da quelli indicati). */
  readonly siteFactors: SiteFactors;
  /** Differenze per codice di riga (solo le righe con importi diversi), nell'ordine delle righe. */
  readonly lines: readonly LineDelta[];
  readonly totalDeltaCents: number | null;
}

export interface PriceSource {
  readonly priceList: PriceList;
  readonly version: PriceListVersion;
}

function side(config: AssemblyConfig, options: PricingOptionsInput, factors: Partial<SiteFactors>, src: PriceSource): SimulationSide {
  const quote = priceAssembly({ assembly: assemblyFromConfig(config), envelope: config.envelope, options, priceList: src.priceList, version: src.version, siteFactors: factors });
  return { versionLabel: `${src.version.status === "bozza" ? "bozza" : "attiva"} – listino v${src.version.version} del ${src.version.effectiveFrom}`, office: officeView(quote), customer: customerView(quote) };
}

const linesOf = (s: SimulationSide | null) => new Map((s?.office.groups ?? []).flatMap((g) => g.lines.map((l) => [l.code, l] as const)));

export function simulate(config: AssemblyConfig, options: PricingOptionsInput, factors: Partial<SiteFactors>, draft: PriceSource | null, active: PriceSource | null): Simulation {
  const d = draft ? side(config, options, factors, draft) : null;
  const a = active ? side(config, options, factors, active) : null;
  const dl = linesOf(d);
  const al = linesOf(a);
  const codes = [...new Set([...al.keys(), ...dl.keys()])];
  const lines: LineDelta[] = [];
  for (const code of codes) {
    const x = al.get(code);
    const y = dl.get(code);
    const ac = x?.amountCents ?? null;
    const dc = y?.amountCents ?? null;
    if (ac === dc) continue;
    lines.push({ code, label: (y ?? x)!.label, category: (y ?? x)!.category, activeCents: ac, draftCents: dc, deltaCents: (dc ?? 0) - (ac ?? 0) });
  }
  return {
    draft: d,
    active: a,
    siteFactors: (d ?? a)?.office.siteFactors ?? (factors as SiteFactors),
    lines,
    totalDeltaCents: d && a ? d.office.totals.totalCents - a.office.totals.totalCents : null,
  };
}
