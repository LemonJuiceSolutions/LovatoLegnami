import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { truncateAll } from "@/db/testing";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/server/auth/auth", () => ({ auth: async () => session.current }));

const actions = await import("../users");
const { requireUser, UnauthorizedError } = await import("@/server/auth");
const repo = await import("@/server/repositories/users");
const audit = await import("@/server/repositories/audit");

afterAll(() => closeDb());

const as = (id: string) => {
  session.current = { user: { id, email: "x", role: "admin", active: true } };
};

describe("gestione utenti (7.5)", () => {
  let admin: { id: string };
  let mario: { id: string };

  beforeEach(async () => {
    const db = await getDb();
    await truncateAll(db);
    [admin] = await db.insert(users).values({ email: "admin@lovato.it", role: "admin" }).returning();
    [mario] = await db.insert(users).values({ email: "mario@lovato.it", role: "commerciale", name: "Mario" }).returning();
    as(admin!.id);
  });

  it("disattivare o degradare l'unico admin attivo ⇒ errore", async () => {
    const res = await actions.setUserActiveAction(admin.id, false);
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(!res.ok && res.message).toMatch(/almeno un amministratore attivo/);
    expect(await actions.setUserRoleAction(admin.id, "commerciale")).toMatchObject({ ok: false, status: 409 });
    expect((await repo.get(admin.id)).active).toBe(true);
    // Con un secondo admin attivo il primo può essere degradato.
    await actions.setUserRoleAction(mario.id, "admin");
    expect(await actions.setUserRoleAction(admin.id, "ufficio-tecnico")).toMatchObject({ ok: true, data: { role: "ufficio-tecnico" } });
  });

  it("dopo la disattivazione la successiva requireUser di quell'utente fallisce", async () => {
    as(mario.id);
    expect((await requireUser()).id).toBe(mario.id);
    as(admin.id);
    expect(await actions.setUserActiveAction(mario.id, false)).toMatchObject({ ok: true, data: { active: false } });
    as(mario.id);
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
    expect((await audit.list({ entity: "user", entityId: mario.id }))[0]).toMatchObject({ action: "disattiva-utente", userId: admin.id });
  });

  it("creazione: email normalizzata, duplicato e ruolo non valido rifiutati", async () => {
    const created = await actions.createUserAction({ email: "  Lucia@Lovato.IT ", name: "Lucia", role: "ufficio-tecnico" });
    expect(created).toMatchObject({ ok: true, data: { email: "lucia@lovato.it", role: "ufficio-tecnico", active: true } });
    expect(await actions.createUserAction({ email: "lucia@lovato.it", role: "commerciale" })).toMatchObject({ ok: false, status: 409 });
    expect(await actions.createUserAction({ email: "x@y.it", role: "superuser" })).toMatchObject({ ok: false, status: 400 });
    expect(await actions.createUserAction({ email: "non-email", role: "commerciale" })).toMatchObject({ ok: false, status: 400 });
    const list = await actions.listUsersAction();
    expect(list.ok && list.data.map((u) => u.email)).toEqual(["admin@lovato.it", "lucia@lovato.it", "mario@lovato.it"]);
  });

  it("solo l'admin gestisce gli utenti: 403 per gli altri ruoli, 401 senza sessione", async () => {
    as(mario.id);
    expect(await actions.listUsersAction()).toEqual({ ok: false, status: 403, message: "operazione riservata all'amministratore" });
    expect(await actions.setUserRoleAction(mario.id, "admin")).toMatchObject({ ok: false, status: 403 });
    expect((await repo.get(mario.id)).role).toBe("commerciale");
    session.current = null;
    expect(await actions.createUserAction({ email: "z@y.it", role: "admin" })).toMatchObject({ ok: false, status: 401 });
  });

  it("password: reimpostazione solo dall'admin (mostrata una volta), cambio della propria per tutti", async () => {
    const pw = await import("../password");
    const { verifyPassword } = await import("@/server/auth/password");
    const hashOf = async (id: string) => (await (await getDb()).select({ h: users.passwordHash }).from(users).where(eq(users.id, id)))[0]!.h;
    as(mario.id);
    expect(await actions.resetUserPasswordAction(admin.id)).toMatchObject({ ok: false, status: 403 });
    as(admin.id);
    const reset = await actions.resetUserPasswordAction(mario.id);
    expect(reset).toMatchObject({ ok: true, data: { email: "mario@lovato.it" } });
    const generated = reset.ok ? reset.data.password : "";
    expect(generated).toHaveLength(20);
    expect(await verifyPassword(generated, await hashOf(mario.id))).toBe(true);
    expect(await actions.resetUserPasswordAction("inesistente")).toMatchObject({ ok: false, status: 400 });

    as(mario.id);
    expect(await pw.changeOwnPasswordAction({ current: "sbagliata", next: "nuova password lunga" })).toMatchObject({ ok: false, status: 400, message: "La password attuale non è corretta." });
    expect(await pw.changeOwnPasswordAction({ current: generated, next: "corta" })).toMatchObject({ ok: false, status: 400 });
    expect(await pw.changeOwnPasswordAction({ current: generated, next: "nuova password lunga" })).toEqual({ ok: true, data: null });
    expect(await verifyPassword("nuova password lunga", await hashOf(mario.id))).toBe(true);
    expect((await audit.list({ entity: "user", entityId: mario.id })).map((e) => e.action)).toEqual(expect.arrayContaining(["imposta-password", "cambia-password"]));
    session.current = null;
    expect(await pw.changeOwnPasswordAction({ current: "", next: "nuova password lunga" })).toMatchObject({ ok: false, status: 401 });
  });
});
