import { sql } from "drizzle-orm";
import type { DbOrTx } from "./client";

/**
 * Solo test `db`: svuota tutte le tabelle applicative (le migrazioni restano applicate),
 * più rapido che riaprire e migrare un PGlite per ogni test.
 */
export async function truncateAll(db: DbOrTx): Promise<void> {
  await db.execute(
    sql.raw(
      "truncate table audit_log, lead_events, customer_tokens, email_outbox, quotes, leads, lead_counters, dataset_versions, sessions, accounts, verification_tokens, users restart identity cascade",
    ),
  );
}
