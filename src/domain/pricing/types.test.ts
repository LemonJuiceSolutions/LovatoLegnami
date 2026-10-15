import { describe, expect, it } from "vitest";
import {
  PriceListError,
  PricingOptionsSchema,
  parsePriceList,
  safeParsePriceList,
  selectVersion,
  versionLabel,
  type PriceListInput,
  type PriceListVersion,
} from "./types";

/** Listino minimo valido (i valori non contano: solo la forma). */
const minimalPriceList = (): PriceListInput => ({
  timber: {
    species: [{ id: "abete", label: "Abete" }],
    qualities: [
      { id: "lamellare", label: "Lamellare" },
      { id: "massello", label: "Massello" },
    ],
    pricePerM3: { abete: { lamellare: 65000, massello: 55000 } },
    curvedPerMl: { "120×240": 9000 },
    curvedSetupCents: 15000,
    panelsPerM2: { grigliato: 4500 },
    stockLengths: {
      "80×160": [{ length: 4000 }, { length: 6000 }],
      "120×240": [{ length: 6000 }, { length: 13500, qualities: ["lamellare"] }],
    },
    kerf: 4,
    endTrim: 10,
    minReusableOffcut: { "80×160": 1000, "120×240": 1000 },
    offcutRecoveryPct: 30,
  },
  machining: { hourlyRateCents: 9000, handlingMinPerPiece: 1, perType: { "taglio-testa": { baseMin: 1.5, perUnitMin: 0, unit: "n" } } },
  hardware: { priceCents: { "bullone-m12x200": 350 } },
  treatments: [{ id: "impregnante", label: "Impregnante", pricePerM2Cents: 900 }],
  coverings: [{ id: "policarbonato", label: "Policarbonato", pricePerM2Cents: 4500 }],
  labour: {
    hourlyRateCents: 4200,
    crewSize: 2,
    hoursPerDay: 8,
    setupHours: 2,
    minPerPiece: { PIL: 20 },
    minPerJoint: { "mezzo-legno": 10 },
    minPerHardware: { bullone: 3 },
    scaffoldHeightMm: 3500,
    scaffoldCents: 25000,
  },
  complications: [
    {
      id: "fuorisquadra",
      label: "Fuorisquadra",
      conditions: [{ factor: "planDeviationDeg", op: ">", value: 3 }],
      effect: { kind: "percento-ore", value: 15 },
    },
    {
      id: "accesso",
      label: "Accesso difficile",
      conditions: [{ factor: "access", op: "in", value: ["medio", "difficile"] }],
      effect: { kind: "ore", value: 2 },
    },
  ],
  transport: {
    zones: [
      { name: "Provincia", capPrefixes: ["31"], km: 40, priceCents: 12000 },
      { name: "Italia", capPrefixes: [], km: 300, priceCents: 60000 },
    ],
    fallbackZone: "Italia",
  },
  margins: { materialsPct: 25, labourPct: 20 },
  discounts: [{ id: "promo", label: "Promo", kind: "percento", value: 5 }],
  vatRates: [
    { id: "ordinaria", label: "22%", pct: 22 },
    { id: "ristrutturazione", label: "10%", pct: 10 },
  ],
  defaultVat: "ordinaria",
  minimumOrderCents: 150000,
  roundingStepCents: 1000,
  indicativityPct: 10,
});

/** Modifica profonda tramite funzione su una copia. */
const withChange = (f: (pl: PriceListInput & Record<string, unknown>) => void) => {
  const pl = structuredClone(minimalPriceList()) as PriceListInput & Record<string, unknown>;
  f(pl);
  return pl;
};

const issuesOf = (data: unknown) => {
  const r = safeParsePriceList(data);
  return r.ok ? [] : r.issues;
};

describe("PriceListSchema", () => {
  it("accetta un listino valido e applica i default", () => {
    const pl = parsePriceList(minimalPriceList());
    expect(pl.currency).toBe("EUR");
    expect(pl.complications[0].enabled).toBe(true);
    expect(pl.timber.stockLengths["120×240"][1].qualities).toEqual(["lamellare"]);
  });

  it("percentuale negativa rifiutata citando il percorso", () => {
    const data = withChange((pl) => {
      pl.margins.materialsPct = -5;
    });
    expect(() => parsePriceList(data)).toThrow(PriceListError);
    expect(issuesOf(data)).toEqual([expect.objectContaining({ path: "margins.materialsPct" })]);
    expect(() => parsePriceList(data)).toThrow(/margins\.materialsPct/);
  });

  it("zona senza prezzo rifiutata citando il percorso", () => {
    const data = withChange((pl) => {
      delete (pl.transport.zones[1] as { priceCents?: number }).priceCents;
    });
    expect(issuesOf(data).map((i) => i.path)).toEqual(["transport.zones[1].priceCents"]);
  });

  it("prezzo negativo o non intero del legno rifiutato", () => {
    const neg = withChange((pl) => {
      pl.timber.pricePerM3.abete.lamellare = -1;
    });
    expect(issuesOf(neg)).toEqual([{ path: "timber.pricePerM3.abete.lamellare", message: "il prezzo non può essere negativo" }]);
    const dec = withChange((pl) => {
      pl.timber.pricePerM3.abete.lamellare = 650.5;
    });
    expect(issuesOf(dec)[0].path).toBe("timber.pricePerM3.abete.lamellare");
  });

  it("riferimenti incrociati: specie, qualità, ripiego, IVA, prefissi duplicati", () => {
    const data = withChange((pl) => {
      pl.timber.pricePerM3.larice = { lamellare: 1 };
      pl.timber.stockLengths["80×160"][0].qualities = ["ottima"];
      pl.transport.fallbackZone = "Luna";
      pl.transport.zones[1].capPrefixes = ["31"];
      pl.defaultVat = "zero";
    });
    const paths = issuesOf(data).map((i) => i.path).sort();
    expect(paths).toEqual(
      [
        "defaultVat",
        "timber.pricePerM3.larice",
        "timber.stockLengths.80×160[0].qualities[0]",
        "transport.fallbackZone",
        "transport.zones[1].capPrefixes[0]",
      ].sort(),
    );
  });

  it("chiavi di sezione, tipi di lavorazione e famiglie validati", () => {
    const data = withChange((pl) => {
      (pl.timber.minReusableOffcut as Record<string, number>)["80x160"] = 1000;
      (pl.machining.perType as Record<string, unknown>)["fresatura-magica"] = { baseMin: 1, perUnitMin: 0, unit: "n" };
      (pl.labour.minPerPiece as Record<string, number>).XYZ = 3;
    });
    const paths = issuesOf(data).map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining(["timber.minReusableOffcut.80x160", "machining.perType.fresatura-magica", "labour.minPerPiece.XYZ"]),
    );
  });

  it("condizioni delle complicazioni coerenti con il fattore", () => {
    const data = withChange((pl) => {
      pl.complications[0].conditions = [{ factor: "planDeviationDeg", op: "in", value: ["a"] }];
      pl.complications[1].conditions = [{ factor: "access", op: "==", value: "impossibile" }];
      pl.complications.push({ id: "x", label: "X", conditions: [{ factor: "luna" as never, op: ">", value: 1 }], effect: { kind: "ore", value: 1 } });
    });
    const paths = issuesOf(data).map((i) => i.path);
    expect(paths).toEqual(["complications[0].conditions[0].value", "complications[1].conditions[0].value", "complications[2].conditions[0].factor"]);
  });

  it("rifilo maggiore della barra e lunghezze duplicate rifiutati", () => {
    const data = withChange((pl) => {
      pl.timber.stockLengths["80×160"] = [{ length: 15 }, { length: 4000 }, { length: 4000 }];
    });
    expect(issuesOf(data).map((i) => i.path).sort()).toEqual(["timber.stockLengths.80×160[0].length", "timber.stockLengths.80×160[2]"]);
  });
});

describe("selectVersion", () => {
  const v = (version: number, effectiveFrom: string, status: PriceListVersion["status"] = "attiva"): PriceListVersion => ({
    id: `v${version}`,
    version,
    effectiveFrom,
    status,
  });
  const versions = [v(1, "2026-03-01"), v(2, "2026-06-01"), v(3, "2026-04-01", "bozza"), v(4, "2026-01-01", "archiviata")];

  it("sceglie l'ultima versione attiva con validità non successiva alla data", () => {
    expect(selectVersion(versions, "2026-05-15")?.id).toBe("v1");
    expect(selectVersion(versions, new Date("2026-06-01T10:00:00Z"))?.id).toBe("v2");
    expect(selectVersion(versions, "2026-12-31")?.id).toBe("v2");
  });

  it("nessuna versione attiva valida → undefined; a parità di data vince il numero più alto", () => {
    expect(selectVersion(versions, "2026-02-01")).toBeUndefined();
    expect(selectVersion([v(5, "2026-03-01"), v(6, "2026-03-01")], "2026-03-02")?.id).toBe("v6");
  });

  it("etichetta della versione per le spiegazioni", () => {
    expect(versionLabel(v(1, "2026-01-01"))).toBe("listino v1 del 2026-01-01");
  });
});

describe("PricingOptionsSchema", () => {
  it("default accesso facile, CAP a 5 cifre", () => {
    expect(PricingOptionsSchema.parse({ species: "abete", quality: "lamellare" }).access).toBe("facile");
    expect(PricingOptionsSchema.safeParse({ species: "abete", quality: "lamellare", cap: "3110" }).success).toBe(false);
  });
});
