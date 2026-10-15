import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { seedDatabase } from "@/db/seed";
import { createMemorySender, setEmailSender } from "@/server/email/sender";
import { extractPdfText } from "@/server/pdf/__tests__/pdf-text";
import { EstimateRequestSchema } from "@/server/public-dto";
import { getPublicCatalog, invalidatePublicCatalog } from "@/server/quotes/catalog";
import { computeEstimate } from "@/server/quotes/estimate";
import { STORED_QUOTE_SCHEMA, StoredQuoteSchema } from "@/server/quotes/snapshot";
import { freshDb, makeUser } from "@/server/repositories/__tests__/helpers";
import { defaultConfig, serializeConfig } from "@/stores";

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/server/auth/auth", () => ({ auth: async () => session.current }));

const { saveFinalQuote } = await import("../final-quote");
const { openRequest } = await import("@/server/quotes/open-request");
const leads = await import("@/server/repositories/leads");
const { leadPdf } = await import("@/server/quotes/lead-pdf");
const { listForLead } = await import("@/server/email/outbox");

const sender = createMemorySender();
afterAll(() => {
  setEmailSender(undefined);
  return closeDb();
});

const as = (u: { id: string; email: string; role: string }) => {
  session.current = { user: { id: u.id, email: u.email, role: u.role, active: true } };
};

/** Richiesta dal sito come la salva `POST /api/preventivo` (istantanea indicativa). */
async function siteLead() {
  const catalog = await getPublicCatalog();
  const request = EstimateRequestSchema.parse({
    config: JSON.parse(serializeConfig(defaultConfig("autoportante-bifalda"))),
    declared: { access: "medio", cap: "37026" },
    commercial: { species: "larice", quality: "lamellare", treatment: "impregnante-incolore", covering: null },
  });
  const r = computeEstimate(request, catalog);
  const { lead } = await leads.createLeadWithQuote({
    customer: { name: "Giulia Verdi", email: "giulia@example.com", phone: "+39 333 1234567", cap: "37026", comune: "Pescantina" },
    consent: { text: "ok", version: "2026-10", acceptedAt: new Date().toISOString() },
    quote: {
      config: JSON.parse(serializeConfig(r.config)),
      quote: {
        schema: STORED_QUOTE_SCHEMA,
        typology: { slug: r.config.typology, title: r.typologyTitle },
        customerQuote: r.response.quote,
        notes: [...r.response.notes],
        commercial: request.commercial,
        declared: request.declared,
        sceneImageId: null,
        office: {},
      },
      totalCents: r.quote.totals.totalCents,
      priceListVersionId: catalog.priceListVersionId,
      ruleSetVersionId: catalog.ruleSetVersionId,
    },
  });
  return { lead, estimate: r };
}

describe("saveFinalQuote e apertura della richiesta (10.4)", () => {
  let commerciale: Awaited<ReturnType<typeof makeUser>>;

  beforeEach(async () => {
    await freshDb();
    await seedDatabase();
    invalidatePublicCatalog();
    commerciale = await makeUser("vendite@lovato.it", "commerciale", "Marco Neri");
    as(commerciale);
    sender.clear();
    setEmailSender(sender);
  });

  it("apertura: codice, cliente, stato e configurazione con le scelte del cliente; id inesistente ⇒ avviso", async () => {
    const { lead } = await siteLead();
    const opened = await openRequest(lead.id);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.request).toMatchObject({ code: lead.code, status: "nuovo", customer: { name: "Giulia Verdi" }, adminUrl: `/admin/richieste/${lead.id}`, quotesCount: 1 });
    expect((opened.request.config as { typology: string }).typology).toBe("autoportante-bifalda");
    expect((opened.request.config as { commercial: unknown }).commercial).toEqual({ species: "larice", quality: "lamellare", treatment: "impregnante-incolore", covering: null, access: "medio", cap: "37026" });
    expect(await openRequest("00000000-0000-0000-0000-000000000000")).toMatchObject({ ok: false, message: expect.stringMatching(/non esiste/) });
    expect(await openRequest("../../etc")).toMatchObject({ ok: false });
  });

  it("due preventivi sulla richiesta: il definitivo include la riga manuale e il totale aggiornato", async () => {
    const { lead, estimate } = await siteLead();
    const opened = await openRequest(lead.id);
    const config = opened.ok ? opened.request.config : null;
    const base = await saveFinalQuote({ leadId: lead.id, config, vat: "ordinaria" });
    expect(base.ok).toBe(true);
    const res = await saveFinalQuote({
      leadId: lead.id,
      config,
      vat: "ordinaria",
      manualLines: [{ description: "Smontaggio vecchia tettoia", amountCents: 50_000 }],
    });
    expect(res).toMatchObject({ ok: true, data: { status: "nuovo", emailQueued: false } });
    if (!res.ok || !base.ok) return;
    // imponibile + 500 € ⇒ totale + 610 € (IVA 22%), al passo di arrotondamento di 10 €
    expect(Math.abs(res.data.totalCents - base.data.totalCents - 61_000)).toBeLessThanOrEqual(1_000);

    const detail = await leads.get(lead.id);
    expect(detail.quotes.map((q) => q.kind)).toEqual(["definitivo", "definitivo", "indicativo"]);
    const def = detail.quotes[0];
    expect(def.manualLines).toEqual([{ description: "Smontaggio vecchia tettoia", amountCents: 50_000 }]);
    expect(def.totalCents).toBe(res.data.totalCents);
    expect(def.createdBy).toBe(commerciale.id);
    const stored = StoredQuoteSchema.parse(def.quote);
    expect(stored.customerQuote.groups.find((g) => g.id === "altre-voci")?.amountCents).toBe(50_000);
    expect(stored.customerQuote.totalCents).toBe(def.totalCents);
    expect(stored.typology.title).toBe(estimate.typologyTitle);
    expect(stored.commercial.species).toBe("larice");
    // il PDF della richiesta ora viene dal definitivo
    const pdf = await leadPdf(lead.id);
    expect(extractPdfText(pdf!.pdf)).toContain("Altre voci");
  });

  it("sconto, IVA 10%, stato preventivo-inviato ed email al cliente con il PDF", async () => {
    const { lead } = await siteLead();
    const opened = await openRequest(lead.id);
    const res = await saveFinalQuote({
      leadId: lead.id,
      config: opened.ok ? opened.request.config : null,
      vat: "ristrutturazione",
      discount: { kind: "percento", value: 5 },
      markSent: true,
      sendEmail: true,
    });
    expect(res).toMatchObject({ ok: true, data: { status: "preventivo-inviato", emailQueued: true } });
    const detail = await leads.get(lead.id);
    const stored = StoredQuoteSchema.parse(detail.quotes[0].quote);
    expect(stored.customerQuote.vatPct).toBe(10);
    expect(stored.customerQuote.discountCents).toBeLessThan(0);
    expect(detail.events.at(-1)).toMatchObject({ from: "nuovo", to: "preventivo-inviato", userId: commerciale.id });
    const outbox = await listForLead(lead.id);
    expect(outbox.some((e) => e.template === "preventivo-definitivo" && e.status === "inviata")).toBe(true);
    const mail = sender.sent.find((m) => m.subject.includes(lead.code));
    expect(mail?.to).toBe("giulia@example.com");
    expect(mail?.attachments?.[0]?.contentType).toBe("application/pdf");
    expect(mail?.text).not.toMatch(/margine|sfrido|€\/h/i);
  });

  it("permessi e ingressi: ufficio tecnico 403, richiesta inesistente 404, IVA o configurazione non valide 400", async () => {
    const { lead } = await siteLead();
    const config = JSON.parse(serializeConfig(defaultConfig("autoportante-bifalda")));
    const tecnico = await makeUser("tecnico@lovato.it", "ufficio-tecnico");
    as(tecnico);
    expect(await saveFinalQuote({ leadId: lead.id, config, vat: "ordinaria" })).toMatchObject({ ok: false, status: 403 });
    as(commerciale);
    expect(await saveFinalQuote({ leadId: "inesistente", config, vat: "ordinaria" })).toMatchObject({ ok: false, status: 404 });
    expect(await saveFinalQuote({ leadId: lead.id, config, vat: "esente" })).toMatchObject({ ok: false, status: 400 });
    expect(await saveFinalQuote({ leadId: lead.id, config: { ...config, typology: "boh" }, vat: "ordinaria" })).toMatchObject({ ok: false, status: 400 });
    expect(await saveFinalQuote({ leadId: lead.id, config, vat: "ordinaria", manualLines: [{ description: "", amountCents: 1 }] })).toMatchObject({ ok: false, status: 400 });
    session.current = null;
    expect(await saveFinalQuote({ leadId: lead.id, config, vat: "ordinaria" })).toMatchObject({ ok: false, status: 401 });
    expect((await leads.get(lead.id)).quotes).toHaveLength(1);
  });
});
