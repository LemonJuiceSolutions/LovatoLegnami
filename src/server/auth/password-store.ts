import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { users } from "@/db/schema";
import { record } from "@/server/repositories/audit";
import { RepositoryError } from "@/server/repositories/errors";
import { generatePassword, hashPassword, passwordPolicyError, verifyPassword } from "./password";

/**
 * Impostazione e cambio della password (accesso con email e password). Riceve il database
 * come parametro: lo usano le server action, la CLI `npm run admin:set-password` e i test.
 * Nessun import da `auth.ts` (la CLI non deve trascinare `next-auth`).
 *
 * Il registro delle modifiche annota l'evento, mai la password né l'hash.
 */

/** Errore mostrabile all'utente (le server action lo traducono in 400). */
export class PasswordError extends RepositoryError {
  constructor(message: string) {
    super("non-valido", message);
    this.name = "PasswordError";
  }
}

/** = `normalizeEmail` di `auth.ts`. */
const normalizeEmail = (email: string): string => email.normalize("NFKC").trim().toLowerCase();

export interface SetPasswordResult {
  readonly userId: string;
  readonly email: string;
  /** Presente solo se generata qui: va mostrata una volta e non salvata altrove. */
  readonly generated?: string;
}

type Origin = "cli" | "admin";

async function store(db: DbOrTx, user: { id: string; email: string }, password: string, actorId: string | null, action: "imposta-password" | "cambia-password", origin?: Origin) {
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: hash, passwordChangedAt: new Date() }).where(eq(users.id, user.id));
    await record({ userId: actorId, entity: "user", entityId: user.id, action, diff: [{ path: "password", after: origin ? `impostata (${origin})` : "cambiata" }] }, tx);
  });
}

function checkOrGenerate(password: string | undefined): { password: string; generated?: string } {
  if (password === undefined || password === "") {
    const generated = generatePassword();
    return { password: generated, generated };
  }
  const err = passwordPolicyError(password);
  if (err) throw new PasswordError(err);
  return { password };
}

/**
 * Imposta la password di un utente **esistente** (CLI dell'operatore). Senza `password` ne
 * genera una casuale e la restituisce in `generated`. Funziona anche per utenti disattivati
 * (la password non basta per entrare: l'accesso controlla anche `active`).
 */
export async function setPasswordByEmail(db: DbOrTx, email: string, password?: string, actorId: string | null = null): Promise<SetPasswordResult & { active: boolean }> {
  const normalized = normalizeEmail(email);
  const [user] = await db.select({ id: users.id, email: users.email, active: users.active }).from(users).where(eq(users.email, normalized)).limit(1);
  if (!user) throw new PasswordError(`nessun utente con email ${normalized}: crealo con il seed (ADMIN_EMAIL) o dal back-office`);
  const p = checkOrGenerate(password);
  await store(db, user, p.password, actorId, "imposta-password", "cli");
  return { userId: user.id, email: user.email, active: user.active, generated: p.generated };
}

/** Reimpostazione da parte dell'amministratore (`/admin/utenti`): sempre una password generata. */
export async function resetPasswordById(db: DbOrTx, userId: string, actorId: string): Promise<Required<SetPasswordResult>> {
  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new PasswordError("utente non trovato");
  const generated = generatePassword();
  await store(db, user, generated, actorId, "imposta-password", "admin");
  return { userId: user.id, email: user.email, generated };
}

/**
 * Cambio della propria password: serve quella attuale, se già impostata (chi non l'ha
 * ancora, entrato con il collegamento via email, può impostarla direttamente).
 */
export async function changeOwnPassword(db: DbOrTx, userId: string, current: string, next: string): Promise<void> {
  const [user] = await db.select({ id: users.id, email: users.email, passwordHash: users.passwordHash, active: users.active }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.active) throw new PasswordError("utente non abilitato: accedi di nuovo");
  if (user.passwordHash && !(await verifyPassword(current, user.passwordHash))) throw new PasswordError("La password attuale non è corretta.");
  const err = passwordPolicyError(next);
  if (err) throw new PasswordError(err);
  if (user.passwordHash && current === next) throw new PasswordError("La nuova password deve essere diversa da quella attuale.");
  await store(db, user, next, user.id, "cambia-password");
}

/** `true` se l'utente ha già una password (per il testo del modulo di cambio). */
export async function hasPassword(db: DbOrTx, userId: string): Promise<boolean> {
  const [row] = await db.select({ h: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(row?.h);
}
