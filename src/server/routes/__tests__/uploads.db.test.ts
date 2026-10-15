import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { createLeadWithQuote } from "@/server/repositories/leads";
import { issueCustomerToken } from "@/server/repositories/tokens";
import { freshDb, makeUser } from "@/server/repositories/__tests__/helpers";
import { createMemoryStorage, setFileStorage } from "@/server/storage/storage";
import { storeImages } from "@/server/storage/uploads";
import { validatePhotos } from "@/server/storage/images";
import { JPEG } from "@/server/storage/__tests__/fixtures";

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/server/auth/auth", () => ({ auth: async () => session.current }));

const { handleUploadGet } = await import("../uploads");

afterAll(() => {
  setFileStorage(undefined);
  return closeDb();
});

async function leadWithPhoto(name: string) {
  const [photo] = await storeImages(validatePhotos([{ name: "a.jpg", bytes: JPEG }]), "foto");
  const { lead } = await createLeadWithQuote({
    customer: { name, email: "a@esempio.it" },
    consent: { text: "x", version: "1", acceptedAt: new Date().toISOString() },
    photos: [photo],
    quote: { config: {}, quote: {}, totalCents: 1 },
  });
  const { token } = await issueCustomerToken(lead.id);
  return { lead, photo: photo!, token };
}

const get = (id: string, t?: string) => handleUploadGet(new Request(`http://localhost/api/uploads/${id}${t ? `?t=${t}` : ""}`), id);

describe("GET /api/uploads/[id] (8.2)", () => {
  beforeEach(async () => {
    await freshDb();
    setFileStorage(createMemoryStorage());
    session.current = null;
  });

  it("cliente con il token della richiesta → immagine con intestazioni sicure", async () => {
    const { photo, token } = await leadWithPhoto("Anna");
    const res = await get(photo.id, token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
  });

  it("token di un'altra richiesta, token inventato, id inesistente → 404", async () => {
    const a = await leadWithPhoto("Anna");
    const b = await leadWithPhoto("Bruno");
    expect((await get(a.photo.id, b.token)).status).toBe(404);
    expect((await get(a.photo.id, "x".repeat(43))).status).toBe(404);
    expect((await get("y".repeat(32), a.token)).status).toBe(404);
    expect((await get("../../etc/passwd", a.token)).status).toBe(404);
  });

  it("senza token: anonimo 401, utente interno 200", async () => {
    const { photo } = await leadWithPhoto("Anna");
    expect((await get(photo.id)).status).toBe(401);
    const u = await makeUser("mario@lovato.it", "commerciale");
    session.current = { user: { id: u.id, email: u.email, role: "commerciale" } };
    expect((await get(photo.id)).status).toBe(200);
  });
});
