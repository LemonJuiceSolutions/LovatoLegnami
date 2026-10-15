import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { emailOutbox, quotes } from "@/db/schema";
import * as audit from "../audit";
import { ConflictError } from "../errors";
import { addFinalQuote, anonymize, assign, changeStatus, createLeadWithQuote, get, list } from "../leads";
import { issueCustomerToken, resolveToken } from "../tokens";
import { freshDb, makeUser } from "./helpers";

afterAll(() => closeDb());

const snapshot = (total = 470_000) => ({ config: { typologySlug: "addossata-monofalda", params: {} }, quote: { totals: { totalCents: total } }, totalCents: total });
const request = (name: string, now?: Date) => ({
  customer: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}@esempio.it`, phone: "+39 333 1234567", address: "Via Roma 1, Verona" },
  consent: { text: "Informativa privacy…", version: "2026-01", acceptedAt: "2026-10-15T08:00:00.000Z", ip: "203.0.113.7", userAgent: "Mozilla/5.0" },
  photos: [{ id: "foto-1", contentType: "image/jpeg" }],
  notes: "Chiamare dopo le 18",
  quote: snapshot(),
  ...(now ? { now } : {}),
});

describe("richieste (6.7)", () => {
  let mario: { id: string };

  beforeEach(async () => {
    await freshDb();
    mario = await makeUser("mario@lovato.it", "commerciale", "Mario Rossi");
  });

  it("due richieste nello stesso anno hanno codici consecutivi; il contatore riparte con l'anno", async () => {
    const a = await createLeadWithQuote(request("Anna Verdi", new Date("2026-03-01T10:00:00Z")));
    const b = await createLeadWithQuote(request("Bruno Neri", new Date("2026-03-02T10:00:00Z")));
    const c = await createLeadWithQuote(request("Carla Blu", new Date("2026-12-31T23:30:00Z"))); // 1/1/2027 in Italia
    expect([a.lead.code, b.lead.code, c.lead.code]).toEqual(["PRV-2026-00001", "PRV-2026-00002", "PRV-2027-00001"]);
    expect(a.lead.status).toBe("nuovo");
    expect(a.quote).toMatchObject({ kind: "indicativo", totalCents: 470_000, leadId: a.lead.id });
    const detail = await get(a.lead.id);
    expect(detail.events.map((e) => [e.from, e.to])).toEqual([[null, "nuovo"]]);
  });

  it("list filtra per stato e cerca per codice, nome ed email", async () => {
    const a = await createLeadWithQuote(request("Anna Verdi"));
    await createLeadWithQuote(request("Bruno Neri"));
    await changeStatus(a.lead.id, "in-lavorazione", mario.id);
    expect((await list()).total).toBe(2);
    expect((await list({ status: "in-lavorazione" })).items.map((i) => i.customerName)).toEqual(["Anna Verdi"]);
    expect((await list({ q: "neri" })).items.map((i) => i.customerName)).toEqual(["Bruno Neri"]);
    expect((await list({ q: "bruno.neri@" })).total).toBe(1);
    expect((await list({ q: a.lead.code })).items[0]?.id).toBe(a.lead.id);
    expect((await list({ q: "%" })).total).toBe(0);
    const page2 = await list({ page: 2, pageSize: 1 });
    expect(page2).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(page2.items).toHaveLength(1);
  });

  it("preventivo-inviato senza preventivo definitivo è rifiutato; con il definitivo riesce", async () => {
    const { lead } = await createLeadWithQuote(request("Anna Verdi"));
    await expect(changeStatus(lead.id, "preventivo-inviato", mario.id)).rejects.toBeInstanceOf(ConflictError);
    await addFinalQuote(lead.id, snapshot(512_000), [{ label: "Sconto cantiere", amountCents: -10_000 }], mario.id);
    const updated = await changeStatus(lead.id, "preventivo-inviato", mario.id, "inviato per email");
    expect(updated.status).toBe("preventivo-inviato");
    const detail = await get(lead.id);
    expect(detail.quotes.map((q) => q.kind)).toEqual(["definitivo", "indicativo"]);
    expect(detail.events.at(-1)).toMatchObject({ from: "nuovo", to: "preventivo-inviato", userId: mario.id, note: "inviato per email" });
    expect((await audit.list({ entity: "lead", entityId: lead.id })).map((e) => e.action)).toEqual(["cambia-stato", "preventivo-definitivo"]);
  });

  it("assign registra l'evento", async () => {
    const { lead } = await createLeadWithQuote(request("Anna Verdi"));
    const updated = await assign(lead.id, mario.id, mario.id);
    expect(updated.assigneeId).toBe(mario.id);
    expect((await list()).items[0]?.assigneeName).toBe("Mario Rossi");
    expect((await get(lead.id)).events.at(-1)?.note).toBe("assegnata a Mario Rossi");
  });

  it("l'anonimizzazione rimuove i dati personali e conserva i preventivi", async () => {
    const { lead } = await createLeadWithQuote(request("Anna Verdi"));
    const db = await getDb();
    await db.insert(emailOutbox).values({ leadId: lead.id, to: "anna.verdi@esempio.it", template: "conferma-cliente", payload: { name: "Anna Verdi" } });
    const { token } = await issueCustomerToken(lead.id);
    const { lead: anon, removedPhotos } = await anonymize(lead.id, mario.id);
    expect(removedPhotos).toEqual([{ id: "foto-1", contentType: "image/jpeg" }]);
    expect(anon.anonymizedAt).toBeInstanceOf(Date);
    const serialized = JSON.stringify(anon);
    for (const personal of ["Anna", "Verdi", "esempio.it", "333", "Via Roma", "203.0.113.7", "Mozilla", "Chiamare"]) expect(serialized).not.toContain(personal);
    expect(anon.consent).toMatchObject({ text: "Informativa privacy…", version: "2026-01", acceptedAt: "2026-10-15T08:00:00.000Z" });
    expect(await db.select().from(quotes).where(eq(quotes.leadId, lead.id))).toHaveLength(1);
    const [mail] = await db.select().from(emailOutbox).where(eq(emailOutbox.leadId, lead.id));
    expect(JSON.stringify(mail)).not.toContain("Verdi");
    expect(await resolveToken(token)).toBeNull();
    await expect(anonymize(lead.id, mario.id)).rejects.toBeInstanceOf(ConflictError);
    expect(JSON.stringify(await audit.list({ entity: "lead" }))).not.toContain("Verdi");
  });

  it("token cliente: valido per 90 giorni, poi null; sconosciuto ⇒ null", async () => {
    const { lead } = await createLeadWithQuote(request("Anna Verdi"));
    const now = new Date("2026-10-15T08:00:00Z");
    const { token, expiresAt } = await issueCustomerToken(lead.id, 90, now);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(expiresAt.toISOString()).toBe("2027-01-13T08:00:00.000Z");
    expect(await resolveToken(token, new Date("2026-12-01T00:00:00Z"))).toEqual({ leadId: lead.id, expiresAt });
    expect(await resolveToken(token, new Date("2027-01-13T08:00:00.001Z"))).toBeNull();
    expect(await resolveToken("x".repeat(43))).toBeNull();
    expect(await resolveToken("'; drop table leads; --")).toBeNull();
  });
});
