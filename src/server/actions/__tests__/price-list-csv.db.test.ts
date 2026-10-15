import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { exportTable } from "@/domain/pricing/csv";
import { DEFAULT_PRICE_LIST, DEFAULT_PRICE_LIST_DATA } from "@/domain/pricing/data/default-listino";
import { freshDb, makeUser } from "@/server/repositories/__tests__/helpers";

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/server/auth/auth", () => ({ auth: async () => session.current }));

const { importPriceListCsv } = await import("../price-list-csv");
const repo = await import("@/server/repositories/datasets");
const audit = await import("@/server/repositories/audit");

afterAll(() => closeDb());
const as = (u: { id: string }) => {
  session.current = { user: { id: u.id, email: "x" } };
};

describe("importPriceListCsv (9.5)", () => {
  let mario: { id: string };

  beforeEach(async () => {
    await freshDb();
    mario = await makeUser("mario@lovato.it", "commerciale", "Mario Rossi");
    await repo.createVersion({ dataset: "listino", data: DEFAULT_PRICE_LIST_DATA, status: "attiva", effectiveFrom: "2026-01-01", version: 1 });
    as(mario);
  });

  it("CSV valido ⇒ bozza aggiornata e voce di registro 'importa'", async () => {
    const lines = exportTable(DEFAULT_PRICE_LIST, "legno").split("\r\n");
    const [species, quality] = lines[1]!.split(";");
    lines[1] = `${species};${quality};999,00`;
    const res = await importPriceListCsv({ table: "legno", csv: lines.join("\r\n"), expectedUpdatedAt: null });
    expect(res.ok).toBe(true);
    const draft = await repo.getDraft("listino");
    const ids = (s: string) => DEFAULT_PRICE_LIST.timber.species.find((x) => x.label === s || x.id === s)?.id ?? s;
    const qid = DEFAULT_PRICE_LIST.timber.qualities.find((x) => x.label === quality || x.id === quality)?.id ?? quality!;
    expect(draft!.data.timber.pricePerM3[ids(species!)]![qid]).toBe(99_900);
    const [entry] = await audit.list({ dataset: "listino" });
    expect(entry).toMatchObject({ action: "importa", userId: mario.id });
    expect(entry!.diff).toHaveLength(1);
  });

  it("righe errate, file troppo grande e tabella dell'ufficio tecnico ⇒ rifiuti", async () => {
    const lines = exportTable(DEFAULT_PRICE_LIST, "legno").split("\r\n");
    lines[2] = lines[2]!.replace(/;[^;]*$/, ";12a");
    const bad = await importPriceListCsv({ table: "legno", csv: lines.join("\r\n"), expectedUpdatedAt: null });
    expect(bad).toMatchObject({ ok: false, status: 400 });
    expect(!bad.ok && bad.message).toMatch(/riga 3: prezzo non numerico/);
    const huge = await importPriceListCsv({ table: "legno", csv: "x".repeat(300 * 1024), expectedUpdatedAt: null });
    expect(huge).toMatchObject({ ok: false, status: 400 });
    expect(!huge.ok && huge.message).toMatch(/file troppo grande/);
    const lengths = exportTable(DEFAULT_PRICE_LIST, "lunghezze").split("\r\n").slice(0, -2).join("\r\n");
    expect(await importPriceListCsv({ table: "lunghezze", csv: lengths, expectedUpdatedAt: null })).toEqual({ ok: false, status: 403, message: "operazione riservata all'ufficio tecnico" });
    expect(await repo.getDraft("listino")).toBeNull();
  });
});
