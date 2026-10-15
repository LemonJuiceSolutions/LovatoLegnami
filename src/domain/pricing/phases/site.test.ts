import { describe, expect, it } from "vitest";
import { generate } from "../../typologies/registry";
import { hardwareItem, makeContext, piece, start } from "../__tests__/context";
import { DEFAULT_PRICE_LIST } from "../data/default-listino";
import type { PriceList } from "../types";
import { complicationsPhase, describeCondition } from "./complications";
import { coveringGeometry, coveringPhase, roofArea } from "./covering";
import { labourPhase } from "./labour";
import { pieceSurfaceM2, treatmentsPhase } from "./treatments";
import { transportPhase, tripsFor, zoneForCap } from "./transport";
import { FLAT_SITE } from "../__tests__/context";

describe("fase trattamenti (4.3)", () => {
  it("pilastro 120×120×2400 → 4·0,12·2,4 = 1,152 m²", () => {
    const p = piece("pilastro", 120, 120, 2400);
    expect(pieceSurfaceM2(p)).toBe(1.152);
    const [row] = treatmentsPhase(makeContext({ pieces: [p] }, { options: { treatment: "impregnante-incolore" } }), start()).lines;
    expect(row.quantity).toBe(1.152);
    expect(row.unitPriceCents).toBe(700);
    expect(row.amountCents).toBe(806);
  });

  it("nessun trattamento scelto → nessuna riga; trattamento sconosciuto → avviso", () => {
    const ctx = makeContext({ pieces: [piece("pilastro", 120, 120, 2400)] });
    expect(treatmentsPhase(ctx, start()).lines).toEqual([]);
    const r = treatmentsPhase(makeContext({ pieces: [piece("pilastro", 120, 120, 2400)] }, { options: { treatment: "oro-zecchino" } }), start());
    expect(r.lines[0].amountCents).toBe(0);
    expect(r.warnings[0]).toMatchObject({ code: "prezzo-mancante", ref: "oro-zecchino" });
  });
});

describe("fase copertura (4.3)", () => {
  it("20 m² in pianta a 15° → 20/cos 15° m²", () => {
    expect(roofArea(20, 15)).toBeCloseTo(20 / Math.cos((15 * Math.PI) / 180), 6);
    expect(roofArea(20, 0)).toBe(20);
  });

  it("monofalda di default: area in pianta dei pezzi di copertura e pendenza dei travetti", () => {
    const a = generate("addossata-monofalda");
    const g = coveringGeometry(a);
    expect(g.slopeSource).toBe("travetti");
    expect(g.slopeDeg).toBeCloseTo(15, 6);
    expect(g.widthMm).toBeCloseTo(6000, 6);
    expect(g.areaM2).toBeCloseTo(g.planAreaM2 / Math.cos((15 * Math.PI) / 180), 5);
    const [row] = coveringPhase(makeContext(a, { options: { covering: "policarbonato-alveolare" } }), start()).lines;
    expect(row.category).toBe("copertura");
    expect(row.quantity).toBe(g.areaM2);
    expect(row.explain[0]).toContain("pendenza 15°");
  });

  it("pendenza imposta dal template (meta) prevale: portale piano → 0°", () => {
    const g = coveringGeometry(generate("portale-sandwich"));
    expect(g.slopeSource).toBe("meta");
    expect(g.slopeDeg).toBe(0);
    expect(g.areaM2).toBe(g.planAreaM2);
  });
});

describe("fase montaggio (4.3)", () => {
  it("ore per pezzo, giunto e ferramenta più allestimento", () => {
    const a = {
      pieces: [piece("pilastro", 120, 120, 2400), piece("pilastro", 120, 120, 2400), piece("travetto", 80, 160, 3000)],
      joints: [{ id: "G-01", type: "mezzo-legno" as const, pieceA: "a", pieceB: "b", params: {} }],
      hardware: [hardwareItem("vite-6x160", "vite", 30)],
    };
    const s = labourPhase(makeContext(a), start());
    // 2 × 25 + 12 = 62 min; giunto 6 min; 30 viti × 1 min; allestimento 3 h
    expect(s.lines.map((l) => [l.code, l.quantity])).toEqual([
      ["montaggio-pezzi", 62 / 60],
      ["montaggio-giunti", 0.1],
      ["montaggio-ferramenta", 0.5],
      ["montaggio-allestimento", 3],
    ].map(([c, q]) => [c, Math.round((q as number) * 1e6) / 1e6]));
    expect(s.labourBaseHours).toBeCloseTo(62 / 60 + 0.1 + 0.5 + 3, 6);
    expect(s.lines[0].amountCents).toBe(Math.round((4_200 * 62) / 60));
  });
});

describe("fase complicazioni (4.3)", () => {
  const base = start({ labourBaseHours: 10 });

  it("deviazione 6° con regola +15% oltre 3° → riga con il 15% delle ore base", () => {
    const s = complicationsPhase(makeContext({ pieces: [] }, { site: { planDeviationDeg: 6 } }), base);
    expect(s.lines).toHaveLength(1);
    const [row] = s.lines;
    expect(row.label).toBe("Complicazione: fuorisquadra 6°");
    expect(row.ruleId).toBe("fuorisquadra");
    expect(row.quantity).toBe(1.5);
    expect(row.amountCents).toBe(Math.round(4_200 * 1.5));
    expect(row.explain[0]).toBe("condizione: deviazione dallo squadro 6° > 3°");
    expect(s.firedRules).toEqual(["fuorisquadra"]);
    expect(s.labourExtraHours).toBe(1.5);
  });

  it("dislivello 180 mm e 2 ostacoli → due righe distinte", () => {
    const s = complicationsPhase(makeContext({ pieces: [] }, { site: { floorRangeMm: 180, obstaclesCount: 2 } }), base);
    expect(s.lines.map((l) => [l.ruleId, l.quantity, l.label])).toEqual([
      ["pavimento-non-in-piano", 3, "Complicazione: pavimento non in piano 180 mm"],
      ["ostacoli", 2, "Complicazione: ostacoli in cantiere 2"],
    ]);
  });

  it("cantiere semplice (in squadra, piano, senza ostacoli, basso, accesso facile) → nessuna riga", () => {
    const s = complicationsPhase(makeContext({ pieces: [] }), base);
    expect(s.lines).toEqual([]);
    expect(s.firedRules).toEqual([]);
  });

  it("altezza oltre la soglia → trabattello/ponteggio a importo fisso; accesso in elenco", () => {
    const s = complicationsPhase(makeContext({ pieces: [] }, { site: { maxHeightMm: 3600, access: "medio" } }), base);
    expect(s.lines.map((l) => l.code)).toEqual(["complicazione-altezza", "complicazione-accesso", "ponteggio"]);
    expect(s.lines[2]).toMatchObject({ label: "Trabattello/ponteggio", amountCents: 25_000 });
    expect(s.lines[1].explain[0]).toBe("condizione: accesso medio tra medio, difficile");
  });

  it("effetti fisso e percento-legno; regole disattivate ignorate; condizioni in AND", () => {
    const pl: PriceList = {
      ...DEFAULT_PRICE_LIST,
      complications: [
        { id: "a", label: "Fisso", enabled: true, conditions: [{ factor: "obstaclesCount", op: ">=", value: 1 }, { factor: "floorRangeMm", op: ">", value: 50 }], effect: { kind: "fisso", value: 12_000 } },
        { id: "b", label: "Legno", enabled: true, conditions: [{ factor: "anchoring", op: "==", value: "terra" }], effect: { kind: "percento-legno", value: 10 } },
        { id: "c", label: "Spenta", enabled: false, conditions: [], effect: { kind: "ore", value: 5 } },
      ],
    };
    const legno = start({ labourBaseHours: 10, lines: [{ code: "legno-x", category: "legno", label: "", quantity: 1, unit: "m³", unitPriceCents: 0, amountCents: 50_000, explain: [], visibility: "cliente" }] });
    const only = complicationsPhase(makeContext({ pieces: [] }, { priceList: pl, site: { obstaclesCount: 1, floorRangeMm: 10 } }), legno);
    expect(only.lines.slice(1).map((l) => [l.ruleId, l.amountCents])).toEqual([["b", 5_000]]);
    const both = complicationsPhase(makeContext({ pieces: [] }, { priceList: pl, site: { obstaclesCount: 1, floorRangeMm: 60 } }), legno);
    expect(both.lines.slice(1).map((l) => [l.ruleId, l.amountCents])).toEqual([["a", 12_000], ["b", 5_000]]);
    expect(describeCondition(FLAT_SITE, { factor: "floorRangeMm", op: ">=", value: 100 })).toBe("dislivello del pavimento 0 mm ≥ 100 mm");
  });
});

describe("fase trasporto (4.3)", () => {
  it("CAP in zona Provincia di Verona (prefisso 37) → prezzo della zona per viaggio", () => {
    const s = transportPhase(makeContext({ pieces: [] }, { options: { cap: "37100" } }), start({ labourBaseHours: 20 }));
    expect(s.warnings).toEqual([]);
    const [row] = s.lines;
    expect(row.label).toBe("Trasporto – zona Provincia di Verona");
    expect(row.quantity).toBe(2); // 20 h / (2 × 8) → 2 viaggi
    expect(row.amountCents).toBe(18_000);
  });

  it("CAP sconosciuto → zona di ripiego e avviso zona da verificare", () => {
    const s = transportPhase(makeContext({ pieces: [] }, { options: { cap: "00100" } }), start({ labourBaseHours: 4 }));
    expect(s.lines[0].label).toBe("Trasporto – zona Fuori zona");
    expect(s.lines[0].amountCents).toBe(45_000);
    expect(s.warnings).toEqual([expect.objectContaining({ code: "zona-da-verificare", ref: "00100", blocking: false })]);
  });

  it("km inseriti dall'ufficio prevalgono; viaggi contano anche le ore di complicazione", () => {
    const s = transportPhase(makeContext({ pieces: [] }, { options: { cap: "37100", km: 55 } }), start({ labourBaseHours: 15, labourExtraHours: 2 }));
    expect(s.lines[0]).toMatchObject({ label: "Trasporto – 55 km", quantity: 2, unitPriceCents: 8_250, amountCents: 16_500 });
    expect(tripsFor(16, DEFAULT_PRICE_LIST.labour)).toBe(1);
    expect(tripsFor(16.1, DEFAULT_PRICE_LIST.labour)).toBe(2);
    expect(zoneForCap(DEFAULT_PRICE_LIST.transport, "37026").zone.name).toBe("Provincia di Verona");
    expect(zoneForCap(DEFAULT_PRICE_LIST.transport, "36100").zone.name).toBe("Province limitrofe");
  });
});
