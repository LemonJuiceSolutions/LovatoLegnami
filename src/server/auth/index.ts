import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "./auth";
import { can, isRole, reservedTo, type Permission, type Role } from "./permissions";
import { signInUrl } from "./route-guard";

/**
 * Punto unico di autenticazione per pagine, server action e route (P6): il resto
 * dell'applicazione importa solo da qui (e da `permissions.ts`), così Auth.js è
 * sostituibile toccando `auth.ts`/`auth.config.ts`.
 *
 * Il middleware reindirizza soltanto; il controllo vincolante è `requireUser`, che a
 * ogni chiamata **rilegge** l'utente dal database: un utente disattivato (o a cui è
 * cambiato il ruolo) perde subito l'accesso anche con un JWT ancora valido.
 */

export { can, reservedTo, ROLES, ROLE_LABELS, PERMISSIONS, type Permission, type Role } from "./permissions";
export { safeNextPath, signInUrl } from "./route-guard";

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: Role;
}

/** Nessuna sessione valida (o utente disattivato): 401. */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "accesso richiesto") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Utente autenticato senza il permesso: 403 con il ruolo richiesto nel messaggio. */
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(
    readonly permission: Permission,
    message: string = reservedTo(permission),
  ) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export interface SessionInfo {
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: Role | null;
}

/** Sessione corrente dal cookie (senza rileggere il database); `null` se anonimo. */
export async function getSession(): Promise<SessionInfo | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  return { userId: u.id, email: u.email, name: u.name ?? null, role: isRole(u.role) ? u.role : null };
}

/**
 * Utente della richiesta, riletto dal database. Senza sessione, utente inesistente o
 * disattivato ⇒ `UnauthorizedError`; senza `permission` ⇒ `ForbiddenError`
 * ("operazione riservata a …").
 */
export async function requireUser(permission?: Permission): Promise<AuthUser> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  const db = await getDb();
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!row || !row.active || !isRole(row.role)) throw new UnauthorizedError("utente non abilitato: accedi di nuovo");
  if (permission && !can(row, permission)) throw new ForbiddenError(permission);
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

/**
 * Utente valido della richiesta o `null`: come `requireUser()` ma senza lanciare. Un
 * cookie di sessione che punta a un utente inesistente, disattivato o senza ruolo valido
 * (es. JWT di un altro database locale con lo stesso segreto) vale come **anonimo**: chi
 * decide se mostrare il login (pagina `/accesso`) deve usare questa e non `getSession()`,
 * altrimenti `/accesso` ⇄ area interna diventano un ciclo di redirect.
 */
export async function currentUser(): Promise<AuthUser | null> {
  try {
    return await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return null;
    throw e;
  }
}

export const isAuthError = (e: unknown): e is UnauthorizedError | ForbiddenError => e instanceof UnauthorizedError || e instanceof ForbiddenError;

/**
 * Per i route handler: errore di autenticazione ⇒ `Response` 401/403 JSON senza dati
 * (solo il messaggio); altrimenti `null` (l'errore va gestito altrove).
 */
export function handleAuthError(e: unknown): Response | null {
  if (!isAuthError(e)) return null;
  return Response.json({ error: e.message }, { status: e.status, headers: { "cache-control": "no-store" } });
}

/** Avvolge un route handler: `requireUser(permission)` prima, errori di accesso tradotti in 401/403. */
export function withUser<A extends unknown[]>(
  permission: Permission | undefined,
  handler: (user: AuthUser, ...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      const user = await requireUser(permission);
      return await handler(user, ...args);
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
  };
}

/**
 * Per le pagine server: anonimo o disattivato ⇒ redirect a `/accesso?next=…`; senza
 * permesso ⇒ 404 (la pagina "non è accessibile", senza rivelarne il contenuto).
 */
export async function requirePageUser(permission: Permission | undefined, nextPath: string): Promise<AuthUser> {
  try {
    return await requireUser(permission);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect(signInUrl(nextPath));
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
}

/** Per route handler esistenti: `null` se l'utente può procedere, altrimenti la risposta 401/403. */
export async function denyUnlessAllowed(permission?: Permission): Promise<Response | null> {
  try {
    await requireUser(permission);
    return null;
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }
}
