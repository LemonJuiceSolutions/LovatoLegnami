import { describe, expect, it } from "vitest";
import type { Machining } from "../../components/types";
import { generate } from "../../typologies/registry";
import { hardwareItem, makeContext, many, piece, start } from "../__tests__/context";
import { DEFAULT_PRICE_LIST } from "../data/default-listino";
import type { PriceList } from "../types";
import { hardwarePhase } from "./hardware";
import { machiningMagnitude, machiningPhase, pieceMachiningTime } from "./machining";
import { timberPhase } from "./timber";

const withTimber = (patch: Partial<PriceList["timber"]>): PriceList => ({ ...DEFAULT_PRICE_LIST, timber: { ...DEFAULT_PRICE_LIST.timber, ...patch } });
const sum = (xs: readonly { amountCents: number }[]) => xs.reduce((s, l) => s + l.amountCents, 0);

describe("fase legno (4.2)", () => {
  it("11 travetti 80×160 da 3200 su 4000/5000 → righe legno netto e sfrido distinte e spiegate", () => {
    const pl = withTimber({ stockLengths: { ...DEFAULT_PRICE_LIST.timber.stockLengths, "80×160": [{ length: 4000 }, { length: 5000 }] } });
    const ctx = makeContext({ pieces: many(11, () => piece("travetto", 80, 160, 3200)) }, { priceList: pl, options: { quality: "massello" } });
    const { lines, warnings } = timberPhase(ctx, start());
    expect(warnings).toEqual([]);
    const net = lines.find((l) => l.code === "legno-80×160")!;
    const waste = lines.find((l) => l.code === "sfrido-80×160")!;
    expect(net.label).toBe("Legno – travetti 80×160");
    expect(net.category).toBe("legno");
    expect(net.unit).toBe("m³");
    expect(net.quantity).toBeCloseTo(0.08 * 0.16 * 3.2 * 11, 6);
    expect(net.unitPriceCents).toBe(55_000);
    expect(net.amountCents).toBe(Math.round(55_000 * 0.08 * 0.16 * 3.2 * 11));
    const text = net.explain.join(" | ");
    expect(text).toContain("Abete");
    expect(text).toContain("Massello");
    expect(text).toContain("0,45056 m³");
    expect(text).toContain("550,00");
    expect(text).toContain("listino v1 del 2026-01-01");
    expect(waste.category).toBe("sfrido");
    expect(waste.explain[0]).toMatch(/^sfrido 20%: /);
    // legno + sfrido = costo delle barre del piano
    expect(net.amountCents + waste.amountCents).toBe(ctx.cutPlan.groups[0].costCents);
  });

  it("prezzo al metro lineare per la sezione 120×240 prevale e la spiegazione lo dichiara", () => {
    const pl = withTimber({ pricePerMl: { "120×240": 2_500 } });
    const ctx = makeContext({ pieces: [piece("trave", 120, 240, 4900)] }, { priceList: pl });
    const { lines } = timberPhase(ctx, start());
    const net = lines.find((l) => l.code === "legno-120×240")!;
    expect(net.unit).toBe("ml");
    expect(net.unitPriceCents).toBe(2_500);
    expect(net.quantity).toBeCloseTo(4.9, 6);
    expect(net.amountCents).toBe(12_250);
    expect(net.explain.join(" ")).toContain("metro lineare");
    expect(sum(lines.filter((l) => l.code.endsWith("120×240")))).toBe(ctx.cutPlan.groups[0].costCents);
  });

  it("spezzoni riutilizzabili con recupero 30% → riga negativa recupero spezzoni", () => {
    const pl = withTimber({ stockLengths: { ...DEFAULT_PRICE_LIST.timber.stockLengths, "120×120": [{ length: 5000 }] } });
    const ctx = makeContext({ pieces: [piece("pilastro", 120, 120, 3200)] }, { priceList: pl });
    const g = ctx.cutPlan.groups[0];
    expect(g.reusableOffcuts).toEqual([1780]);
    const rec = timberPhase(ctx, start()).lines.find((l) => l.code === "recupero-120×120")!;
    expect(rec.category).toBe("sfrido");
    expect(rec.amountCents).toBe(-Math.round((g.reusableOffcutCostCents * 30) / 100));
    expect(rec.amountCents).toBeLessThan(0);
    expect(rec.explain.join(" ")).toContain("1780 mm");
  });

  it("curvi al ml di sviluppo più fisso di curvatura, pannelli al m²", () => {
    const arc = piece("arco", 45, 145, 3900, { curve: { radius: 2400, sweep: 93.1 } });
    const grid = piece("grigliato", 20, 1000, 1800);
    const ctx = makeContext({ pieces: [arc, grid] });
    const { lines } = timberPhase(ctx, start());
    const curved = lines.find((l) => l.code === "legno-curvo-45×145")!;
    expect(curved.quantity).toBeCloseTo(3.9, 6);
    expect(curved.amountCents).toBe(Math.round(DEFAULT_PRICE_LIST.timber.curvedPerMl["45×145"] * 3.9));
    const setup = lines.find((l) => l.code === "curvatura-45×145")!;
    expect(setup.amountCents).toBe(DEFAULT_PRICE_LIST.timber.curvedSetupCents);
    const panels = lines.find((l) => l.code === "pannelli-grigliato")!;
    expect(panels.unit).toBe("m²");
    expect(panels.quantity).toBeCloseTo(1.8, 6);
    expect(panels.amountCents).toBe(Math.round(4_500 * 1.8));
  });

  it("sezione senza prezzo → riga a 0 e avviso prezzo mancante che cita la sezione", () => {
    const pl = withTimber({ pricePerM3: { abete: {} } });
    const ctx = makeContext({ pieces: [piece("travetto", 80, 160, 3200)] }, { priceList: pl });
    const { lines, warnings } = timberPhase(ctx, start());
    expect(lines.every((l) => l.amountCents === 0)).toBe(true);
    expect(warnings.map((w) => [w.code, w.ref])).toEqual([["prezzo-mancante", "abete|lamellare|80×160"]]);
  });
});

describe("fase lavorazioni CNC (4.2)", () => {
  const head = (id: string, at: number): Machining => ({ id, pieceId: "TVT-X", type: "taglio-testa", at, face: at === 0 ? "testa-inizio" : "testa-fine", angle: 15 });
  const beak = (id: string, at: number): Machining => ({ id, pieceId: "TVT-X", type: "becco-uccello", at, face: "inferiore", depth: 30, angle: 15 });

  it("2 becchi d'uccello (3 min) + 2 tagli di testa (1,5 min) → 9 min + proporzionale + movimentazione", () => {
    const p = piece("travetto", 80, 160, 3200, { machinings: [beak("a", 400), beak("b", 2800), head("c", 0), head("d", 3200)] });
    const t = pieceMachiningTime(p, DEFAULT_PRICE_LIST.machining);
    expect(t.baseMin).toBe(9);
    expect(t.proportionalMin).toBe(0); // becco e taglio di testa: per unità 0 nel seed
    expect(t.handlingMin).toBe(1.5);
    expect(t.totalMin).toBe(10.5);
    // con un tempo proporzionale al numero: + 4 × 0,5
    const rates = {
      ...DEFAULT_PRICE_LIST.machining,
      perType: { ...DEFAULT_PRICE_LIST.machining.perType, "becco-uccello": { baseMin: 3, perUnitMin: 0.02, unit: "cm2" as const } },
    };
    const t2 = pieceMachiningTime(p, rates);
    expect(t2.baseMin).toBe(9);
    // becco: profondità 30 × faccia inferiore (b = 80) = 24 cm² × 0,02 = 0,48 min ciascuno
    expect(t2.proportionalMin).toBeCloseTo(0.96, 6);
    expect(t2.totalMin).toBeCloseTo(9 + 0.96 + 1.5, 6);

    const ctx = makeContext({ pieces: [p] });
    const [row] = machiningPhase(ctx, start()).lines;
    expect(row.label).toBe("Lavorazioni CNC – travetto 80×160");
    expect(row.quantity).toBeCloseTo(10.5 / 60, 6);
    expect(row.amountCents).toBe(Math.round((9_000 * 10.5) / 60));
    expect(row.explain[0]).toContain("2 × becco-uccello (3 min)");
    expect(row.explain[0]).toContain("2 × taglio-testa (1,5 min)");
  });

  it("i pezzi identici contano per ogni occorrenza; grandezze nelle tre unità", () => {
    const ps = many(11, () => piece("travetto", 80, 160, 3200, { machinings: [head("c", 0)] }));
    const [row] = machiningPhase(makeContext({ pieces: ps }), start()).lines;
    expect(row.quantity).toBeCloseTo((11 * (1.5 + 1.5)) / 60, 6);
    const hole: Machining = { id: "f", pieceId: "x", type: "foro", at: 100, face: "sinistra", diameter: 12, offset: 0 };
    const p = piece("pilastro", 120, 120, 2400);
    expect(machiningMagnitude(hole, p, "n")).toBe(1);
    expect(machiningMagnitude(hole, p, "mm")).toBe(120);
    expect(machiningMagnitude(hole, p, "cm2")).toBeCloseTo((Math.PI * 36) / 100, 9);
  });

  it("lavorazione senza tariffa → avviso tariffa mancante con il tipo", () => {
    const { foro: _omit, ...perType } = DEFAULT_PRICE_LIST.machining.perType;
    const pl: PriceList = { ...DEFAULT_PRICE_LIST, machining: { ...DEFAULT_PRICE_LIST.machining, perType } };
    const p = piece("pilastro", 120, 120, 2400, { machinings: [{ id: "f", pieceId: "x", type: "foro", at: 100, face: "sinistra", diameter: 12, offset: 0 }] });
    const { warnings, lines } = machiningPhase(makeContext({ pieces: [p, piece("pilastro", 120, 120, 2400, { machinings: [{ id: "g", pieceId: "y", type: "foro", at: 100, face: "sinistra", diameter: 12, offset: 0 }] })] }, { priceList: pl }), start());
    expect(warnings).toEqual([{ code: "tariffa-mancante", message: 'tariffa mancante per la lavorazione "foro"', ref: "foro", blocking: true }]);
    expect(lines[0].explain[0]).toContain("tariffa mancante");
  });

  it("monofalda di default: una riga per tipo di pezzo e sezione, tutte con tariffa", () => {
    const a = generate("addossata-monofalda");
    const { lines, warnings } = machiningPhase(makeContext(a), start());
    expect(warnings).toEqual([]);
    expect(lines.map((l) => l.code)).toEqual(["cnc-pilastro-120×120", "cnc-trave-120×240", "cnc-travetto-80×160", "cnc-controvento-100×100", "cnc-banchina-100×200"]);
  });
});

describe("fase ferramenta (4.2)", () => {
  it("12 bulloni e 36 viti → due righe con quantità e prezzi del listino", () => {
    const hw = [hardwareItem("bullone-m12x200", "bullone", 1, 1), ...many(11, (i) => hardwareItem("bullone-m12x200", "bullone", 1, i + 2)), hardwareItem("vite-6x160", "vite", 36, 20)];
    const { lines, warnings } = hardwarePhase(makeContext({ pieces: [], hardware: hw }), start());
    expect(warnings).toEqual([]);
    expect(lines.map((l) => [l.code, l.quantity, l.unitPriceCents, l.amountCents])).toEqual([
      ["ferramenta-bullone-m12x200", 12, 420, 5_040],
      ["ferramenta-vite-6x160", 36, 45, 1_620],
    ]);
    expect(lines[0].label).toMatch(/^Ferramenta – /);
  });

  it("codice senza prezzo → riga a 0 e avviso prezzo mancante con il codice", () => {
    const { "vite-6x160": _omit, ...priceCents } = DEFAULT_PRICE_LIST.hardware.priceCents;
    const pl: PriceList = { ...DEFAULT_PRICE_LIST, hardware: { priceCents } };
    const { lines, warnings } = hardwarePhase(makeContext({ pieces: [], hardware: [hardwareItem("vite-6x160", "vite", 36)] }, { priceList: pl }), start());
    expect(lines[0].amountCents).toBe(0);
    expect(warnings).toEqual([{ code: "prezzo-mancante", message: 'prezzo mancante per la ferramenta "vite-6x160"', ref: "vite-6x160", blocking: true }]);
  });
});
