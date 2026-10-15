import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { truncateAll } from "@/db/testing";
import { users } from "@/db/schema";

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("../auth", () => ({ auth: async () => session.current }));

const { ForbiddenError, UnauthorizedError, handleAuthError, requireUser, withUser } = await import("../index");

afterAll(() => closeDb());

const loginAs = (u: { id: string; email: string; role: string }) => {
  // Il JWT conserva il ruolo dell'accesso: requireUser deve usare quello del database.
  session.current = { user: { id: u.id, email: u.email, role: "admin", active: true } };
};

describe("requireUser (7.3)", () => {
  let mario: { id: string; email: string; role: string };

  beforeEach(async () => {
    const db = await getDb();
    await truncateAll(db);
    [mario] = (await db.insert(users).values({ email: "mario@lovato.it", role: "commerciale", name: "Mario" }).returning()) as unknown as [typeof mario];
    session.current = null;
  });

  it("anonimo ⇒ 401", async () => {
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("utente attivo ⇒ utente riletto dal database", async () => {
    loginAs(mario);
    expect(await requireUser("listino:scrivi")).toEqual({ id: mario.id, email: "mario@lovato.it", name: "Mario", role: "commerciale" });
  });

  it("permesso mancante ⇒ 403 con il ruolo richiesto (il ruolo è quello del database, non del token)", async () => {
    loginAs(mario);
    const err = await requireUser("regole:scrivi").catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.message).toBe("operazione riservata all'ufficio tecnico");
    const res = handleAuthError(err)!;
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "operazione riservata all'ufficio tecnico" });
  });

  it("utente disattivato con sessione ancora valida ⇒ 401", async () => {
    loginAs(mario);
    await requireUser();
    const db = await getDb();
    await db.update(users).set({ active: false }).where(eq(users.id, mario.id));
    const err = await requireUser().catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(handleAuthError(err)!.status).toBe(401);
  });

  it("utente cancellato ⇒ 401; withUser traduce gli errori in risposte", async () => {
    loginAs({ id: "inesistente", email: "x@y.it", role: "admin" });
    const handler = withUser("richieste:leggi", async (u) => Response.json({ id: u.id }));
    const res = await handler();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "utente non abilitato: accedi di nuovo" });
    loginAs(mario);
    expect(await (await handler()).json()).toEqual({ id: mario.id });
    expect(handleAuthError(new Error("altro"))).toBeNull();
  });
});
