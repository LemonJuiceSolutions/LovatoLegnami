import { describe, expect, it } from "vitest";
import { safeAuthRedirect, safeNextPath, sameSitePath, signInUrl } from "../route-guard";

const ATTACKS = [
  "/.//evil.example",
  "/..//evil.example",
  "/./..//evil.example/x",
  "//evil.example",
  "/\\evil.example",
  "/\\/evil.example",
  "\\\\evil.example",
  "https://evil.example",
  "http:evil.example",
  "javascript:alert(1)",
  "%2F%2Fevil.example",
  "/%2F%2Fevil.example",
  "/%2Fevil.example",
  "/%5Cevil.example",
  "/%5C%5Cevil.example",
  "/%09/evil.example",
  "/\t/evil.example",
  "/\n/evil.example",
  "/%",
  "",
  null,
  undefined,
];

describe("redirect sicuri (revisione di sicurezza)", () => {
  it.each(ATTACKS)("safeNextPath rifiuta %j", (next) => {
    expect(safeNextPath(next as string | null | undefined)).toBe("/dashboard");
    expect(sameSitePath(next as string | null | undefined) ?? "").not.toMatch(/^\/\/|^\/\\|^[a-z]+:/i);
  });

  it("i percorsi interni restano, con query e hash", () => {
    expect(safeNextPath("/configuratore?richiesta=abc&x=1#viewer")).toBe("/configuratore?richiesta=abc&x=1#viewer");
    expect(safeNextPath("/admin/listino/legno")).toBe("/admin/listino/legno");
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/admin/../configuratore")).toBe("/configuratore");
  });

  it("fuori dalle aree interne ⇒ destinazione di default", () => {
    for (const p of ["/", "/preventivo", "/accesso", "/api/admin/x", "/administrator", "/admin.evil"]) expect(safeNextPath(p)).toBe("/dashboard");
    expect(safeNextPath("/x", "/configuratore")).toBe("/configuratore");
  });

  it("signInUrl porta solo destinazioni sicure", () => {
    expect(signInUrl("/.//evil.example")).toBe("/accesso?next=%2Fdashboard");
    expect(signInUrl("/ai?x=1")).toBe("/accesso?next=%2Fai%3Fx%3D1");
  });

  it("callback redirect di Auth.js: stessa origine e percorsi sicuri", () => {
    const base = "http://localhost:3000";
    expect(safeAuthRedirect("/configuratore", base)).toBe(`${base}/configuratore`);
    expect(safeAuthRedirect("/api/auth/verify-request?provider=resend&type=email", base)).toBe(`${base}/api/auth/verify-request?provider=resend&type=email`);
    expect(safeAuthRedirect(`${base}/accesso?error=Verification`, base)).toBe(`${base}/accesso?error=Verification`);
    for (const bad of ["https://evil.example/x", "//evil.example", "/.//evil.example", "/..//evil.example", `${base}//evil.example`, "/%2F%2Fevil.example", "javascript:alert(1)"])
      expect([bad, safeAuthRedirect(bad, base)]).toEqual([bad, base]);
  });
});
