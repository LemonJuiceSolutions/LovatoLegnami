import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { closeDb, getDb } from "@/db/client";
import { truncateAll } from "@/db/testing";
import { users } from "@/db/schema";
import { createMemorySender } from "@/server/email/sender";
import { DEV_AUTH_SECRET } from "@/server/env";
import { NEUTRAL_SIGN_IN_REDIRECT, createAuthConfig, isAllowedToSignIn } from "../auth";

const BASE = "http://localhost:3000";
const sender = createMemorySender();

afterAll(() => closeDb());

/** Cookie jar minimale: nome=valore dai `set-cookie` delle risposte. */
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

describe("accesso con collegamento via email (7.2)", () => {
  let handlers: ReturnType<typeof NextAuth>["handlers"];

  beforeAll(async () => {
    const db = await getDb();
    handlers = NextAuth(createAuthConfig({ db, sender, env: { authSecret: DEV_AUTH_SECRET, emailFrom: "Lovato <noreply@localhost>", production: false } })).handlers;
  });

  beforeEach(async () => {
    const db = await getDb();
    await truncateAll(db);
    sender.clear();
    await db.insert(users).values([
      { email: "mario@lovato.it", role: "commerciale", name: "Mario Rossi" },
      { email: "ex@lovato.it", role: "commerciale", active: false },
    ]);
  });

  async function requestLink(email: string, jar = new Jar()) {
    const csrfRes = await handlers.GET(new NextRequest(`${BASE}/api/auth/csrf`));
    jar.take(csrfRes);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const res = await handlers.POST(
      new NextRequest(`${BASE}/api/auth/signin/resend`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header() },
        body: new URLSearchParams({ email, csrfToken, callbackUrl: `${BASE}/configuratore` }).toString(),
      }),
    );
    return { res, jar };
  }

  it("isAllowedToSignIn: solo utenti registrati e attivi", async () => {
    const db = await getDb();
    expect(await isAllowedToSignIn(db, "MARIO@lovato.it ")).toBe(true);
    expect(await isAllowedToSignIn(db, "ex@lovato.it")).toBe(false);
    expect(await isAllowedToSignIn(db, "sconosciuto@esempio.it")).toBe(false);
    expect(await isAllowedToSignIn(db, null)).toBe(false);
  });

  it("indirizzo non registrato o disattivato: nessuna email e stessa risposta di uno registrato", async () => {
    const unknown = await requestLink("sconosciuto@esempio.it");
    const inactive = await requestLink("ex@lovato.it");
    expect(sender.sent).toHaveLength(0);
    const known = await requestLink("mario@lovato.it");
    expect(sender.sent).toHaveLength(1);
    for (const r of [unknown, inactive, known]) {
      expect(r.res.status).toBe(302);
      expect(r.res.headers.get("location")).toBe(`${BASE}${NEUTRAL_SIGN_IN_REDIRECT}`);
    }
  });

  it("indirizzo registrato: email con collegamento monouso che apre la sessione e torna alla pagina richiesta", async () => {
    await requestLink("Mario@Lovato.it");
    expect(sender.sent).toHaveLength(1);
    const mail = sender.sent[0]!;
    expect(mail.to).toBe("mario@lovato.it");
    expect(mail.text).toContain("15 minuti");
    const link = mail.text.match(/https?:\/\/\S+\/api\/auth\/callback\/resend\?\S+/)?.[0];
    expect(link).toBeDefined();
    expect(mail.html).toContain(link!.replace(/&/g, "&amp;"));

    const jar = new Jar();
    const open = await handlers.GET(new NextRequest(link!));
    jar.take(open);
    expect(open.status).toBe(302);
    expect(open.headers.get("location")).toBe(`${BASE}/configuratore`);
    expect(jar.has("session-token")).toBe(true);

    const session = await handlers.GET(new NextRequest(`${BASE}/api/auth/session`, { headers: { cookie: jar.header() } }));
    expect(await session.json()).toMatchObject({ user: { email: "mario@lovato.it", name: "Mario Rossi", role: "commerciale", active: true } });

    // Riuso del collegamento: rifiutato, invito a richiederne uno nuovo nella pagina di accesso.
    const again = await handlers.GET(new NextRequest(link!));
    expect(again.status).toBe(302);
    expect(again.headers.get("location")).toMatch(/\/accesso\?error=Verification/);
  });

  it("utente disattivato dopo la richiesta: il collegamento non apre la sessione", async () => {
    await requestLink("mario@lovato.it");
    const link = sender.sent[0]!.text.match(/https?:\/\/\S+\/api\/auth\/callback\/resend\?\S+/)![0];
    const db = await getDb();
    await db.update(users).set({ active: false });
    const open = await handlers.GET(new NextRequest(link));
    expect(open.headers.get("location")).toMatch(/\/accesso\?error=AccessDenied/);
    expect(open.headers.getSetCookie().some((c) => /session-token=[^;]+/.test(c))).toBe(false);
  });
});
