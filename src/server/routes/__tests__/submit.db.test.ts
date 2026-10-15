import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { customerTokens } from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { customerView, quoteToJSON } from "@/domain";
import { PRIVACY_NOTICE_VERSION } from "@/server/consent";
import { listForLead } from "@/server/email/outbox";
import { createMemorySender, setEmailSender } from "@/server/email/sender";
import { resetEnvCache } from "@/server/env";
import { blacklistedKeys } from "@/server/public-dto";
import { invalidatePublicCatalog } from "@/server/quotes/catalog";
import { StoredQuoteSchema } from "@/server/quotes/snapshot";
import { resetRateLimits } from "@/server/rate-limit";
import { getByCode } from "@/server/repositories/leads";
import { freshDb } from "@/server/repositories/__tests__/helpers";
import { createMemoryStorage, setFileStorage } from "@/server/storage/storage";
import { JPEG, PDF, PNG, tinyPng } from "@/server/storage/__tests__/fixtures";
import { extractPdfText } from "@/server/pdf/__tests__/pdf-text";
import { defaultConfig, parseConfigFile, serializeConfig } from "@/stores";
import { handleCustomerPdfGet } from "../customer-pdf";
import { handleSubmitPost } from "../submit";

const sender = createMemorySender();
const storage = createMemoryStorage();
const NOW = new Date("2026-10-15T08:00:00Z");

const requestJson = (over: Record<string, unknown> = {}) => ({
  estimate: {
    config: JSON.parse(serializeConfig(defaultConfig("addossata-monofalda"))),
    declared: { access: "facile", cap: "37026" },
    commercial: { species: "abete", quality: "lamellare", treatment: "impregnante-incolore", covering: "policarbonato-alveolare" },
  },
  customer: { name: "Anna <b>Verdi</b>", email: "Anna.Verdi@Esempio.it", phone: "+39 333 1234567", cap: "37026", comune: "Pescantina" },
  notes: "Chiamare dopo le 18",
  consent: { accepted: true, version: PRIVACY_NOTICE_VERSION },
  website: "",
  startedAt: NOW.getTime() - 60_000,
  ...over,
});

function submit(json: unknown, files: { photos?: Uint8Array[]; scene?: Uint8Array } = {}, ip = "198.51.100.9") {
  const form = new FormData();
  form.set("request", JSON.stringify(json));
  for (const [i, p] of (files.photos ?? []).entries()) form.append("photos", new Blob([Buffer.from(p)]), `foto-${i}.jpg`);
  if (files.scene) form.set("scene", new Blob([Buffer.from(files.scene)]), "scena.png");
  return handleSubmitPost(new Request("http://localhost/api/preventivo", { method: "POST", body: form, headers: { "x-forwarded-for": ip, "user-agent": "vitest" } }), { now: () => NOW });
}

beforeAll(() => {
  setEmailSender(sender);
  setFileStorage(storage);
});
beforeEach(async () => {
  await freshDb();
  await seedDatabase();
  invalidatePublicCatalog();
  resetRateLimits();
  sender.clear();
  sender.setFailure(null);
  storage.files.clear();
});
afterAll(() => {
  setEmailSender(undefined);
  setFileStorage(undefined);
  return closeDb();
});

describe("POST /api/preventivo (8.6)", () => {
  it("invio valido → 201 { code, token }, richiesta nuovo con istantanea, email inviate con PDF", async () => {
    const res = await submit(requestJson(), { photos: [JPEG, PNG] });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["code", "token"]);
    expect(body.code).toMatch(/^PRV-2026-\d{5}$/);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const { lead, quotes } = await getByCode(body.code);
    expect(lead.status).toBe("nuovo");
    expect(lead.customer).toMatchObject({ name: "Anna <b>Verdi</b>", email: "anna.verdi@esempio.it", cap: "37026", comune: "Pescantina" });
    expect(lead.consent).toMatchObject({ version: PRIVACY_NOTICE_VERSION, acceptedAt: NOW.toISOString(), ip: "198.51.100.9" });
    expect((lead.photos as unknown[]).map((p) => (p as { kind: string; contentType: string }).contentType)).toEqual(["image/jpeg", "image/png"]);
    expect(storage.files.size).toBe(2);

    const [q] = quotes;
    expect(q!.kind).toBe("indicativo");
    expect(q!.priceListVersionId).toBeTruthy();
    expect(q!.ruleSetVersionId).toBeTruthy();
    expect(q!.siteFactors).toMatchObject({ access: "facile" });
    const stored = StoredQuoteSchema.parse(q!.quote);
    expect(stored.customerQuote.totalCents).toBe(q!.totalCents);
    // la configurazione salvata riproduce il riepilogo
    const config = parseConfigFile(q!.config);
    expect(config.typology).toBe("addossata-monofalda");
    expect(customerView(JSON.parse(quoteToJSON(stored.office as never)))).toEqual(stored.customerQuote);

    const outbox = await listForLead(lead.id);
    expect(outbox.map((e) => [e.template, e.status])).toEqual(
      expect.arrayContaining([
        ["conferma-cliente", "inviata"],
        ["notifica-ufficio", "inviata"],
      ]),
    );
    const confirmation = sender.sent.find((m) => m.to === "anna.verdi@esempio.it")!;
    expect(confirmation.text).toContain(`http://localhost:3000/p/${body.token}`);
    expect(confirmation.attachments?.[0]?.contentType).toBe("application/pdf");
    expect(extractPdfText(confirmation.attachments![0]!.content).replace(/\n/g, "")).toContain(body.code);
    const office = sender.sent.find((m) => m.to !== "anna.verdi@esempio.it")!;
    expect(office.html).toContain("Anna &lt;b&gt;Verdi&lt;/b&gt;");
    expect(office.replyTo).toBe("anna.verdi@esempio.it");
    expect(blacklistedKeys(body)).toEqual([]);
  });

  it("consenso mancante → 400 sul campo consenso, niente salvato", async () => {
    const res = await submit(requestJson({ consent: { accepted: false, version: PRIVACY_NOTICE_VERSION } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toEqual([{ path: "consent.accepted", message: expect.stringContaining("informativa") }]);
    const res2 = await submit({ ...requestJson(), consent: undefined });
    expect((await res2.json()).issues[0].path).toBe("consent.accepted");
    expect(storage.files.size).toBe(0);
  });

  it("provider email in errore → 201 e outbox da-reinviare", async () => {
    sender.setFailure(new Error("Resend 503"));
    const res = await submit(requestJson());
    expect(res.status).toBe(201);
    const { lead } = await getByCode((await res.json()).code);
    const outbox = await listForLead(lead.id);
    expect(outbox).toHaveLength(2);
    expect(outbox.every((e) => e.status === "da-reinviare" && e.lastError === "Resend 503")).toBe(true);
  });

  it("foto non immagine o troppe foto → 400; immagine della scena salvata per il PDF", async () => {
    const pdf = await submit(requestJson(), { photos: [PDF] });
    expect(pdf.status).toBe(400);
    expect((await pdf.json()).issues).toEqual([{ path: "photos", message: "sono ammesse solo immagini" }]);
    expect((await submit(requestJson(), { photos: Array(6).fill(JPEG) })).status).toBe(400);
    expect(storage.files.size).toBe(0);
    resetRateLimits();
    const ok = await submit(requestJson(), { scene: tinyPng() });
    expect(ok.status).toBe(201);
    expect([...storage.files.keys()].every((k) => k.startsWith("scena/"))).toBe(true);
  });

  it("anti-spam: campo trappola, invio troppo rapido, chiavi in più, email non valida → 400", async () => {
    expect((await submit(requestJson({ website: "http://spam.example" }))).status).toBe(400);
    expect((await submit(requestJson({ startedAt: NOW.getTime() - 500 }))).status).toBe(400);
    resetRateLimits();
    expect((await submit({ ...requestJson(), admin: true })).status).toBe(400);
    const bad = await submit(requestJson({ customer: { ...requestJson().customer, email: "non-una-email" } }));
    expect((await bad.json()).issues[0].path).toBe("customer.email");
  });

  it("rate limit: la sesta richiesta in 10 minuti dallo stesso IP → 429", async () => {
    process.env.RATE_LIMIT_SUBMIT = "2/600";
    resetEnvCache();
    try {
      expect((await submit(requestJson(), {}, "203.0.113.9")).status).toBe(201);
      expect((await submit(requestJson(), {}, "203.0.113.9")).status).toBe(201);
      const res = await submit(requestJson(), {}, "203.0.113.9");
      expect(res.status).toBe(429);
      expect((await res.json()).error).toMatch(/troppe richieste/);
    } finally {
      delete process.env.RATE_LIMIT_SUBMIT;
      resetEnvCache();
    }
  });
});

describe("GET /api/preventivo/[token]/pdf (8.6)", () => {
  const getPdf = (token: string) => handleCustomerPdfGet(new Request(`http://localhost/api/preventivo/${token}/pdf`), token);

  it("token valido → PDF; sconosciuto → 404; scaduto → 410", async () => {
    const { token, code } = await (await submit(requestJson())).json();
    const ok = await getPdf(token);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(ok.headers.get("content-disposition")).toBe(`attachment; filename="preventivo-${code}.pdf"`);
    const text = extractPdfText(new Uint8Array(await ok.arrayBuffer())).replace(/\n/g, "");
    expect(text).toContain(code);
    expect(text.toLowerCase()).not.toContain("margine");

    expect((await getPdf("x".repeat(43))).status).toBe(404);
    const db = await getDb();
    await db.update(customerTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(customerTokens.token, token));
    const expired = await getPdf(token);
    expect(expired.status).toBe(410);
    expect((await expired.json()).error).toMatch(/contatta l'ufficio/);
  });
});
