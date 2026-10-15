import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { emailOutbox, leads } from "@/db/schema";
import { anonymize, createLeadWithQuote } from "@/server/repositories/leads";
import { freshDb, makeUser } from "@/server/repositories/__tests__/helpers";
import { enqueue, flush, hasPendingFailures, listForLead, OutboxPayloadError, resend } from "../outbox";
import { createMemorySender } from "../sender";

afterAll(() => closeDb());

const confirmation = (leadId: string, code: string) => ({
  leadId,
  code,
  name: "Anna Verdi",
  typology: "Pergola addossata monofalda",
  total: "4.700,00 €",
  range: "4.230,00 € – 5.170,00 €",
  notes: [],
  link: "http://localhost:3000/p/abc",
  expiresOn: "2027-01-13",
});

async function newLead() {
  return createLeadWithQuote({
    customer: { name: "Anna Verdi", email: "anna@esempio.it" },
    consent: { text: "Informativa", version: "2026-01", acceptedAt: "2026-10-15T08:00:00.000Z" },
    quote: { config: {}, quote: {}, totalCents: 470_000 },
  });
}

describe("outbox email (8.1)", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("provider in errore → richiesta salvata e voce da-reinviare; flush dopo il ripristino → inviata", async () => {
    const sender = createMemorySender();
    sender.setFailure(new Error("Resend: 503 servizio non disponibile"));
    const { lead } = await newLead();
    const entry = await enqueue({ template: "conferma-cliente", to: "anna@esempio.it", payload: confirmation(lead.id, lead.code), leadId: lead.id });
    expect(entry.status).toBe("in-coda");

    const first = await flush({ ids: [entry.id], sender, pdfForLead: async () => new Uint8Array([1, 2, 3]) });
    expect(first).toMatchObject({ sent: 0, failed: 1 });
    const db = await getDb();
    const [saved] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(saved!.status).toBe("nuovo");
    const [failed] = await listForLead(lead.id);
    expect(failed).toMatchObject({ status: "da-reinviare", attempts: 1, lastError: "Resend: 503 servizio non disponibile" });
    expect(await hasPendingFailures(lead.id)).toBe(true);

    sender.setFailure(null);
    const second = await flush({ sender, pdfForLead: async () => new Uint8Array([1, 2, 3]) });
    expect(second).toMatchObject({ sent: 1, failed: 0 });
    const [sent] = await listForLead(lead.id);
    expect(sent).toMatchObject({ status: "inviata", attempts: 2, lastError: null });
    expect(sent!.sentAt).toBeInstanceOf(Date);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.attachments?.[0]?.filename).toBe(`preventivo-${lead.code}.pdf`);
    expect(await hasPendingFailures(lead.id)).toBe(false);
    // già inviata: un nuovo flush non la reinvia
    expect((await flush({ sender })).results).toEqual([]);
  });

  it("flush si ferma a maxAttempts; resend manuale riprova comunque", async () => {
    const sender = createMemorySender();
    sender.setFailure(new Error("rete"));
    const { lead } = await newLead();
    const entry = await enqueue({ template: "conferma-cliente", to: "anna@esempio.it", payload: confirmation(lead.id, lead.code), leadId: lead.id });
    for (let i = 0; i < 4; i++) await flush({ sender, maxAttempts: 2 });
    expect((await listForLead(lead.id))[0]!.attempts).toBe(2);
    sender.setFailure(null);
    expect(await resend(entry.id, { sender })).toEqual({ id: entry.id, status: "inviata" });
    expect((await listForLead(lead.id))[0]!.attempts).toBe(3);
  });

  it("due flush concorrenti non inviano due volte la stessa voce", async () => {
    const sender = createMemorySender();
    const { lead } = await newLead();
    await enqueue({ template: "conferma-cliente", to: "anna@esempio.it", payload: confirmation(lead.id, lead.code), leadId: lead.id });
    await Promise.all([flush({ sender }), flush({ sender })]);
    expect(sender.sent).toHaveLength(1);
  });

  it("accodamento con dati non validi o destinatario non valido → errore, niente righe", async () => {
    const { lead } = await newLead();
    await expect(enqueue({ template: "conferma-cliente", to: "non-email", payload: confirmation(lead.id, lead.code) })).rejects.toBeInstanceOf(OutboxPayloadError);
    await expect(enqueue({ template: "conferma-cliente", to: "a@b.it", payload: { ...confirmation(lead.id, lead.code), link: "file:///etc/passwd" } })).rejects.toBeInstanceOf(OutboxPayloadError);
    expect(await listForLead(lead.id)).toEqual([]);
  });

  it("voce di una richiesta anonimizzata: non inviabile, errore registrato", async () => {
    const sender = createMemorySender();
    const admin = await makeUser("admin@lovato.it");
    const { lead } = await newLead();
    await enqueue({
      template: "notifica-ufficio",
      to: "ufficio@lovato.it",
      leadId: lead.id,
      payload: { leadId: lead.id, code: lead.code, customer: { name: "Anna", email: "anna@esempio.it", phone: "", cap: "37026", comune: "Pescantina" }, typology: "Monofalda", total: null, adminUrl: "http://localhost:3000/admin/richieste/x" },
    });
    await anonymize(lead.id, admin.id);
    const r = await flush({ sender });
    expect(r.failed).toBe(1);
    expect(sender.sent).toEqual([]);
    const db = await getDb();
    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.leadId, lead.id));
    expect(row!.lastError).toMatch(/non valido|rimoss/);
  });
});
