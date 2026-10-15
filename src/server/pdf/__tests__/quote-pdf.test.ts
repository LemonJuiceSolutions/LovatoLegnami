import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { customerView, formatEuro, parseEnvelope, planFromDiagonals, boxOfPlan, defaultParams, getTypology, type Quote } from "@/domain";
import { quotePdfData, type QuotePdfSource } from "../data";
import { pdfText, renderQuotePdf } from "../quote-pdf";
import { extractPdfText } from "./pdf-text";
import { tinyPng } from "@/server/storage/__tests__/fixtures";

const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../domain/pricing/__fixtures__/preventivo-monofalda-default.json", import.meta.url)), "utf8"),
) as Quote;

const source = (over: Partial<QuotePdfSource> = {}): QuotePdfSource => ({
  code: "PRV-2026-00042",
  createdAt: new Date("2026-10-15T08:00:00Z"),
  kind: "indicativo",
  customer: { name: "Anna Verdi", email: "anna@esempio.it", phone: "+39 333 1234567", cap: "37026", comune: "Pescantina" },
  config: {
    typology: "addossata-monofalda",
    params: defaultParams(getTypology("addossata-monofalda")),
    envelope: parseEnvelope({ box: { width: 6000, depth: 3600, height: 3700 } }),
    embedment: 0,
  },
  customerQuote: customerView(golden),
  customerNotes: "Accesso dal cancello laterale 😀",
  ...over,
});

const norm = (s: string) => s.replace(/\u00a0/g, " ").replace(/\n/g, "");

describe("PDF del preventivo (8.3)", () => {
  it("dall'istantanea golden: codice, totale e condizioni; nessun dato interno", async () => {
    const pdf = await renderQuotePdf(quotePdfData(source()));
    expect(Buffer.from(pdf.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    const text = norm(extractPdfText(pdf));
    expect(text).toContain("PRV-2026-00042");
    expect(text).toContain(norm(formatEuro(golden.totals.totalCents)));
    expect(text).toContain("Prezzo indicativo, soggetto a sopralluogo");
    expect(text).toContain("Anna Verdi");
    expect(text).toContain("15/10/2026");
    expect(text).toMatch(/Larghezza/);
    for (const word of ["margine", "tariffa", "€/h", "sfrido", "costo"]) expect(text.toLowerCase()).not.toContain(word);
  });

  it("rigenerazione dalla stessa istantanea → stesso testo e stesso totale (il PDF legge solo la vista cliente salvata, mai il listino)", async () => {
    const a = norm(extractPdfText(await renderQuotePdf(quotePdfData(source()))));
    const b = norm(extractPdfText(await renderQuotePdf(quotePdfData(source()))));
    expect(a).toBe(b);
    expect(b).toContain(norm(formatEuro(golden.totals.totalCents)));
  });

  it("pianta fuori squadra con deviazione e immagine della scena PNG", async () => {
    const plan = planFromDiagonals({ front: 5000, back: 5000, left: 3000, right: 3000, d1: 5900, d2: 5760 });
    const envelope = parseEnvelope({ box: boxOfPlan(plan, 3700), plan });
    const data = quotePdfData(source({ config: { ...source().config, envelope }, image: { format: "png", data: tinyPng() } }));
    expect(data.plan!.maxDeviationDeg).toBeGreaterThan(1);
    expect(data.drawing).toBeNull();
    const text = norm(extractPdfText(await renderQuotePdf(data)));
    expect(text).toMatch(/Pianta fuori squadra: deviazione massima \d+,\d°/);
  });

  it("senza immagine: assonometria vettoriale di ripiego", () => {
    const data = quotePdfData(source());
    expect(data.drawing!.polygons.length).toBeGreaterThan(10);
  });

  it("testo del cliente ridotto a WinAnsi (emoji → ?)", () => {
    expect(pdfText("Accesso 😀 → cancello\u0007")).toBe("Accesso ? ? cancello");
    expect(pdfText("Città – 10 €")).toBe("Città – 10 €");
  });
});
