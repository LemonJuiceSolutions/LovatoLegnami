import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customerTokens } from "@/db/schema";

/**
 * Token del cliente (link `/p/<token>` e PDF): 32 byte casuali in base64url (256 bit,
 * non indovinabili), scadenza di default 90 giorni. Un token scaduto o sconosciuto
 * risolve a `null` senza distinguere i due casi.
 */

export const CUSTOMER_TOKEN_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function issueCustomerToken(leadId: string, days: number = CUSTOMER_TOKEN_DAYS, now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + days * DAY_MS);
  await db.insert(customerTokens).values({ token, leadId, expiresAt, createdAt: now });
  return { token, expiresAt };
}

/** Richiesta del token, se valido alla data (default adesso). */
export async function resolveToken(token: string, now: Date = new Date()): Promise<{ leadId: string; expiresAt: Date } | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ leadId: customerTokens.leadId, expiresAt: customerTokens.expiresAt })
    .from(customerTokens)
    .where(and(eq(customerTokens.token, token), gt(customerTokens.expiresAt, now)))
    .limit(1);
  return row ?? null;
}

/**
 * Stato del token per le risposte HTTP: `scaduto` (410, "contatta l'ufficio") si distingue
 * da `sconosciuto` (404). Con 256 bit casuali sapere che un token è esistito non aiuta a
 * indovinarne altri; la richiesta resta comunque inaccessibile.
 */
export async function tokenState(token: string, now: Date = new Date()): Promise<{ state: "valido"; leadId: string; expiresAt: Date } | { state: "scaduto" | "sconosciuto" }> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { state: "sconosciuto" };
  const db = await getDb();
  const [row] = await db.select({ leadId: customerTokens.leadId, expiresAt: customerTokens.expiresAt }).from(customerTokens).where(eq(customerTokens.token, token)).limit(1);
  if (!row) return { state: "sconosciuto" };
  if (row.expiresAt.getTime() <= now.getTime()) return { state: "scaduto" };
  return { state: "valido", leadId: row.leadId, expiresAt: row.expiresAt };
}
