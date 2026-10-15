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
