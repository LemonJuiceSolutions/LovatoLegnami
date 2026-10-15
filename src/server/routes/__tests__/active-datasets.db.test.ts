import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { seedDatabase } from "@/db/seed";
import { DEFAULT_LOVATO_DATA } from "@/domain";
import { freshDb, makeUser } from "@/server/repositories/__tests__/helpers";
import { createVersion } from "@/server/repositories/datasets";
import { catalogFromResponse } from "@/stores/catalog";

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/server/auth/auth", () => ({ auth: async () => session.current }));

const { activeDatasets, handleActiveDatasetsGet } = await import("../active-datasets");

afterAll(() => closeDb());

describe("GET /api/admin/dataset/attivi (10.1)", () => {
  beforeEach(async () => {
    await freshDb();
    session.current = null;
  });

  it("anonimo ⇒ 401, utente interno ⇒ listino e regole attivi", async () => {
    await seedDatabase();
    expect((await handleActiveDatasetsGet()).status).toBe(401);
    const u = await makeUser("ufficio@lovato.it", "ufficio-tecnico");
    session.current = { user: { id: u.id, email: u.email, role: u.role, active: true } };
    const res = await handleActiveDatasetsGet();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const body = await res.json();
    expect(body.listino).toMatchObject({ version: 1, effectiveFrom: "2026-01-01" });
    expect(body.regole).toMatchObject({ version: 1 });
    const catalog = catalogFromResponse(body);
    expect(catalog).toMatchObject({ source: "archivio", error: null, priceListVersion: { version: 1, id: body.listino.id } });
  });

  it("senza versioni attive ⇒ null per entrambi (il client usa i default)", async () => {
    expect(await activeDatasets()).toEqual({ listino: null, regole: null });
  });

  it("regole con interasse 700 pubblicate ⇒ restituite", async () => {
    const data = structuredClone(DEFAULT_LOVATO_DATA) as { rules: { id: string; max?: number }[] };
    data.rules.find((r) => r.id === "interasse-travetti-max")!.max = 700;
    await createVersion({ dataset: "regole", version: 2, status: "attiva", effectiveFrom: "2026-06-01", data, userId: null });
    const { regole } = await activeDatasets("2026-07-01");
    expect(regole?.version).toBe(2);
    expect((regole?.data as typeof data).rules.find((r) => r.id === "interasse-travetti-max")?.max).toBe(700);
  });
});
