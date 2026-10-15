import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";

const MIGRATIONS = path.join(process.cwd(), "drizzle");

const EXPECTED_TABLES = [
  "accounts",
  "audit_log",
  "customer_tokens",
  "dataset_versions",
  "email_outbox",
  "lead_counters",
  "lead_events",
  "leads",
  "quotes",
  "sessions",
  "users",
  "verification_tokens",
];

describe("schema e migrazioni (6.1)", () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS });
  });
  afterAll(() => client.close());

  const tables = async () =>
    (await client.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' order by table_name")).rows.map(
      (r) => r.table_name,
    );

  it("le migrazioni su un database vuoto creano tutte le tabelle", async () => {
    expect(await tables()).toEqual(EXPECTED_TABLES);
  });

  it("una seconda esecuzione non cambia nulla", async () => {
    const applied = async () => (await client.query("select hash, created_at from drizzle.__drizzle_migrations order by id")).rows;
    const before = { tables: await tables(), applied: await applied() };
    await migrate(db, { migrationsFolder: MIGRATIONS });
    expect({ tables: await tables(), applied: await applied() }).toEqual(before);
  });

  it("due bozze dello stesso insieme di dati violano il vincolo", async () => {
    const draft = (version: number, dataset: schema.Dataset = "listino") => ({
      dataset,
      version,
      status: "bozza" as const,
      effectiveFrom: "2026-01-01",
      data: {},
    });
    await db.insert(schema.datasetVersions).values(draft(1));
    await expect(db.insert(schema.datasetVersions).values(draft(2))).rejects.toThrow();
    // Bozze di insiemi diversi convivono; la stessa versione due volte no.
    await db.insert(schema.datasetVersions).values(draft(1, "regole"));
    await expect(
      db.insert(schema.datasetVersions).values({ ...draft(1), status: "archiviata" }),
    ).rejects.toThrow();
  });

  it("i valori fuori elenco sono rifiutati dai vincoli check", async () => {
    await expect(db.insert(schema.users).values({ email: "x@y.it", role: "ospite" as schema.RoleValue })).rejects.toThrow();
    await expect(
      db.insert(schema.datasetVersions).values({ dataset: "listino", version: 9, status: "pubblicata" as schema.DatasetStatus, effectiveFrom: "2026-01-01", data: {} }),
    ).rejects.toThrow();
  });
});
