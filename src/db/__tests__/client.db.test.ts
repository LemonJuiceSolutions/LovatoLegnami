import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/server/env";

const pgliteCtor = vi.fn();
const poolCtor = vi.fn();

afterEach(async () => {
  vi.resetModules();
  vi.doUnmock("@electric-sql/pglite");
  vi.doUnmock("pg");
  delete process.env.DATABASE_URL;
  resetEnvCache();
  pgliteCtor.mockReset();
  poolCtor.mockReset();
});

describe("getDb (6.2)", () => {
  it("senza variabili usa PGlite in memoria, migrato, ed è un singleton", async () => {
    delete process.env.DATABASE_URL;
    resetEnvCache();
    const { getDb, getDbHandle, closeDb } = await import("../client");
    const { users } = await import("../schema");
    const handle = await getDbHandle();
    expect(handle.driver).toBe("pglite-memory");
    const db = await getDb();
    expect(db).toBe(await getDb());
    await db.insert(users).values({ email: "a@b.it", role: "admin" });
    expect(await db.select().from(users)).toHaveLength(1);
    await closeDb();
  });

  it("con DATABASE_URL usa pg e non apre PGlite", async () => {
    vi.doMock("@electric-sql/pglite", () => ({
      PGlite: class {
        constructor(...args: unknown[]) {
          pgliteCtor(...args);
        }
      },
    }));
    vi.doMock("pg", () => {
      class Pool {
        constructor(config: unknown) {
          poolCtor(config);
        }
        end = vi.fn(async () => undefined);
        connect = vi.fn();
        query = vi.fn();
        on = vi.fn();
      }
      return { Pool, default: { Pool } };
    });
    process.env.DATABASE_URL = "postgres://utente:segreto@db.invalid:5432/lovato";
    resetEnvCache();
    const { getDbHandle, closeDb } = await import("../client");
    const handle = await getDbHandle();
    expect(handle.driver).toBe("postgres");
    expect(poolCtor).toHaveBeenCalledWith(expect.objectContaining({ connectionString: process.env.DATABASE_URL }));
    expect(pgliteCtor).not.toHaveBeenCalled();
    await closeDb();
  });

  it("un'apertura fallita non resta in cache", async () => {
    vi.doMock("pg", () => {
      class Pool {
        constructor() {
          throw new Error("rete non raggiungibile");
        }
      }
      return { Pool, default: { Pool } };
    });
    process.env.DATABASE_URL = "postgres://x@db.invalid/lovato";
    resetEnvCache();
    const { getDbHandle } = await import("../client");
    await expect(getDbHandle()).rejects.toThrow("rete non raggiungibile");
    await expect(getDbHandle()).rejects.toThrow("rete non raggiungibile");
  });
});
