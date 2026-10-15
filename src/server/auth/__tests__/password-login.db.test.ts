import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { closeDb, getDb, openDb } from "@/db/client";
import { truncateAll } from "@/db/testing";
import { auditLog, users } from "@/db/schema";
import { createMemorySender } from "@/server/email/sender";
import { DEV_AUTH_SECRET } from "@/server/env";
import { createRateLimiter } from "@/server/rate-limit";
import { createAuthConfig } from "../auth";
import { hashPassword, verifyPassword } from "../password";
import { InvalidCredentials, TooManyAttempts, authorizeWithPassword, resetLoginRateLimit } from "../password-login";
import { PasswordError, changeOwnPassword, resetPasswordById, setPasswordByEmail } from "../password-store";

const BASE = "http://localhost:3000";
const PASSWORD = "Segreta-Lunga-2026";

afterAll(() => closeDb());

class Jar {
  private readonly cookies = new Map<string, string>();
  take(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair!.indexOf("=");
      this.cookies.set(pair!.slice(0, i), pair!.slice(i + 1));
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  has(prefix: string) {
    return [...this.cookies.keys()].some((k) => k.includes(prefix) && this.cookies.get(k));
  }
}

async function seed() {
  const db = await getDb();
  await truncateAll(db);
  resetLoginRateLimit();
  const hash = await hashPassword(PASSWORD);
  const [mario] = await db.insert(users).values({ email: "mario@lovato.it", role: "commerciale", name: "Mario Rossi", passwordHash: hash }).returning();
  const [ex] = await db.insert(users).values({ email: "ex@lovato.it", role: "commerciale", active: false, passwordHash: hash }).returning();
  const [nopw] = await db.insert(users).values({ email: "link@lovato.it", role: "admin" }).returning();
  return { db, mario: mario!, ex: ex!, nopw: nopw! };
}

describe("authorizeWithPassword", () => {
  beforeEach(seed);

  it("utente attivo con password giusta ⇒ stessa forma di utente dell'adapter (email normalizzata)", async () => {
    const db = await getDb();
    const u = await authorizeWithPassword(db, { email: "  Mario@Lovato.IT ", password: PASSWORD, ip: "1.1.1.1" }, createRateLimiter());
    expect(u).toMatchObject({ email: "mario@lovato.it", name: "Mario Rossi", role: "commerciale", active: true });
    expect(Object.keys(u).sort()).toEqual(["active", "email", "id", "name", "role"]);
  });

  it("password sbagliata, utente inesistente, disattivato o senza password ⇒ stesso errore", async () => {
    const db = await getDb();
    const limiter = createRateLimiter();
    for (const [email, password] of [
      ["mario@lovato.it", "sbagliata-sbagliata"],
      ["nessuno@lovato.it", PASSWORD],
      ["ex@lovato.it", PASSWORD],
      ["link@lovato.it", PASSWORD],
      ["link@lovato.it", ""],
      ["", PASSWORD],
      [123, null],
    ] as const) {
      await expect(authorizeWithPassword(db, { email, password, ip: `ip-${String(email)}` }, limiter)).rejects.toBeInstanceOf(InvalidCredentials);
    }
  });

  it("limite: 5 tentativi per email in 10 minuti, poi rifiuto anche con la password giusta", async () => {
    const db = await getDb();
    const limiter = createRateLimiter();
    for (let i = 0; i < 5; i++)
      await expect(authorizeWithPassword(db, { email: "mario@lovato.it", password: "sbagliata-sbagliata", ip: `10.0.0.${i}` }, limiter)).rejects.toBeInstanceOf(InvalidCredentials);
    await expect(authorizeWithPassword(db, { email: "MARIO@lovato.it", password: PASSWORD, ip: "10.0.0.99" }, limiter)).rejects.toBeInstanceOf(TooManyAttempts);
  });

  it("limite: 20 tentativi per IP in 10 minuti, qualunque indirizzo", async () => {
    const db = await getDb();
    const limiter = createRateLimiter();
    for (let i = 0; i < 20; i++)
      await expect(authorizeWithPassword(db, { email: `u${i}@lovato.it`, password: "x", ip: "203.0.113.5" }, limiter)).rejects.toBeInstanceOf(InvalidCredentials);
    await expect(authorizeWithPassword(db, { email: "mario@lovato.it", password: PASSWORD, ip: "203.0.113.5" }, limiter)).rejects.toBeInstanceOf(TooManyAttempts);
    // altro IP: passa
    await expect(authorizeWithPassword(db, { email: "mario@lovato.it", password: PASSWORD, ip: "203.0.113.6" }, limiter)).resolves.toMatchObject({ role: "commerciale" });
  });
});

describe("Auth.js: provider password (callback con CSRF)", () => {
  let handlers: ReturnType<typeof NextAuth>["handlers"];

  beforeAll(async () => {
    const db = await getDb();
    handlers = NextAuth(createAuthConfig({ db, sender: createMemorySender(), env: { authSecret: DEV_AUTH_SECRET, emailFrom: "Lovato <noreply@localhost>", production: false } })).handlers;
  });
  beforeEach(seed);

  async function login(email: string, password: string, opts: { csrf?: boolean; ip?: string } = {}) {
    const jar = new Jar();
    const csrfRes = await handlers.GET(new NextRequest(`${BASE}/api/auth/csrf`));
    jar.take(csrfRes);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const res = await handlers.POST(
      new NextRequest(`${BASE}/api/auth/callback/password`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header(), "x-forwarded-for": opts.ip ?? "192.0.2.1" },
        body: new URLSearchParams({ email, password, csrfToken: opts.csrf === false ? "falso" : csrfToken, callbackUrl: `${BASE}/admin` }).toString(),
      }),
    );
    jar.take(res);
    return { res, jar };
  }

  it("credenziali giuste ⇒ sessione JWT con ruolo letto dal database, redirect alla destinazione", async () => {
    const { res, jar } = await login("mario@lovato.it", PASSWORD);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${BASE}/admin`);
    expect(jar.has("session-token")).toBe(true);
    const session = await handlers.GET(new NextRequest(`${BASE}/api/auth/session`, { headers: { cookie: jar.header() } }));
    expect(await session.json()).toMatchObject({ user: { email: "mario@lovato.it", name: "Mario Rossi", role: "commerciale", active: true } });
  });

  it("credenziali sbagliate o utente disattivato ⇒ nessuna sessione, errore generico", async () => {
    for (const [email, password] of [
      ["mario@lovato.it", "sbagliata-sbagliata"],
      ["ex@lovato.it", PASSWORD],
    ]) {
      const { res, jar } = await login(email!, password!);
      expect(res.headers.get("location")).toMatch(/\/accesso\?error=CredentialsSignin&code=credenziali/);
      expect(jar.has("session-token")).toBe(false);
    }
  });

  it("senza token CSRF valido ⇒ rifiutato", async () => {
    const { res, jar } = await login("mario@lovato.it", PASSWORD, { csrf: false });
    expect(res.headers.get("location")).toMatch(/error=MissingCSRF/);
    expect(jar.has("session-token")).toBe(false);
  });

  it("limite per email anche sulla callback diretta", async () => {
    for (let i = 0; i < 5; i++) await login("mario@lovato.it", "sbagliata-sbagliata", { ip: `198.51.100.${i}` });
    const { res, jar } = await login("mario@lovato.it", PASSWORD, { ip: "198.51.100.200" });
    expect(res.headers.get("location")).toMatch(/code=tentativi/);
    expect(jar.has("session-token")).toBe(false);
  });
});

describe("impostazione e cambio della password", () => {
  beforeEach(seed);

  const hashOf = async (id: string) => (await (await getDb()).select({ h: users.passwordHash, at: users.passwordChangedAt }).from(users).where(eq(users.id, id)))[0]!;
  const auditFor = async (id: string) => (await getDb()).select().from(auditLog).where(eq(auditLog.entityId, id));

  it("setPasswordByEmail: generata (20 caratteri) o data, con voce di registro senza segreti", async () => {
    const { db, nopw } = await seed();
    const r = await setPasswordByEmail(db, "LINK@lovato.it");
    expect(r.generated).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(await verifyPassword(r.generated!, (await hashOf(nopw.id)).h)).toBe(true);
    expect((await hashOf(nopw.id)).at).toBeInstanceOf(Date);
    await setPasswordByEmail(db, "link@lovato.it", "scelta-dall-operatore");
    expect(await verifyPassword("scelta-dall-operatore", (await hashOf(nopw.id)).h)).toBe(true);
    const entries = await auditFor(nopw.id);
    expect(entries.map((e) => e.action)).toEqual(["imposta-password", "imposta-password"]);
    expect(JSON.stringify(entries)).not.toContain("scelta-dall-operatore");
    expect(JSON.stringify(entries)).not.toContain("scrypt$");
  });

  it("setPasswordByEmail: utente inesistente o password troppo corta ⇒ errore", async () => {
    const db = await getDb();
    await expect(setPasswordByEmail(db, "nessuno@lovato.it")).rejects.toThrow(/nessun utente/);
    await expect(setPasswordByEmail(db, "mario@lovato.it", "corta")).rejects.toBeInstanceOf(PasswordError);
  });

  it("resetPasswordById: password generata, registrata con l'autore", async () => {
    const { db, mario, nopw } = await seed();
    const r = await resetPasswordById(db, mario.id, nopw.id);
    expect(await verifyPassword(r.generated, (await hashOf(mario.id)).h)).toBe(true);
    expect(await verifyPassword(PASSWORD, (await hashOf(mario.id)).h)).toBe(false);
    expect((await auditFor(mario.id))[0]).toMatchObject({ action: "imposta-password", userId: nopw.id });
  });

  it("changeOwnPassword: serve la password attuale, se impostata; minimo 12 caratteri", async () => {
    const { db, mario, nopw } = await seed();
    await expect(changeOwnPassword(db, mario.id, "sbagliata", "nuova password lunga")).rejects.toThrow(/attuale non è corretta/);
    await expect(changeOwnPassword(db, mario.id, PASSWORD, "corta")).rejects.toThrow(/almeno 12/);
    await expect(changeOwnPassword(db, mario.id, PASSWORD, PASSWORD)).rejects.toThrow(/diversa/);
    await changeOwnPassword(db, mario.id, PASSWORD, "nuova password lunga");
    expect(await verifyPassword("nuova password lunga", (await hashOf(mario.id)).h)).toBe(true);
    expect((await auditFor(mario.id)).map((e) => [e.action, e.userId])).toEqual([["cambia-password", mario.id]]);
    // Senza password (entrato col collegamento): la imposta senza quella attuale.
    await changeOwnPassword(db, nopw.id, "", "prima password lunga");
    expect(await verifyPassword("prima password lunga", (await hashOf(nopw.id)).h)).toBe(true);
  });

  it("changeOwnPassword: utente disattivato ⇒ rifiutato", async () => {
    const { db, ex } = await seed();
    await expect(changeOwnPassword(db, ex.id, PASSWORD, "nuova password lunga")).rejects.toThrow(/non abilitato/);
  });
});

const run = promisify(execFile);

describe("CLI npm run admin:set-password", () => {
  let dir: string;
  const repo = process.cwd();

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "lovato-set-password-"));
    await symlink(join(repo, "drizzle"), join(dir, "drizzle"));
    const handle = await openDb({ pglite: join(dir, ".data", "pglite") });
    await handle.db.insert(users).values({ email: "admin@lovato.it", role: "admin" });
    await handle.close();
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  // Processo separato, come sul server: PGlite su disco nella cartella temporanea.
  const cli = (...args: string[]) => {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development" };
    delete env.VITEST;
    delete env.DATABASE_URL;
    for (const k of Object.keys(env)) if (k.startsWith("VITEST_")) delete env[k];
    return run(join(repo, "node_modules", ".bin", "tsx"), ["--tsconfig", join(repo, "tsconfig.json"), join(repo, "scripts", "set-password.ts"), ...args], { cwd: dir, env });
  };

  it("senza password: la genera, la stampa una volta e funziona per l'accesso", async () => {
    const { stdout } = await cli("Admin@Lovato.it");
    expect(stdout).toMatch(/password impostata per admin@lovato\.it/);
    const generated = stdout.trim().split("\n").at(-1)!;
    expect(generated).toMatch(/^[A-Za-z0-9]{20}$/);
    const handle = await openDb({ pglite: join(dir, ".data", "pglite") });
    try {
      const u = await authorizeWithPassword(handle.db, { email: "admin@lovato.it", password: generated, ip: "cli" }, createRateLimiter());
      expect(u.role).toBe("admin");
    } finally {
      await handle.close();
    }
  }, 60_000);

  it("utente inesistente o argomenti mancanti ⇒ codice d'uscita non zero", async () => {
    await expect(cli("nessuno@lovato.it")).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/nessun utente/) });
    await expect(cli()).rejects.toMatchObject({ code: 2 });
    await expect(cli("admin@lovato.it", "corta")).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/almeno 12/) });
  }, 60_000);
});
