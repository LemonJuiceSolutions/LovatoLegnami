import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { seedDatabase } from "@/db/seed";
import { PRIVACY_NOTICE_VERSION } from "@/server/consent";
import { listForLead } from "@/server/email/outbox";
import { createMemorySender, setEmailSender } from "@/server/email/sender";
import { extractPdfText } from "@/server/pdf/__tests__/pdf-text";
import { blacklistedKeys } from "@/server/public-dto";
import { invalidatePublicCatalog } from "@/server/quotes/catalog";
import { resetRateLimits } from "@/server/rate-limit";
import { freshDb, makeUser } from "@/server/repositories/__tests__/helpers";
import { createMemoryStorage, setFileStorage } from "@/server/storage/storage";
import { JPEG } from "@/server/storage/__tests__/fixtures";
import { defaultConfig, serializeConfig } from "@/stores";

/**
 * 14.1 – flusso completo di una richiesta su PGlite: seed → stima pubblica → invio con foto
 * → email in outbox → presa in carico → apertura nel configuratore → preventivo definitivo
 * con riga manuale → PDF → riepilogo e PDF dal token del cliente. Ogni risposta pubblica è
 * controllata contro la lista dei campi interni.
 */

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/server/auth/auth", () => ({ auth: async () => session.current }));

const { handleEstimatePost } = await import("@/server/routes/estimate");
const { handleSubmitPost } = await import("@/server/routes/submit");
const { handleCustomerPdfGet } = await import("@/server/routes/customer-pdf");
const { handleUploadGet } = await import("@/server/routes/uploads");
const { takeLead } = await import("@/server/actions/leads");
const { saveFinalQuote } = await import("@/server/actions/final-quote");
const { openRequest } = await import("@/server/quotes/open-request");
const { loadCustomerSummary } = await import("@/server/quotes/customer-summary");
const { leadPdf } = await import("@/server/quotes/lead-pdf");
const leads = await import("@/server/repositories/leads");

const sender = createMemorySender();
const storage = createMemoryStorage();
const IP = "203.0.113.14";
const CUSTOMER_EMAIL = "paolo.bianchi@example.com";

const estimateBody = {
  config: JSON.parse(serializeConfig(defaultConfig("addossata-monofalda"))),
  declared: { access: "medio", cap: "37026" },
  commercial: { species: "abete", quality: "lamellare", treatment: "impregnante-incolore", covering: "policarbonato-alveolare" },
};

beforeAll(async () => {
  setEmailSender(sender);
  setFileStorage(storage);
  await freshDb();
  await seedDatabase({ adminEmail: "admin@lovato.it" });
  invalidatePublicCatalog();
  resetRateLimits();
});
afterAll(() => {
  setEmailSender(undefined);
  setFileStorage(undefined);
  session.current = null;
  return closeDb();
});

describe("flusso di una richiesta dal sito al preventivo definitivo (14.1)", () => {
  it("dalla stima al token del cliente", async () => {
    // 1. Stima pubblica
    const est = await handleEstimatePost(
      new Request("http://localhost/api/preventivo/stima", {
        method: "POST",
        body: JSON.stringify(estimateBody),
        headers: { "content-type": "application/json", "x-forwarded-for": IP },
      }),
    );
    expect(est.status).toBe(200);
    const estimate = await est.json();
    expect(blacklistedKeys(estimate)).toEqual([]);
    expect(estimate.quote.totalCents).toBeGreaterThan(0);
    expect(estimate.quote.notes.join(" ")).not.toMatch(/\d+,\d+\s*mm/);

    // 2. Invio della richiesta con una foto
    const startedAt = Date.now() - 90_000;
    const form = new FormData();
    form.set(
      "request",
      JSON.stringify({
        estimate: estimateBody,
        customer: { name: "Paolo Bianchi", email: CUSTOMER_EMAIL, phone: "+39 345 0000000", cap: "37026", comune: "Pescantina" },
        notes: "Giardino con accesso dal retro",
        consent: { accepted: true, version: PRIVACY_NOTICE_VERSION },
        website: "",
        startedAt,
      }),
    );
    form.append("photos", new Blob([Buffer.from(JPEG)]), "giardino.jpg");
    const sub = await handleSubmitPost(new Request("http://localhost/api/preventivo", { method: "POST", body: form, headers: { "x-forwarded-for": IP } }));
    expect(sub.status).toBe(201);
    const { code, token } = await sub.json();
    expect(code).toMatch(/^PRV-\d{4}-\d{5}$/);

    // il totale salvato è quello mostrato dalla stima
    const { lead, quotes } = await leads.getByCode(code);
    expect(quotes[0]!.totalCents).toBe(estimate.quote.totalCents);
    expect((lead.photos as unknown[]).length).toBe(1);

    // 3. Email in outbox: conferma al cliente (con PDF) e notifica all'ufficio
    const outbox = await listForLead(lead.id);
    expect(outbox.map((e) => [e.template, e.status]).sort()).toEqual([
      ["conferma-cliente", "inviata"],
      ["notifica-ufficio", "inviata"],
    ]);
    const confirmation = sender.sent.find((m) => m.to === CUSTOMER_EMAIL)!;
    expect(confirmation.text).toContain(`/p/${token}`);
    // all'email del cliente nessun dato interno (margini, tariffe, ore)
    expect(confirmation.text).not.toMatch(/margine|€\/h|tariffa oraria/i);

    // 4. Presa in carico da parte del commerciale
    const commerciale = await makeUser("vendite@lovato.it", "commerciale", "Marco Neri");
    session.current = { user: { id: commerciale.id, email: commerciale.email, role: commerciale.role, active: true } };
    expect(await takeLead(lead.id)).toMatchObject({ ok: true, data: { status: "in-lavorazione", assigneeId: commerciale.id } });

    // 5. Apertura nel configuratore e preventivo definitivo con una riga manuale
    const opened = await openRequest(lead.id);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.request.code).toBe(code);
    sender.clear();
    const saved = await saveFinalQuote({
      leadId: lead.id,
      config: opened.request.config,
      vat: "ordinaria",
      manualLines: [{ description: "Rimozione vecchia copertura", amountCents: 30_000 }],
      markSent: true,
      sendEmail: true,
    });
    expect(saved).toMatchObject({ ok: true, data: { status: "preventivo-inviato", emailQueued: true } });
    if (!saved.ok) return;
    expect(sender.sent.some((m) => m.to === CUSTOMER_EMAIL && m.attachments?.[0]?.contentType === "application/pdf")).toBe(true);
    expect((await listForLead(lead.id)).some((e) => e.template === "preventivo-definitivo" && e.status === "inviata")).toBe(true);

    // 6. PDF della richiesta dal definitivo
    const pdf = await leadPdf(lead.id);
    const text = extractPdfText(pdf!.pdf);
    expect(text).toContain("Altre voci");
    expect(text).not.toMatch(/margine|€\/h/i);

    // 7. Token del cliente: riepilogo e PDF del definitivo, senza dati interni né contatti
    const summary = await loadCustomerSummary(token);
    expect(summary).not.toBeNull();
    expect(summary).toMatchObject({ code, kind: "definitivo", firstName: "Paolo" });
    expect(summary!.quote.totalCents).toBe(saved.data.totalCents);
    expect(blacklistedKeys(summary)).toEqual([]);
    expect(JSON.stringify(summary)).not.toContain(CUSTOMER_EMAIL);
    expect(JSON.stringify(summary)).not.toContain("345 0000000");

    const customerPdf = await handleCustomerPdfGet(new Request(`http://localhost/api/preventivo/${token}/pdf`, { headers: { "x-forwarded-for": IP } }), token);
    expect(customerPdf.status).toBe(200);
    expect(customerPdf.headers.get("content-type")).toBe("application/pdf");
    expect(customerPdf.headers.get("cache-control")).toBe("private, no-store");

    // 8. Le foto non sono pubbliche: senza sessione e senza token ⇒ negato
    session.current = null;
    const photoId = (lead.photos as { id: string }[])[0]!.id;
    const anonymous = await handleUploadGet(new Request(`http://localhost/api/uploads/${photoId}`), photoId);
    expect([401, 403, 404]).toContain(anonymous.status);
    const withToken = await handleUploadGet(new Request(`http://localhost/api/uploads/${photoId}?t=${token}`), photoId);
    expect(withToken.status).toBe(200);
    expect(withToken.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
