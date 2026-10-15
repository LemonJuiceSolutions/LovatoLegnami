import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { DEFAULT_PRICE_LIST_DATA } from "@/domain/pricing/data/default-listino";
import { DEFAULT_LOVATO_DATA } from "@/domain/rules/data/default-lovato";
import { freshDb, makeUser } from "@/server/repositories/__tests__/helpers";

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/server/auth/auth", () => ({ auth: async () => session.current }));

const { saveDraftSection } = await import("../datasets");
const repo = await import("@/server/repositories/datasets");
const audit = await import("@/server/repositories/audit");

afterAll(() => closeDb());

const as = (u: { id: string } | null) => {
  session.current = u ? { user: { id: u.id, email: "x" } } : null;
};
type Listino = typeof DEFAULT_PRICE_LIST_DATA;
const pricePerM3 = (abete: number) => ({ ...DEFAULT_PRICE_LIST_DATA.timber.pricePerM3, abete: { ...DEFAULT_PRICE_LIST_DATA.timber.pricePerM3.abete, lamellare: abete } });

describe("saveDraftSection (9.2)", () => {
  let mario: { id: string };
  let lucia: { id: string };

  beforeEach(async () => {
    await freshDb();
    mario = await makeUser("mario@lovato.it", "commerciale", "Mario Rossi");
    lucia = await makeUser("lucia@lovato.it", "ufficio-tecnico", "Lucia Bianchi");
    await repo.createVersion({ dataset: "listino", data: DEFAULT_PRICE_LIST_DATA, status: "attiva", effectiveFrom: "2026-01-01", version: 1 });
    await repo.createVersion({ dataset: "regole", data: DEFAULT_LOVATO_DATA, status: "attiva", effectiveFrom: "2026-01-01", version: 1 });
    as(mario);
  });

  it("percorso non ammesso ⇒ errore 400 e nessuna bozza", async () => {
    const res = await saveDraftSection({ dataset: "listino", path: "timber", value: {}, expectedUpdatedAt: null });
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(!res.ok && res.message).toMatch(/percorso non ammesso per listino: "timber"/);
    expect(await saveDraftSection({ dataset: "listino", path: "__proto__.x", value: 1, expectedUpdatedAt: null })).toMatchObject({ ok: false, status: 400 });
    expect(await repo.getDraft("listino")).toBeNull();
  });

  it("primo salvataggio crea la bozza, scrive solo la porzione e registra la differenza", async () => {
    const res = await saveDraftSection({ dataset: "listino", path: "timber.pricePerM3", value: pricePerM3(68_000), expectedUpdatedAt: null });
    expect(res.ok).toBe(true);
    const status = res.ok ? res.data : null;
    expect(status?.draft).toMatchObject({ version: 2, by: "Mario Rossi" });
    const draft = await repo.getDraft("listino");
    expect(draft!.data.timber.pricePerM3.abete!.lamellare).toBe(68_000);
    expect((await repo.getActive("listino"))!.data.timber.pricePerM3.abete!.lamellare).toBe(DEFAULT_PRICE_LIST_DATA.timber.pricePerM3.abete.lamellare);
    const [entry] = await audit.list({ dataset: "listino" });
    expect(entry).toMatchObject({ action: "salva", userId: mario.id });
    expect(entry!.diff).toEqual([{ path: "timber.pricePerM3.abete.lamellare", before: DEFAULT_PRICE_LIST_DATA.timber.pricePerM3.abete.lamellare, after: 68_000 }]);

    // salvataggio successivo con il lock letto
    const next = await saveDraftSection({ dataset: "listino", path: "margins.labourPct", value: 30, expectedUpdatedAt: status!.draft!.updatedAt });
    expect(next.ok).toBe(true);
    // lock scaduto (il vecchio updatedAt) ⇒ 409 con l'autore
    const stale = await saveDraftSection({ dataset: "listino", path: "margins.labourPct", value: 31, expectedUpdatedAt: status!.draft!.updatedAt });
    expect(stale).toMatchObject({ ok: false, status: 409 });
    expect(!stale.ok && stale.message).toMatch(/modificata da Mario Rossi/);
    // pagina aperta senza bozza ma bozza nel frattempo creata ⇒ 409
    expect(await saveDraftSection({ dataset: "listino", path: "margins.labourPct", value: 31, expectedUpdatedAt: null })).toMatchObject({ ok: false, status: 409 });
  });

  it("permessi per parte del listino: lunghezze commerciali solo all'ufficio tecnico", async () => {
    const lengths = structuredClone(DEFAULT_PRICE_LIST_DATA.timber.stockLengths) as Record<string, { length: number }[]>;
    lengths["120×240"] = [...(lengths["120×240"] ?? []), { length: 8_000 }].sort((a, b) => a.length - b.length);
    const res = await saveDraftSection({ dataset: "listino", path: "timber.stockLengths", value: lengths, expectedUpdatedAt: null });
    expect(res).toEqual({ ok: false, status: 403, message: "operazione riservata all'ufficio tecnico" });
    expect(await repo.getDraft("listino")).toBeNull();
    as(lucia);
    expect((await saveDraftSection({ dataset: "listino", path: "timber.stockLengths", value: lengths, expectedUpdatedAt: null })).ok).toBe(true);
    // e l'ufficio tecnico non tocca i prezzi
    const draft = await repo.getDraft("listino");
    expect(await saveDraftSection({ dataset: "listino", path: "timber.pricePerM3", value: pricePerM3(1), expectedUpdatedAt: draft!.updatedAt.toISOString() })).toMatchObject({ ok: false, status: 403 });
  });

  it("documento non valido ⇒ 400 con il campo, bozza intatta", async () => {
    const res = await saveDraftSection({ dataset: "listino", path: "timber.pricePerM3", value: pricePerM3(-5), expectedUpdatedAt: null });
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(!res.ok && res.message).toMatch(/timber\.pricePerM3\.abete\.lamellare: il prezzo non può essere negativo/);
    expect(await repo.getDraft("listino")).toBeNull();
  });

  it("regole: ufficio tecnico sì, commerciale no; anonimo 401", async () => {
    const rules = (DEFAULT_LOVATO_DATA as { rules: unknown[] }).rules;
    expect(await saveDraftSection({ dataset: "regole", path: "rules", value: rules, expectedUpdatedAt: null })).toMatchObject({ ok: false, status: 403 });
    as(lucia);
    expect((await saveDraftSection({ dataset: "regole", path: "rules", value: rules.slice(1), expectedUpdatedAt: null })).ok).toBe(true);
    as(null);
    expect(await saveDraftSection({ dataset: "regole", path: "rules", value: rules, expectedUpdatedAt: null })).toMatchObject({ ok: false, status: 401 });
  });
});

export type { Listino };
