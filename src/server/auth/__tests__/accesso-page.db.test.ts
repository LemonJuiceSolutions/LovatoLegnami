import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { freshDb, makeUser } from "@/server/repositories/__tests__/helpers";

/**
 * Pagina `/accesso` con un cookie di sessione "orfano" (correzione A del gruppo 12): un JWT
 * valido di un utente inesistente o disattivato non deve reindirizzare all'area interna,
 * perché il layout dell'area rilegge il database e rimanderebbe qui (ciclo infinito).
 */

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/server/auth/auth", () => ({ auth: async () => session.current }));
vi.mock("@/server/actions/auth", () => ({ requestSignIn: async () => undefined }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

const { default: AccessoPage } = await import("@/app/(auth)/accesso/page");
const { currentUser, requirePageUser } = await import("@/server/auth");

afterAll(() => closeDb());
const as = (id: string | null) => {
  session.current = id ? { user: { id, email: "x@lovato.it" } } : null;
};
const text = (node: unknown): string => JSON.stringify(node);

describe("/accesso con sessione non più valida (correzione A)", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("utente valido ⇒ redirect alla destinazione", async () => {
    const u = await makeUser("admin@lovato.it", "admin");
    as(u.id);
    await expect(AccessoPage({ searchParams: { next: "/admin" } })).rejects.toThrow("NEXT_REDIRECT /admin");
    expect((await currentUser())?.id).toBe(u.id);
  });

  it("JWT di un utente inesistente ⇒ form di accesso con l'avviso, nessun redirect (niente ciclo)", async () => {
    as("00000000-0000-0000-0000-000000000000");
    // l'area interna rimanda all'accesso…
    await expect(requirePageUser(undefined, "/admin")).rejects.toThrow("NEXT_REDIRECT /accesso?next=%2Fadmin");
    // …e l'accesso ora mostra il form invece di rimandare all'area interna
    const page = await AccessoPage({ searchParams: { next: "/admin" } });
    expect(text(page)).toContain("La sessione non è più valida: accedi di nuovo.");
    expect(await currentUser()).toBeNull();
  });

  it("utente disattivato ⇒ form di accesso", async () => {
    const u = await makeUser("ex@lovato.it", "commerciale", null, false);
    as(u.id);
    const page = await AccessoPage({ searchParams: { next: "/dashboard" } });
    expect(text(page)).toContain("accedi di nuovo");
  });

  it("anonimo ⇒ form senza avviso", async () => {
    as(null);
    const page = await AccessoPage({ searchParams: {} });
    expect(text(page)).not.toContain("non è più valida");
  });
});
