import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { closeDb, getDb } from "@/db/client";
import { truncateAll } from "@/db/testing";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { createMemorySender } from "@/server/email/sender";
import { DEV_AUTH_SECRET } from "@/server/env";
import { createAuthConfig, normalizeEmail } from "../auth";
import { MAGIC_LINK_MAX_AGE_S } from "../auth.config";
import { ADMIN_LINK_MAX_AGE_S, AdminLinkError, createAdminLink, hashVerificationToken } from "../admin-link";

const BASE = "https://configuratore.esempio.it";
const sender = createMemorySender();

afterAll(() => closeDb());

describe("collegamento di accesso dell'operatore (admin:link)", () => {
  let handlers: ReturnType<typeof NextAuth>["handlers"];

  beforeAll(async () => {
    const db = await getDb();
    handlers = NextAuth({
      ...createAuthConfig({ db, sender, env: { authSecret: DEV_AUTH_SECRET, emailFrom: "Lovato <noreply@localhost>", production: false } }),
      trustHost: true,
    }).handlers;
  });

  beforeEach(async () => {
    const db = await getDb();
    await truncateAll(db);
    sender.clear();
    await db.insert(users).values([
      { email: "admin@lovato.it", role: "admin", name: "Admin" },
      { email: "ex@lovato.it", role: "commerciale", active: false },
    ]);
  });

  it("stessi valori di Auth.js: scadenza, normalizzazione, hash sha256(token + segreto)", async () => {
    expect(ADMIN_LINK_MAX_AGE_S).toBe(MAGIC_LINK_MAX_AGE_S);
    // stesso algoritmo di `createHash` di @auth/core (Web Crypto, esadecimale)
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`abc${DEV_AUTH_SECRET}`));
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    expect(hashVerificationToken("abc", DEV_AUTH_SECRET)).toBe(hex);

    const db = await getDb();
    const now = new Date("2026-10-15T10:00:00Z");
    const link = await createAdminLink(db, { email: " Admin@Lovato.IT ", baseUrl: `${BASE}/qualcosa`, secret: DEV_AUTH_SECRET, now });
    expect(link.email).toBe(normalizeEmail(" Admin@Lovato.IT "));
    expect(link.expires.toISOString()).toBe("2026-10-15T10:15:00.000Z");
    const url = new URL(link.url);
    expect(url.origin + url.pathname).toBe(`${BASE}/api/auth/callback/resend`);
    expect(url.searchParams.get("email")).toBe("admin@lovato.it");
    expect(url.searchParams.get("callbackUrl")).toBe(`${BASE}/admin`);
    const rows = await db.select().from(verificationTokens);
    expect(rows).toEqual([{ identifier: "admin@lovato.it", token: hashVerificationToken(url.searchParams.get("token")!, DEV_AUTH_SECRET), expires: link.expires }]);
  });

  it("useVerificationToken dell'adapter accetta il token una sola volta", async () => {
    const db = await getDb();
    const link = await createAdminLink(db, { email: "admin@lovato.it", baseUrl: BASE, secret: DEV_AUTH_SECRET });
    const token = new URL(link.url).searchParams.get("token")!;
    const adapter = DrizzleAdapter(db, {
      usersTable: users as never,
      accountsTable: accounts as never,
      sessionsTable: sessions as never,
      verificationTokensTable: verificationTokens as never,
    });
    const hashed = hashVerificationToken(token, DEV_AUTH_SECRET);
    const used = await adapter.useVerificationToken!({ identifier: "admin@lovato.it", token: hashed });
    expect(used).toMatchObject({ identifier: "admin@lovato.it", token: hashed });
    expect(await adapter.useVerificationToken!({ identifier: "admin@lovato.it", token: hashed })).toBeNull();
  });

  it("il collegamento apre la sessione sull'host indicato; riaperto è rifiutato", async () => {
    const db = await getDb();
    const link = await createAdminLink(db, { email: "admin@lovato.it", baseUrl: BASE, secret: DEV_AUTH_SECRET });
    const open = await handlers.GET(new NextRequest(link.url));
    expect(open.status).toBe(302);
    expect(open.headers.get("location")).toBe(`${BASE}/admin`);
    const cookies = open.headers.getSetCookie();
    expect(cookies.some((c) => /session-token=[^;]+/.test(c))).toBe(true);
    const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
    const session = await handlers.GET(new NextRequest(`${BASE}/api/auth/session`, { headers: { cookie } }));
    expect(await session.json()).toMatchObject({ user: { email: "admin@lovato.it", role: "admin" } });

    const again = await handlers.GET(new NextRequest(link.url));
    expect(again.status).toBe(302);
    expect(again.headers.get("location")).toMatch(/\/accesso\?error=Verification/);
  });

  it("segreto diverso da quello dell'applicazione ⇒ collegamento rifiutato", async () => {
    const db = await getDb();
    const link = await createAdminLink(db, { email: "admin@lovato.it", baseUrl: BASE, secret: "un-altro-segreto-lungo-almeno-32-caratteri" });
    const open = await handlers.GET(new NextRequest(link.url));
    expect(open.headers.get("location")).toMatch(/\/accesso\?error=Verification/);
  });

  it("utente inesistente o disattivato, URL o pagina non validi ⇒ errore e nessun token", async () => {
    const db = await getDb();
    await expect(createAdminLink(db, { email: "nessuno@lovato.it", baseUrl: BASE, secret: DEV_AUTH_SECRET })).rejects.toThrow(/nessun utente/);
    await expect(createAdminLink(db, { email: "ex@lovato.it", baseUrl: BASE, secret: DEV_AUTH_SECRET })).rejects.toThrow(/disattivato/);
    await expect(createAdminLink(db, { email: "admin@lovato.it", baseUrl: "ftp://x", secret: DEV_AUTH_SECRET })).rejects.toBeInstanceOf(AdminLinkError);
    await expect(createAdminLink(db, { email: "admin@lovato.it", baseUrl: BASE, secret: DEV_AUTH_SECRET, next: "//evil.example" })).rejects.toBeInstanceOf(AdminLinkError);
    await expect(createAdminLink(db, { email: "admin@lovato.it", baseUrl: BASE, secret: "" })).rejects.toThrow(/AUTH_SECRET/);
    expect(await db.select().from(verificationTokens)).toEqual([]);
  });
});
