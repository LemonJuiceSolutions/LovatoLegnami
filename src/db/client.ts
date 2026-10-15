import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getEnv } from "@/server/env";
import * as schema from "./schema";

/**
 * Connessione al database (P5), un'istanza per processo.
 *
 * - `DATABASE_URL` presente ⇒ Postgres con `pg` (pool); le migrazioni le applica
 *   `npm run db:migrate` in build (P12), mai l'applicazione.
 * - Assente ⇒ PGlite in-process: in memoria nei test (vitest), su `.data/pglite/` in
 *   sviluppo. PGlite applica le migrazioni all'apertura (stesse di produzione), così
 *   `npm run dev` funziona senza passi manuali.
 *
 * I driver sono importati solo quando servono: con `DATABASE_URL` PGlite non viene
 * nemmeno caricato, e viceversa.
 */

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
/** Database o transazione aperta: le funzioni dei repository accettano entrambi. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export type DbDriver = "postgres" | "pglite-memory" | "pglite-file";

export interface DbHandle {
  readonly db: Db;
  readonly driver: DbDriver;
  close(): Promise<void>;
}

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");
export const PGLITE_DIR = path.join(process.cwd(), ".data", "pglite");

const isTestRun = () => process.env.VITEST !== undefined || process.env.NODE_ENV === "test";

export interface OpenOptions {
  /** URL Postgres; assente ⇒ PGlite. */
  readonly databaseUrl?: string;
  /** Cartella di PGlite; `"memory"` = in memoria. Default: in memoria nei test, `.data/pglite/` altrimenti. */
  readonly pglite?: string | "memory";
}

/** Apre una connessione (senza singleton). PGlite viene migrato all'apertura. */
export async function openDb(options: OpenOptions = {}): Promise<DbHandle> {
  if (options.databaseUrl) {
    const [{ Pool }, { drizzle }] = await Promise.all([import("pg"), import("drizzle-orm/node-postgres")]);
    const pool = new Pool({ connectionString: options.databaseUrl, max: 5 });
    const db = drizzle(pool, { schema }) as unknown as Db;
    return { db, driver: "postgres", close: () => pool.end() };
  }
  const target = options.pglite ?? (isTestRun() ? "memory" : PGLITE_DIR);
  const [{ PGlite }, { drizzle }] = await Promise.all([import("@electric-sql/pglite"), import("drizzle-orm/pglite")]);
  if (target !== "memory") {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(target, { recursive: true });
  }
  const client = target === "memory" ? new PGlite() : new PGlite(target);
  const db = drizzle(client, { schema }) as unknown as Db;
  const handle: DbHandle = { db, driver: target === "memory" ? "pglite-memory" : "pglite-file", close: () => client.close() };
  await migrate(handle);
  return handle;
}

/** Applica le migrazioni di `drizzle/` (idempotente: quelle già applicate sono saltate). */
export async function migrate(handle: DbHandle): Promise<void> {
  if (handle.driver === "postgres") {
    const { migrate: run } = await import("drizzle-orm/node-postgres/migrator");
    await run(handle.db as never, { migrationsFolder: MIGRATIONS_FOLDER });
  } else {
    const { migrate: run } = await import("drizzle-orm/pglite/migrator");
    await run(handle.db as never, { migrationsFolder: MIGRATIONS_FOLDER });
  }
}

let current: Promise<DbHandle> | undefined;

/** Connessione del processo (aperta alla prima chiamata, secondo `getEnv()`). */
export function getDbHandle(): Promise<DbHandle> {
  if (!current) {
    const opening = openDb({ databaseUrl: getEnv().databaseUrl });
    // Un'apertura fallita non resta in cache: la chiamata successiva riprova.
    opening.catch(() => {
      if (current === opening) current = undefined;
    });
    current = opening;
  }
  return current;
}

export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}

/** Chiude e dimentica la connessione del processo (test e script). */
export async function closeDb(): Promise<void> {
  const handle = current;
  current = undefined;
  if (handle) await (await handle).close();
}
