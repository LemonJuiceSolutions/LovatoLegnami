import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { DEFAULT_PRICE_LIST_DATA } from "@/domain/pricing/data/default-listino";
import { DEFAULT_LOVATO_DATA } from "@/domain/rules/data/default-lovato";
import { createVersion, diff, getActive, getDraft, listVersions, openDraft, publishDraft, saveDraft } from "../datasets";
import { ConcurrentEditError, DatasetValidationError, NotFoundError } from "../errors";
import { freshDb, makeUser } from "./helpers";

const clone = <T>(v: T): T => structuredClone(v);
type Listino = typeof DEFAULT_PRICE_LIST_DATA;
const withAbete = (price: number): Listino => {
  const d = clone(DEFAULT_PRICE_LIST_DATA) as Listino & { timber: { pricePerM3: Record<string, Record<string, number>> } };
  d.timber.pricePerM3.abete!.lamellare = price;
  return d;
};

afterAll(() => closeDb());

describe("repository dei dataset (6.3)", () => {
  let mario: { id: string };
  let lucia: { id: string };

  beforeEach(async () => {
    await freshDb();
    mario = await makeUser("mario@lovato.it", "commerciale", "Mario Rossi");
    lucia = await makeUser("lucia@lovato.it", "ufficio-tecnico", "Lucia Bianchi");
    await createVersion({ dataset: "listino", data: DEFAULT_PRICE_LIST_DATA, status: "attiva", effectiveFrom: "2026-01-01", version: 1 });
  });

  it("openDraft crea la bozza dalla versione attiva e la riusa", async () => {
    const d1 = await openDraft("listino", mario.id);
    expect(d1).toMatchObject({ version: 2, status: "bozza", effectiveFrom: "2026-01-01" });
    const d2 = await openDraft("listino", lucia.id);
    expect(d2.id).toBe(d1.id);
    expect((await getDraft("listino"))?.id).toBe(d1.id);
  });

  it("pubblicare v3 archivia v2 e registra la data di pubblicazione", async () => {
    const d2 = await openDraft("listino", mario.id);
    await publishDraft("listino", mario.id);
    const d3 = await openDraft("listino", mario.id);
    expect(d3.version).toBe(3);
    await saveDraft("listino", withAbete(68_000), d3.updatedAt, mario.id);
    const { published, archived } = await publishDraft("listino", mario.id);
    expect(published).toMatchObject({ version: 3, status: "attiva", publishedBy: mario.id });
    expect(published.publishedAt).toBeInstanceOf(Date);
    expect(archived).toMatchObject({ id: d2.id, version: 2, status: "archiviata" });
    const statuses = (await listVersions("listino")).map((v) => [v.version, v.status]);
    expect(statuses).toEqual([
      [3, "attiva"],
      [2, "archiviata"],
      [1, "archiviata"],
    ]);
    expect((await getActive("listino"))?.version).toBe(3);
    expect(await getDraft("listino")).toBeNull();
  });

  it("un prezzo negativo è rifiutato citando il campo e la bozza resta intatta", async () => {
    const draft = await openDraft("listino", mario.id);
    const err = await saveDraft("listino", withAbete(-100), draft.updatedAt, mario.id).catch((e) => e);
    expect(err).toBeInstanceOf(DatasetValidationError);
    expect((err as DatasetValidationError).issues.map((i) => i.path)).toContain("timber.pricePerM3.abete.lamellare");
    expect((err as Error).message).toContain("timber.pricePerM3.abete.lamellare");
    const after = await getDraft("listino");
    expect(after?.updatedAt.getTime()).toBe(draft.updatedAt.getTime());
    expect(after?.data).toEqual(draft.data);
  });

  it("expectedUpdatedAt superato ⇒ 'bozza modificata da …'", async () => {
    const draft = await openDraft("listino", mario.id);
    const saved = await saveDraft("listino", withAbete(66_000), draft.updatedAt, lucia.id);
    expect(saved.updatedAt.getTime()).toBeGreaterThan(draft.updatedAt.getTime());
    const err = await saveDraft("listino", withAbete(67_000), draft.updatedAt, mario.id).catch((e) => e);
    expect(err).toBeInstanceOf(ConcurrentEditError);
    expect((err as Error).message).toMatch(/bozza è stata modificata da Lucia Bianchi/);
    expect((await getDraft("listino"))?.data.timber.pricePerM3.abete?.lamellare).toBe(66_000);
  });

  it("getActive per data sceglie la versione in vigore", async () => {
    await createVersion({ dataset: "listino", data: withAbete(70_000), status: "attiva", effectiveFrom: "2026-07-01" });
    expect((await getActive("listino", "2025-12-31"))).toBeNull();
    expect((await getActive("listino", "2026-03-01"))?.version).toBe(1);
    expect((await getActive("listino", new Date("2026-07-01T10:00:00Z")))?.version).toBe(2);
    expect((await getActive("listino", "2027-01-01"))?.data.timber.pricePerM3.abete?.lamellare).toBe(70_000);
  });

  it("pubblicare con validità diversa non archivia l'attiva precedente", async () => {
    await openDraft("listino", mario.id, { effectiveFrom: "2026-09-01" });
    const { archived } = await publishDraft("listino", mario.id);
    expect(archived).toBeNull();
    expect((await getActive("listino", "2026-08-01"))?.version).toBe(1);
    expect((await getActive("listino", "2026-09-01"))?.version).toBe(2);
  });

  it("diff elenca i campi cambiati tra due versioni", async () => {
    const draft = await openDraft("listino", mario.id);
    await saveDraft("listino", withAbete(68_000), draft.updatedAt, mario.id);
    const v1 = (await listVersions("listino")).find((v) => v.version === 1)!;
    expect(await diff(v1.id, draft.id)).toEqual([{ path: "timber.pricePerM3.abete.lamellare", before: 65_000, after: 68_000 }]);
  });

  it("le regole sono validate con loadRuleSet; senza bozza non si pubblica", async () => {
    await expect(createVersion({ dataset: "regole", data: { id: "x", rules: [{ id: "r", kind: "ignota" }] }, status: "attiva", effectiveFrom: "2026-01-01" })).rejects.toBeInstanceOf(
      DatasetValidationError,
    );
    await createVersion({ dataset: "regole", data: DEFAULT_LOVATO_DATA, status: "attiva", effectiveFrom: "2026-01-01" });
    await expect(publishDraft("regole", mario.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(openDraft("tipologie", mario.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
