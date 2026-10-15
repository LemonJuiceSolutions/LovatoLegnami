import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { closeDb, getDb } from "../client";
import { datasetVersions, users } from "../schema";
import { truncateAll } from "../testing";
import { seedDatabase } from "../seed";
import { listTypologies } from "@/domain/typologies/registry";
import { PRESET_CATALOG } from "@/domain/presets/catalog";
import { getActive } from "@/server/repositories/datasets";
import * as audit from "@/server/repositories/audit";

afterAll(() => closeDb());

describe("seed (6.6)", () => {
  beforeAll(async () => truncateAll(await getDb()));

  it("crea le versioni attive, una riga per tipologia e l'admin", async () => {
    const report = await seedDatabase({ adminEmail: "Admin@Lovato.it" });
    expect(report).toEqual({ created: ["listino", "regole", "tipologie", "preset"], skipped: [], admin: "creato" });
    for (const d of ["listino", "regole", "tipologie", "preset"] as const) expect((await getActive(d))?.version).toBe(1);
    const tip = (await getActive("tipologie"))!.data;
    expect(tip.map((t) => t.slug)).toEqual(listTypologies().map((t) => t.slug));
    expect(tip.filter((t) => t.visible).map((t) => t.slug)).toEqual(["addossata-monofalda", "autoportante-bifalda"]);
    expect((await getActive("preset"))!.data).toHaveLength(PRESET_CATALOG.length);
    const db = await getDb();
    const [admin] = await db.select().from(users).where(eq(users.email, "admin@lovato.it"));
    expect(admin).toMatchObject({ role: "admin", active: true });
    expect((await audit.list({ dataset: "listino" })).map((e) => [e.action, e.userId])).toEqual([["crea", admin!.id]]);
  });

  it("un secondo seed non crea duplicati", async () => {
    const report = await seedDatabase({ adminEmail: "admin@lovato.it" });
    expect(report).toEqual({ created: [], skipped: ["listino", "regole", "tipologie", "preset"], admin: "esistente" });
    const db = await getDb();
    expect((await db.select({ n: count() }).from(datasetVersions))[0]!.n).toBe(4);
    expect((await db.select({ n: count() }).from(users))[0]!.n).toBe(1);
  });
});
