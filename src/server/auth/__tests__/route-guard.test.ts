import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config } from "@/middleware";
import { PROTECTED_API_PREFIXES, PROTECTED_PAGE_PREFIXES, guard, safeNextPath } from "../route-guard";

const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);
const isPass = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("middleware (7.3)", () => {
  it("pagina interna anonima ⇒ redirect all'accesso con next", () => {
    const res = guard(req("/configuratore?richiesta=abc"), false);
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/accesso");
    expect(loc.searchParams.get("next")).toBe("/configuratore?richiesta=abc");
    for (const p of ["/dashboard", "/ai", "/admin/listino/legno"]) expect(guard(req(p), false).headers.get("location")).toContain("/accesso?next=");
  });

  it("API interna anonima ⇒ 401 senza dati", async () => {
    const res = guard(req("/api/admin/dataset/attivi"), false);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "accesso richiesto" });
  });

  it("sito pubblico, wizard e API pubbliche passano", () => {
    for (const p of ["/", "/preventivo", "/preventivo/misure", "/pergole/addossata-monofalda", "/api/preventivo/stima", "/api/auth/session", "/accesso", "/administrator", "/aiuto"])
      expect([p, isPass(guard(req(p), false))]).toEqual([p, true]);
  });

  it("con sessione tutto passa (i permessi li controlla requireUser)", () => {
    expect(isPass(guard(req("/admin/utenti"), true))).toBe(true);
  });

  it("il matcher copre le stesse aree del guard", () => {
    const expected = [...PROTECTED_PAGE_PREFIXES, ...PROTECTED_API_PREFIXES].map((p) => `${p}/:path*`).sort();
    expect([...config.matcher].sort()).toEqual(expected);
  });

  it("next accetta solo percorsi interni", () => {
    expect(safeNextPath("/configuratore?x=1")).toBe("/configuratore?x=1");
    for (const bad of ["https://evil.example", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", "", null]) expect(safeNextPath(bad)).toBe("/dashboard");
  });
});
