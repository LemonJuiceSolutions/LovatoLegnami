import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { defaultConfig } from "@/stores/config";
import { serializeConfig } from "@/stores/config-file";
import { freshDb, makeUser } from "@/server/repositories/__tests__/helpers";
import { createMemoryStorage, setFileStorage } from "@/server/storage/storage";
import { storeImages } from "@/server/storage/uploads";

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/server/auth/auth", () => ({ auth: async () => session.current }));

const actions = await import("../leads");
const repo = await import("@/server/repositories/leads");
const { leadRows, leadDetailView } = await import("@/server/admin/leads-view");
const { handleAdminLeadPdf } = await import("@/server/routes/admin-lead-pdf");

afterAll(() => closeDb());
const as = (u: { id: string } | null) => {
  session.current = u ? { user: { id: u.id, email: "x" } } : null;
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

describe("azioni sulle richieste (9.9)", () => {
  let admin: { id: string };
  let mario: { id: string };
  let lucia: { id: string };
  const storage = createMemoryStorage();

  beforeEach(async () => {
    await freshDb();
    setFileStorage(storage);
    storage.files.clear();
    admin = await makeUser("admin@lovato.it", "admin", "Admin");
    mario = await makeUser("mario@lovato.it", "commerciale", "Mario Rossi");
    lucia = await makeUser("lucia@lovato.it", "ufficio-tecnico", "Lucia");
  });

  const newLead = async (photos: unknown[] = []) =>
    (
      await repo.createLeadWithQuote({
        customer: { name: "Anna Verdi", email: "anna@example.it", phone: "333" },
        consent: { version: "2026-10", text: "ok", acceptedAt: new Date().toISOString(), ip: "1.2.3.4" },
        photos,
        quote: { config: JSON.parse(serializeConfig(defaultConfig("autoportante-bifalda"))), quote: { schema: 1 }, totalCents: 647_000 },
      })
    ).lead;

  it("presa in carico ⇒ in-lavorazione e assegnatario; il tecnico non gestisce", async () => {
    const lead = await newLead();
    as(lucia);
    expect(await actions.takeLead(lead.id)).toMatchObject({ ok: false, status: 403 });
    as(mario);
    expect(await actions.takeLead(lead.id)).toEqual({ ok: true, data: { status: "in-lavorazione", assigneeId: mario.id } });
    const d = await repo.get(lead.id);
    expect(d.lead).toMatchObject({ status: "in-lavorazione", assigneeId: mario.id });
    expect(d.events.map((e) => [e.from, e.to])).toEqual([
      [null, "nuovo"],
      ["nuovo", "nuovo"],
      ["nuovo", "in-lavorazione"],
    ]);
    expect(await actions.changeLeadStatus({ leadId: lead.id, to: "rifiutato", note: "fuori zona" })).toMatchObject({ ok: true, data: { status: "rifiutato" } });
    expect(await actions.changeLeadStatus({ leadId: lead.id, to: "preventivo-inviato" })).toMatchObject({ ok: false, status: 409 });
    expect(await actions.changeLeadStatus({ leadId: lead.id, to: "inventato" as "nuovo" })).toMatchObject({ ok: false, status: 400 });
    const rows = await leadRows({ status: "rifiutato" });
    expect(rows.items).toMatchObject([{ code: lead.code, typology: "autoportante-bifalda", totalCents: 647_000, assignee: "Mario Rossi" }]);
    expect(rows.items[0]!.dimensions).toMatch(/^\d+,\d{2} × \d+,\d{2} m$/);
    expect((await leadRows({ status: "nuovo" })).items).toEqual([]);
  });

  it("anonimizza solo con dati:cancella e cancella i file delle foto", async () => {
    const refs = await storeImages([{ bytes: PNG, contentType: "image/png", size: PNG.byteLength }], "foto");
    const lead = await newLead(refs as unknown[]);
    expect(storage.files.size).toBe(1);
    as(mario);
    expect(await actions.anonymizeLead(lead.id)).toEqual({ ok: false, status: 403, message: "operazione riservata all'amministratore" });
    expect(storage.files.size).toBe(1);
    as(admin);
    expect(await actions.anonymizeLead(lead.id)).toEqual({ ok: true, data: { removedPhotos: 1 } });
    expect(storage.files.size).toBe(0);
    const view = await leadDetailView(lead.id);
    expect(view.anonymized).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/anna@example\.it|Anna Verdi|1\.2\.3\.4/);
    expect(await actions.anonymizeLead(lead.id)).toMatchObject({ ok: false, status: 409 });
  });

  it("reinvia email e PDF per l'ufficio con i permessi", async () => {
    const lead = await newLead();
    as(lucia);
    expect(await actions.resendLeadEmails(lead.id)).toMatchObject({ ok: false, status: 403 });
    as(mario);
    expect(await actions.resendLeadEmails(lead.id)).toEqual({ ok: true, data: { sent: 0, failed: 0 } });
    expect(await actions.resendLeadEmails("inesistente")).toMatchObject({ ok: false, status: 404 });
    as(null);
    expect((await handleAdminLeadPdf(lead.id)).status).toBe(401);
    as(lucia);
    expect((await handleAdminLeadPdf("inesistente")).status).toBe(404);
  });
});
