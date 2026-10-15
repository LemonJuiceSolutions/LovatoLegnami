import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ signIn: [] as unknown[], ip: "198.51.100.20" }));
vi.mock("@/server/auth/auth", () => ({
  signIn: async (...args: unknown[]) => {
    calls.signIn.push(args);
  },
  signOut: async () => {},
}));
vi.mock("next/headers", () => ({ headers: () => new Headers({ "x-forwarded-for": calls.ip }) }));

const { requestSignIn } = await import("../auth");
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
