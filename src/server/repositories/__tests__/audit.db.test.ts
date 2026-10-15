import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { DEFAULT_PRICE_LIST_DATA } from "@/domain/pricing/data/default-listino";
import * as audit from "../audit";
import { createVersion, openDraft, publishDraft, saveDraft } from "../datasets";
import { freshDb, makeUser } from "./helpers";

afterAll(() => closeDb());

const withAbete = (price: number) => {
  const d = structuredClone(DEFAULT_PRICE_LIST_DATA) as { timber: { pricePerM3: Record<string, Record<string, number>> } };
  d.timber.pricePerM3.abete!.lamellare = price;
  return d;
};

describe("registro delle modifiche (6.4)", () => {
  let mario: { id: string };
  let lucia: { id: string };

  beforeEach(async () => {
    await freshDb();
    mario = await makeUser("mario@lovato.it", "commerciale", "Mario Rossi");
    lucia = await makeUser("lucia@lovato.it", "ufficio-tecnico");
    await createVersion({ dataset: "listino", data: DEFAULT_PRICE_LIST_DATA, status: "attiva", effectiveFrom: "2026-01-01", version: 1 });
  });

  it("650 → 680 €/m³ produce una voce con percorso, valori e utente", async () => {
    const draft = await openDraft("listino", mario.id);
    await saveDraft("listino", withAbete(68_000), draft.updatedAt, mario.id);
    const [last] = await audit.list({ dataset: "listino", limit: 1 });
    expect(last).toMatchObject({
      userId: mario.id,
      dataset: "listino",
      entity: "dataset_version",
      entityId: draft.id,
      action: "salva",
      diff: [{ path: "timber.pricePerM3.abete.lamellare", before: 65_000, after: 68_000 }],
    });
    expect(last!.at).toBeInstanceOf(Date);
  });

  it("creazione, pubblicazione e archiviazione sono registrate", async () => {
    const draft = await openDraft("listino", mario.id);
    await saveDraft("listino", withAbete(68_000), draft.updatedAt, mario.id);
    await publishDraft("listino", lucia.id);
    const entries = await audit.list({ dataset: "listino" });
    expect(entries.map((e) => e.action)).toEqual(["archivia", "pubblica", "salva", "crea", "crea"]);
    const pub = entries.find((e) => e.action === "pubblica")!;
    expect(pub).toMatchObject({ userId: lucia.id, diff: [{ path: "timber.pricePerM3.abete.lamellare", before: 65_000, after: 68_000 }] });
    expect((await audit.list({ userId: mario.id })).map((e) => e.action)).toEqual(["salva", "crea"]);
  });

  it("un salvataggio rifiutato non lascia voci", async () => {
    const draft = await openDraft("listino", mario.id);
    const before = (await audit.list()).length;
    await expect(saveDraft("listino", withAbete(-1), draft.updatedAt, mario.id)).rejects.toThrow();
    await expect(saveDraft("listino", withAbete(1), new Date(0), mario.id)).rejects.toThrow();
    expect((await audit.list()).length).toBe(before);
  });

  it("withAudit registra la differenza solo se l'operazione riesce", async () => {
    const db = await getDb();
    const run = audit.withAudit("cambia-stato", { userId: mario.id, entity: "lead", entityId: "L1" });
    await db.transaction((tx) => run(tx, async () => ({ result: 1, before: { status: "nuovo" }, after: { status: "in-lavorazione" } })));
    await expect(
      db.transaction((tx) =>
        run(tx, async () => {
          throw new Error("fallita");
        }),
      ),
    ).rejects.toThrow("fallita");
    const entries = await audit.list({ entity: "lead" });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.diff).toEqual([{ path: "status", before: "nuovo", after: "in-lavorazione" }]);
  });

  it("il registro non espone funzioni di modifica", () => {
    expect(Object.keys(audit).sort()).toEqual(["list", "record", "withAudit"]);
  });
});
