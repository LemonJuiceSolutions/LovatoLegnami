import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { DEFAULT_PRICE_LIST_DATA } from "@/domain/pricing/data/default-listino";
import { DEFAULT_LOVATO_DATA } from "@/domain/rules/data/default-lovato";
import { defaultTypologySettings } from "@/domain/site/typology-settings";
import { defaultRegistry } from "@/domain/typologies/registry";
import { freshDb, makeUser } from "@/server/repositories/__tests__/helpers";

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/server/auth/auth", () => ({ auth: async () => session.current }));
const invalidate = vi.hoisted(() => vi.fn());
vi.mock("@/server/quotes/catalog", async (orig) => ({ ...(await orig<object>()), invalidatePublicCatalog: invalidate }));

const { saveDraftSection } = await import("../datasets");
const { getPublishPreview, publishDataset } = await import("../publish");
const repo = await import("@/server/repositories/datasets");
const audit = await import("@/server/repositories/audit");

afterAll(() => closeDb());

const as = (u: { id: string } | null) => {
  session.current = u ? { user: { id: u.id, email: "x" } } : null;
};
const rules = (DEFAULT_LOVATO_DATA as { rules: unknown[] }).rules;

describe("pubblicazione (9.4)", () => {
  let lucia: { id: string };
  let mario: { id: string };

  beforeEach(async () => {
    await freshDb();
    invalidate.mockClear();
    lucia = await makeUser("lucia@lovato.it", "ufficio-tecnico", "Lucia Bianchi");
    mario = await makeUser("mario@lovato.it", "commerciale", "Mario Rossi");
    await repo.createVersion({ dataset: "listino", data: DEFAULT_PRICE_LIST_DATA, status: "attiva", effectiveFrom: "2026-01-01", version: 1 });
    await repo.createVersion({ dataset: "regole", data: DEFAULT_LOVATO_DATA, status: "attiva", effectiveFrom: "2026-01-01", version: 1 });
    // sul sito è visibile solo la bifalda
    await repo.createVersion({ dataset: "tipologie", data: defaultTypologySettings(defaultRegistry, ["autoportante-bifalda"]), status: "attiva", effectiveFrom: "2026-01-01", version: 1 });
    as(lucia);
  });

  const draftLock = async (dataset: "regole" | "listino") => (await repo.getDraft(dataset))!.updatedAt.toISOString();

  it("set di regole che rompe la bifalda visibile ⇒ rifiutato con l'elenco delle tipologie", async () => {
    const strict = [...rules, { id: "interasse-stretto", name: "Interasse impossibile", kind: "max-joist-spacing", severity: "errore", max: 50 }];
    expect((await saveDraftSection({ dataset: "regole", path: "rules", value: strict, expectedUpdatedAt: null })).ok).toBe(true);
    const preview = await getPublishPreview("regole");
    expect(preview.ok && preview.data.blocking).toEqual(["tipologie non generabili: autoportante-bifalda"]);
    expect(preview.ok && preview.data.warnings[0]).toMatch(/non visibili sul sito .*addossata-monofalda/);
    const res = await publishDataset({ dataset: "regole", effectiveFrom: "2026-01-01", notes: null, expectedUpdatedAt: await draftLock("regole") });
    expect(res).toEqual({ ok: false, status: 409, message: "pubblicazione rifiutata: tipologie non generabili: autoportante-bifalda" });
    expect((await repo.getActive("regole"))!.version).toBe(1);
    expect(await repo.getDraft("regole")).not.toBeNull();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("pubblicazione valida ⇒ nuova attiva, precedente archiviata, registro e cache invalidata", async () => {
    const lighter = rules.map((r) => ((r as { kind: string }).kind === "max-joist-spacing" ? { ...(r as object), max: 1000 } : r));
    expect((await saveDraftSection({ dataset: "regole", path: "rules", value: lighter, expectedUpdatedAt: null })).ok).toBe(true);
    const preview = await getPublishPreview("regole");
    expect(preview.ok && preview.data.blocking).toEqual([]);
    expect(preview.ok && preview.data.diff.map((d) => d.path)).toEqual([expect.stringMatching(/^rules\[\d+\]\.max$/)]);
    const res = await publishDataset({ dataset: "regole", effectiveFrom: "2026-01-01", notes: "interasse 1000", expectedUpdatedAt: await draftLock("regole") });
    expect(res).toMatchObject({ ok: true, data: { version: 2, archivedVersion: 1 } });
    const active = await repo.getActive("regole");
    expect(active).toMatchObject({ version: 2, status: "attiva", notes: "interasse 1000", publishedBy: lucia.id });
    expect(active!.publishedAt).toBeInstanceOf(Date);
    expect((await repo.listVersions("regole")).map((v) => [v.version, v.status])).toEqual([
      [2, "attiva"],
      [1, "archiviata"],
    ]);
    expect(await repo.getDraft("regole")).toBeNull();
    expect((await audit.list({ dataset: "regole" })).map((e) => e.action).slice(0, 2)).toEqual(["archivia", "pubblica"]);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("listino con un prezzo mancante usato dai preset ⇒ rifiutato con il preset e la voce", async () => {
    as(mario);
    const m3 = structuredClone(DEFAULT_PRICE_LIST_DATA.timber.pricePerM3) as Record<string, Record<string, number>>;
    delete m3.abete!.lamellare;
    expect((await saveDraftSection({ dataset: "listino", path: "timber.pricePerM3", value: m3, expectedUpdatedAt: null })).ok).toBe(true);
    const res = await publishDataset({ dataset: "listino", effectiveFrom: "2026-01-01", notes: null, expectedUpdatedAt: await draftLock("listino") });
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(!res.ok && res.message).toMatch(/^pubblicazione rifiutata: prezzo mancante nel preset [a-z0-9-]+: abete\|lamellare\|/);
    expect((await repo.getActive("listino"))!.version).toBe(1);
  });

  it("validità futura: la versione di oggi resta attiva fino alla nuova data; lock e permessi", async () => {
    as(mario);
    expect((await saveDraftSection({ dataset: "listino", path: "margins.labourPct", value: 33, expectedUpdatedAt: null })).ok).toBe(true);
    const lock = await draftLock("listino");
    // lock scaduto
    expect(await publishDataset({ dataset: "listino", effectiveFrom: "2027-01-01", notes: null, expectedUpdatedAt: "2020-01-01T00:00:00.000Z" })).toMatchObject({ ok: false, status: 409 });
    // l'ufficio tecnico pubblica il listino (ha una parte del listino), il commerciale non pubblica le regole
    as(lucia);
    const res = await publishDataset({ dataset: "listino", effectiveFrom: "2027-01-01", notes: "listino 2027", expectedUpdatedAt: lock });
    expect(res).toMatchObject({ ok: true, data: { version: 2, archivedVersion: null } });
    expect((await repo.getActive("listino"))!.version).toBe(1);
    expect((await repo.getActive("listino", "2027-01-02"))!.version).toBe(2);
    as(mario);
    expect(await getPublishPreview("regole")).toMatchObject({ ok: false, status: 403 });
    expect(await publishDataset({ dataset: "regole", effectiveFrom: "2026-01-01", notes: null, expectedUpdatedAt: lock })).toMatchObject({ ok: false, status: 403 });
    expect(await publishDataset({ dataset: "listino", effectiveFrom: "2026-13-45", notes: null, expectedUpdatedAt: lock })).toMatchObject({ ok: false, status: 400 });
  });
});
