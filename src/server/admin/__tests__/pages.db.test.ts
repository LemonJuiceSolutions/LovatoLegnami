import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { DEFAULT_PRICE_LIST_DATA } from "@/domain/pricing/data/default-listino";
import { freshDb, makeUser } from "@/server/repositories/__tests__/helpers";

/**
 * Pagine server dell'area admin chiamate come funzioni (9.10): `next/headers` e
 * `notFound`/`redirect` simulati, così si verifica la guardia di ogni pagina.
 */

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/server/auth/auth", () => ({ auth: async () => session.current }));
vi.mock("next/headers", () => ({ headers: () => new Headers({ "x-lovato-path": "/admin/utenti" }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

const { default: UtentiPage } = await import("@/app/(admin)/admin/utenti/page");
const { default: RegistroPage } = await import("@/app/(admin)/admin/registro/page");
const { saveDraftSection } = await import("@/server/actions/datasets");
const repo = await import("@/server/repositories/datasets");

afterAll(() => closeDb());
const as = (u: { id: string } | null) => {
  session.current = u ? { user: { id: u.id, email: "x" } } : null;
};

describe("guardie delle pagine admin (9.10)", () => {
  let admin: { id: string };
  let mario: { id: string };

  beforeEach(async () => {
    await freshDb();
    admin = await makeUser("admin@lovato.it", "admin", "Admin");
    mario = await makeUser("mario@lovato.it", "commerciale", "Mario Rossi");
  });

  it("/admin/utenti per un commerciale ⇒ non accessibile (404); anonimo ⇒ accesso", async () => {
    as(mario);
    await expect(UtentiPage()).rejects.toThrow("NEXT_NOT_FOUND");
    as(null);
    await expect(UtentiPage()).rejects.toThrow("NEXT_REDIRECT /accesso?next=%2Fadmin%2Futenti");
    as(admin);
    await expect(UtentiPage()).resolves.toBeTruthy();
  });

  it("/admin/registro contiene la voce del cambio prezzo dell'abete (come in 6.4)", async () => {
    await repo.createVersion({ dataset: "listino", data: DEFAULT_PRICE_LIST_DATA, status: "attiva", effectiveFrom: "2026-01-01", version: 1 });
    as(mario);
    const m3 = structuredClone(DEFAULT_PRICE_LIST_DATA.timber.pricePerM3) as Record<string, Record<string, number>>;
    const before = m3.abete!.lamellare!;
    m3.abete!.lamellare = 68_000;
    expect((await saveDraftSection({ dataset: "listino", path: "timber.pricePerM3", value: m3, expectedUpdatedAt: null })).ok).toBe(true);
    const page = (await RegistroPage({ searchParams: { dataset: "listino", utente: mario.id } })) as { props: { children: unknown[] } };
    const log = (page.props.children as { props: Record<string, unknown> }[])[1]!.props as { entries: { action: string; user: string; diff: unknown[] }[] };
    expect(log.entries[0]).toMatchObject({ action: "salva", user: "Mario Rossi", diff: [{ path: "timber.pricePerM3.abete.lamellare", before, after: 68_000 }] });
    expect(log.entries.every((e) => e.user === "Mario Rossi")).toBe(true);
  });
});
