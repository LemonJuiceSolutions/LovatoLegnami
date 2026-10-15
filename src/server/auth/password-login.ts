import { CredentialsSignin } from "next-auth";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import { createRateLimiter, type RateLimiter } from "@/server/rate-limit";
import type { RateLimitSetting } from "@/server/env";
import { PASSWORD_MAX_LENGTH, verifyPassword } from "./password";

/**
 * Accesso con email e password (provider Auth.js `password`, tipo credentials). Entra solo
 * un utente esistente, attivo e con una password impostata; ogni altro caso dà lo stesso
 * errore (`CredentialsSignin`, "Email o password non corretti"). Anche senza utente si
 * calcola uno scrypt (`verifyPassword` con hash fittizio): il tempo non rivela chi esiste.
 *
 * Limite dei tentativi in memoria (come gli altri limiti, `rate-limit.ts`): 5 ogni 10
 * minuti per indirizzo email e 20 ogni 10 minuti per IP (un ufficio dietro lo stesso IP
 * non si blocca per l'errore di una persona). Contano tutti i tentativi, riusciti o no.
 */

export const PASSWORD_PROVIDER_ID = "password";
export const LOGIN_ERROR_MESSAGE = "Email o password non corretti.";
export const LOGIN_RATE_MESSAGE = "Troppi tentativi di accesso: riprova tra qualche minuto.";

export const LOGIN_LIMIT_PER_EMAIL: RateLimitSetting = { limit: 5, windowMs: 10 * 60_000 };
export const LOGIN_LIMIT_PER_IP: RateLimitSetting = { limit: 20, windowMs: 10 * 60_000 };

/** Errore di Auth.js per credenziali non valide (codice generico nell'URL). */
export class InvalidCredentials extends CredentialsSignin {
  code = "credenziali";
}
/** Troppi tentativi: non rivela nulla sull'utente (vale per qualsiasi indirizzo). */
export class TooManyAttempts extends CredentialsSignin {
  code = "tentativi";
}

const loginLimiter = createRateLimiter();

/** Solo test: azzera il limite dei tentativi. */
export function resetLoginRateLimit(): void {
  loginLimiter.reset();
}

/** = `normalizeEmail` di `auth.ts`. */
const normalizeEmail = (email: string): string => email.normalize("NFKC").trim().toLowerCase();

/** IP del client dalle intestazioni del proxy (Caddy imposta `X-Forwarded-For`). */
export function clientIp(headers: Headers): string {
  return (headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "sconosciuto").slice(0, 64);
}

export interface PasswordUser {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: string;
  readonly active: true;
}

export async function authorizeWithPassword(
  db: Db,
  input: { email: unknown; password: unknown; ip: string },
  limiter: RateLimiter = loginLimiter,
): Promise<PasswordUser> {
  const email = typeof input.email === "string" ? normalizeEmail(input.email).slice(0, 254) : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!limiter.check(`login-ip:${input.ip}`, LOGIN_LIMIT_PER_IP).allowed) throw new TooManyAttempts();
  if (email && !limiter.check(`login-email:${email}`, LOGIN_LIMIT_PER_EMAIL).allowed) throw new TooManyAttempts();

  const [row] =
    email && password && password.length <= PASSWORD_MAX_LENGTH
      ? await db
          .select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active, passwordHash: users.passwordHash })
          .from(users)
          .where(eq(users.email, email))
          .limit(1)
      : [];
  const ok = await verifyPassword(password, row?.passwordHash ?? null);
  if (!row || !ok || !row.active) throw new InvalidCredentials();
  return { id: row.id, email: row.email, name: row.name, role: row.role, active: true };
}
