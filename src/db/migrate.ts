/**
 * `npm run db:migrate`: applica le migrazioni di `drizzle/` al database scelto da
 * `getEnv()` (Postgres con `DATABASE_URL`, altrimenti PGlite su `.data/pglite/`).
 * Idempotente; in build su Vercel precede `next build` (P12).
 */
import { getEnv } from "@/server/env";
import { getDbHandle, closeDb, migrate } from "./client";

async function main() {
  const handle = await getDbHandle();
  await migrate(handle);
  const where = handle.driver === "postgres" ? "Postgres (DATABASE_URL)" : handle.driver;
  console.log(`[db:migrate] migrazioni applicate su ${where}`);
  for (const w of getEnv().warnings) console.warn(`[db:migrate] avviso: ${w}`);
  await closeDb();
}

main().catch((e) => {
  console.error("[db:migrate] errore:", e instanceof Error ? e.message : e);
  process.exit(1);
});
