import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { DEFAULT_PRICE_LIST_DATA } from "@/domain/pricing/data/default-listino";
import { defaultConfig } from "@/stores/config";
import { serializeConfig } from "@/stores/config-file";
import { freshDb, makeUser } from "@/server/repositories/__tests__/helpers";

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/server/auth/auth", () => ({ auth: async () => session.current }));

const { saveDraftSection } = await import("../datasets");
const { simulateQuote } = await import("../simulate");
const repo = await import("@/server/repositories/datasets");
const leads = await import("@/server/repositories/leads");

afterAll(() => closeDb());
const as = (u: { id: string }) => {
  session.current = { user: { id: u.id, email: "x" } };
};

describe("simulatore (9.8)", () => {
  let mario: { id: string };

  beforeEach(async () => {
    await freshDb();
    mario = await makeUser("mario@lovato.it", "commerciale", "Mario Rossi");
    await repo.createVersion({ dataset: "listino", data: DEFAULT_PRICE_LIST_DATA, status: "attiva", effectiveFrom: "2026-01-01", version: 1 });
    as(mario);
  });

  it("bozza con manodopera +5% ⇒ due totali diversi e differenza per riga", async () => {
    const rate = DEFAULT_PRICE_LIST_DATA.labour.hourlyRateCents;
    expect((await saveDraftSection({ dataset: "listino", path: "labour.hourlyRateCents", value: Math.round(rate * 1.05), expectedUpdatedAt: null })).ok).toBe(true);
    const res = await simulateQuote({ source: { kind: "preset", id: "libera-4x6" }, options: { cap: "37100" } });
    expect(res.ok).toBe(true);
    const sim = res.ok ? res.data : null!;
    expect(sim.draft!.versionLabel).toMatch(/^bozza – listino v2/);
    expect(sim.active!.versionLabel).toMatch(/^attiva – listino v1/);
    const [d, a] = [sim.draft!.office.totals.totalCents, sim.active!.office.totals.totalCents];
    expect(d).toBeGreaterThan(a);
    expect(sim.totalDeltaCents).toBe(d - a);
    // la differenza è nelle righe di montaggio (e nei margini/IVA che ne dipendono), non nel legno
    const codes = sim.lines.map((l) => l.code);
    expect(codes.some((c) => c.startsWith("montaggio"))).toBe(true);
    expect(codes.some((c) => c.startsWith("legno"))).toBe(false);
    for (const l of sim.lines) expect(l.deltaCents).toBe((l.draftCents ?? 0) - (l.activeCents ?? 0));
    expect(sim.draft!.customer.totalCents).toBe(d);
  });

  it("fattori di cantiere modificati: dislivello di 150 mm fa scattare 'pavimento non in piano'", async () => {
    const base = await simulateQuote({ source: { kind: "preset", id: "libera-4x6" } });
    expect(base.ok && base.data.draft).toBeNull();
    expect(base.ok && base.data.active!.office.firedRules.map((r) => r.id)).not.toContain("pavimento-non-in-piano");
    const res = await simulateQuote({ source: { kind: "preset", id: "libera-4x6" }, factors: { floorRangeMm: 150, access: "difficile" } });
    const fired = res.ok ? res.data.active!.office.firedRules.map((r) => r.id) : [];
    expect(fired).toEqual(expect.arrayContaining(["pavimento-non-in-piano", "accesso"]));
    expect(res.ok && res.data.siteFactors).toMatchObject({ floorRangeMm: 150, access: "difficile" });
  });

  it("richiesta salvata come sorgente; permessi e ingressi", async () => {
    const config = JSON.parse(serializeConfig(defaultConfig("autoportante-bifalda")));
    const { lead } = await leads.createLeadWithQuote({
      customer: { name: "Anna Verdi", email: "anna@example.it" },
      consent: { version: "2026-10", text: "ok", acceptedAt: new Date().toISOString() },
      quote: { config, quote: { schema: 1 }, totalCents: 1 },
    });
    const res = await simulateQuote({ source: { kind: "lead", id: lead.id } });
    expect(res.ok && res.data.active!.office.typologySlug).toBe("autoportante-bifalda");
    expect(JSON.stringify(res)).not.toContain("anna@example.it");
    expect(await simulateQuote({ source: { kind: "lead", id: "inesistente" } })).toMatchObject({ ok: false, status: 404 });
    expect(await simulateQuote({ source: { kind: "preset", id: "libera-4x6" }, options: { cap: "abc" } })).toMatchObject({ ok: false, status: 400 });
    as(await makeUser("lucia@lovato.it", "ufficio-tecnico"));
    expect((await simulateQuote({ source: { kind: "preset", id: "libera-4x6" } })).ok).toBe(true);
  });
});
