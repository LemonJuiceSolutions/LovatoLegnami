import { and, asc, eq, ne } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { sessions, users, ROLE_VALUES, type RoleValue, type User } from "@/db/schema";
import { record } from "./audit";
import { ConflictError, NotFoundError } from "./errors";

/**
 * Utenti interni (spec `autenticazione-ruoli`): solo l'admin li crea (l'accesso via
 * email è riservato a chi è in questa tabella). Vincolo: deve restare almeno un
 * amministratore attivo, quindi l'ultimo non può essere disattivato né degradato.
 */

export type UserSummary = Pick<User, "id" | "email" | "name" | "role" | "active" | "createdAt">;

const columns = { id: users.id, email: users.email, name: users.name, role: users.role, active: users.active, createdAt: users.createdAt };

const LAST_ADMIN = "deve restare almeno un amministratore attivo: l'ultimo non può essere disattivato né cambiare ruolo";

export async function list(): Promise<UserSummary[]> {
  const db = await getDb();
  return db.select(columns).from(users).orderBy(asc(users.email));
}

async function getRow(id: string, db: DbOrTx, lock = false): Promise<UserSummary> {
  const q = db.select(columns).from(users).where(eq(users.id, id)).limit(1);
  const [row] = lock ? await q.for("update") : await q;
  if (!row) throw new NotFoundError(`utente ${id} non trovato`);
  return row;
}

export async function get(id: string): Promise<UserSummary> {
  return getRow(id, await getDb());
}

const assertRole = (role: string): RoleValue => {
  if (!(ROLE_VALUES as readonly string[]).includes(role)) throw new ConflictError(`ruolo sconosciuto: ${role}`);
  return role as RoleValue;
};

export async function create(email: string, name: string | null, role: RoleValue, actorId: string | null): Promise<UserSummary> {
  const db = await getDb();
  const normalized = email.normalize("NFKC").trim().toLowerCase();
  assertRole(role);
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(users)
      .values({ email: normalized, name: name?.trim() || null, role, active: true })
      .onConflictDoNothing({ target: users.email })
      .returning(columns);
    if (!inserted[0]) throw new ConflictError(`esiste già un utente con l'email ${normalized}`);
    await record({ userId: actorId, entity: "user", entityId: inserted[0].id, action: "crea-utente", diff: [{ path: "", after: { email: normalized, role } }] }, tx);
    return inserted[0];
  });
}

/** Altri amministratori attivi oltre a `exceptId`, con lock (due richieste concorrenti non possono togliere entrambi). */
async function otherActiveAdmins(tx: DbOrTx, exceptId: string): Promise<number> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, exceptId)))
    .for("update");
  return rows.length;
}

export async function setActive(id: string, active: boolean, actorId: string | null): Promise<UserSummary> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const user = await getRow(id, tx, true);
    if (user.active === active) return user;
    if (!active && user.role === "admin" && (await otherActiveAdmins(tx, id)) === 0) throw new ConflictError(LAST_ADMIN);
    const [row] = await tx.update(users).set({ active }).where(eq(users.id, id)).returning(columns);
    // Eventuali sessioni a database (non usate con JWT) vanno comunque chiuse.
    if (!active) await tx.delete(sessions).where(eq(sessions.userId, id));
    await record({ userId: actorId, entity: "user", entityId: id, action: active ? "attiva-utente" : "disattiva-utente", diff: [{ path: "active", before: user.active, after: active }] }, tx);
    return row!;
  });
}

export async function setRole(id: string, role: RoleValue, actorId: string | null): Promise<UserSummary> {
  assertRole(role);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const user = await getRow(id, tx, true);
    if (user.role === role) return user;
    if (user.role === "admin" && user.active && (await otherActiveAdmins(tx, id)) === 0) throw new ConflictError(LAST_ADMIN);
    const [row] = await tx.update(users).set({ role }).where(eq(users.id, id)).returning(columns);
    await record({ userId: actorId, entity: "user", entityId: id, action: "cambia-ruolo", diff: [{ path: "role", before: user.role, after: role }] }, tx);
    return row!;
  });
}
