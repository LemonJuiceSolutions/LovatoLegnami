import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ signIn: [] as unknown[], ip: "198.51.100.20", fail: null as null | Error }));
vi.mock("@/server/auth/auth", () => ({
  signIn: async (...args: unknown[]) => {
    calls.signIn.push(args);
    if (calls.fail) throw calls.fail;
  },
  signOut: async () => {},
}));
vi.mock("next/headers", () => ({ headers: () => new Headers({ "x-forwarded-for": calls.ip }) }));

const { requestSignIn, signInWithPassword } = await import("../auth");
const { InvalidCredentials, TooManyAttempts } = await import("@/server/auth/password-login");
const SIGN_IN_RATE_MESSAGE = "Troppe richieste di accesso: riprova tra qualche minuto.";
const { resetRateLimits } = await import("@/server/rate-limit");

const form = (email: string) => {
  const f = new FormData();
  f.set("email", email);
  f.set("next", "/admin");
  return f;
};

describe("requestSignIn: limite delle richieste di accesso", () => {
  beforeEach(() => {
    resetRateLimits();
    calls.signIn = [];
    calls.ip = "198.51.100.20";
    calls.fail = null;
  });

  it("formato non valido ⇒ messaggio, nessun invio", async () => {
    expect(await requestSignIn(form("non-una-email"))).toMatchObject({ ok: false });
    expect(calls.signIn).toHaveLength(0);
  });

  it("oltre 5 richieste in 10 minuti dallo stesso IP ⇒ rifiutata senza inviare", async () => {
    for (let i = 0; i < 5; i++) expect(await requestSignIn(form(`utente${i}@lovato.it`))).toBeUndefined();
    expect(await requestSignIn(form("altro@lovato.it"))).toEqual({ ok: false, message: SIGN_IN_RATE_MESSAGE });
    expect(calls.signIn).toHaveLength(5);
  });

  it("stesso indirizzo da IP diversi ⇒ limitato per indirizzo", async () => {
    for (let i = 0; i < 5; i++) {
      calls.ip = `203.0.113.${i}`;
      await requestSignIn(form("ufficio@lovato.it"));
    }
    calls.ip = "203.0.113.99";
    expect(await requestSignIn(form("Ufficio@Lovato.it"))).toEqual({ ok: false, message: SIGN_IN_RATE_MESSAGE });
    expect(calls.signIn).toHaveLength(5);
  });
});

describe("signInWithPassword", () => {
  const pwForm = (email: string, password: string, next = "https://evil.example/") => {
    const f = new FormData();
    f.set("email", email);
    f.set("password", password);
    f.set("next", next);
    return f;
  };
  beforeEach(() => {
    calls.signIn = [];
    calls.fail = null;
  });

  it("chiama il provider password con email normalizzata e destinazione sanificata", async () => {
    expect(await signInWithPassword(pwForm(" Mario@Lovato.it ", "una password lunga"))).toBeUndefined();
    expect(calls.signIn).toEqual([["password", { email: "mario@lovato.it", password: "una password lunga", redirectTo: "/dashboard" }]]);
    await signInWithPassword(pwForm("mario@lovato.it", "una password lunga", "/admin/utenti"));
    expect((calls.signIn[1] as [string, { redirectTo: string }])[1].redirectTo).toBe("/admin/utenti");
  });

  it("dati mancanti o credenziali errate ⇒ messaggio generico", async () => {
    const generic = { ok: false, message: "Email o password non corretti." };
    expect(await signInWithPassword(pwForm("non-email", "x"))).toEqual(generic);
    expect(await signInWithPassword(pwForm("mario@lovato.it", ""))).toEqual(generic);
    expect(calls.signIn).toHaveLength(0);
    calls.fail = new InvalidCredentials();
    expect(await signInWithPassword(pwForm("mario@lovato.it", "sbagliata"))).toEqual(generic);
  });

  it("troppi tentativi ⇒ messaggio dedicato", async () => {
    calls.fail = new TooManyAttempts();
    expect(await signInWithPassword(pwForm("mario@lovato.it", "x"))).toEqual({ ok: false, message: "Troppi tentativi di accesso: riprova tra qualche minuto." });
  });

  it("redirect di Next (accesso riuscito) non intercettato", async () => {
    calls.fail = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/admin;307;" });
    await expect(signInWithPassword(pwForm("mario@lovato.it", "una password lunga"))).rejects.toThrow("NEXT_REDIRECT");
  });
});
