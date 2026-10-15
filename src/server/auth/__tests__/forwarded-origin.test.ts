import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { withForwardedOrigin } from "../forwarded-origin";

const TRUST = { AUTH_TRUST_HOST: "true" };
const req = (headers: Record<string, string>, url = "http://0.0.0.0:3000/api/auth/callback/resend?token=t&email=a%40b.it") => new NextRequest(url, { headers });

describe("origine pubblica per Auth.js dietro Caddy", () => {
  it("standalone: req.url dell'indirizzo di ascolto ⇒ host e protocollo inoltrati da Caddy", () => {
    const out = withForwardedOrigin(req({ host: "configuratore.esempio.it", "x-forwarded-host": "configuratore.esempio.it", "x-forwarded-proto": "https" }), TRUST);
    expect(out.url).toBe("https://configuratore.esempio.it/api/auth/callback/resend?token=t&email=a%40b.it");
    expect(out.headers.get("x-forwarded-host")).toBe("configuratore.esempio.it");
  });

  it("senza proxy usa l'header Host; primo valore di un elenco", () => {
    expect(withForwardedOrigin(req({ host: "lovato.lan:3310" }), TRUST).url).toMatch(/^http:\/\/lovato\.lan:3310\/api\/auth\//);
    expect(withForwardedOrigin(req({ "x-forwarded-host": "a.esempio.it, b.esempio.it", "x-forwarded-proto": "https,http" }), TRUST).url).toMatch(/^https:\/\/a\.esempio\.it\//);
  });

  it("POST: corpo conservato", async () => {
    const r = new NextRequest("http://0.0.0.0:3000/api/auth/signin/resend", { method: "POST", body: "email=a%40b.it", headers: { host: "lovato.esempio.it", "x-forwarded-proto": "https", "content-type": "application/x-www-form-urlencoded" } });
    const out = withForwardedOrigin(r, TRUST);
    expect(out.url).toBe("https://lovato.esempio.it/api/auth/signin/resend");
    expect(out.method).toBe("POST");
    expect(await out.text()).toBe("email=a%40b.it");
  });

  it("host non fidato, AUTH_URL fisso o host non valido ⇒ richiesta invariata", () => {
    const r = req({ host: "x.esempio.it" });
    expect(withForwardedOrigin(r, {})).toBe(r);
    expect(withForwardedOrigin(r, { ...TRUST, AUTH_URL: "https://fisso.esempio.it" })).toBe(r);
    const bad = req({ host: "evil.esempio.it/../x" });
    expect(withForwardedOrigin(bad, TRUST)).toBe(bad);
    const same = req({ host: "0.0.0.0:3000" });
    expect(withForwardedOrigin(same, TRUST)).toBe(same);
  });
});
