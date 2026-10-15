import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { datasetVersions } from "@/db/schema";
import { DEFAULT_PRICE_LIST, DEFAULT_PRICE_LIST_DATA } from "@/domain/pricing/data/default-listino";
import { PRESET_CATALOG } from "@/domain/presets/catalog";
import { defaultTypologySettings } from "@/domain/site/typology-settings";
import { freshDb, makeUser } from "@/server/repositories/__tests__/helpers";
import { createMemoryStorage, setFileStorage } from "@/server/storage/storage";

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/server/auth/auth", () => ({ auth: async () => session.current }));

const { saveDraftSection } = await import("../datasets");
const { publishDataset } = await import("../publish");
const repo = await import("@/server/repositories/datasets");
const { startingPrice } = await import("@/server/admin/starting-price");
const { handleSiteImageUpload } = await import("@/server/routes/site-image-upload");
const { handleSiteImageGet } = await import("@/server/routes/site-images");

afterAll(() => closeDb());
const as = (u: { id: string } | null) => {
  session.current = u ? { user: { id: u.id, email: "x" } } : null;
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const uploadReq = (bytes: Uint8Array, name = "a.png") => {
  const body = new FormData();
  body.set("file", new File([bytes as Uint8Array<ArrayBuffer>], name));
  return new Request("http://localhost/api/admin/immagini", { method: "POST", body });
};

describe("tipologie e preset (9.7)", () => {
  let admin: { id: string };
  let lucia: { id: string };

  beforeEach(async () => {
    await freshDb();
    admin = await makeUser("admin@lovato.it", "admin", "Admin");
    lucia = await makeUser("lucia@lovato.it", "ufficio-tecnico", "Lucia");
    await repo.createVersion({ dataset: "listino", data: DEFAULT_PRICE_LIST_DATA, status: "attiva", effectiveFrom: "2026-01-01", version: 1 });
    await repo.createVersion({ dataset: "tipologie", data: defaultTypologySettings(), status: "attiva", effectiveFrom: "2026-01-01", version: 1 });
    await repo.createVersion({ dataset: "preset", data: PRESET_CATALOG, status: "attiva", effectiveFrom: "2026-01-01", version: 1 });
    as(admin);
  });

  it("slug SEO duplicato: salvataggio rifiutato e pubblicazione di una bozza duplicata rifiutata", async () => {
    const dup = defaultTypologySettings().map((t, i) => (i === 1 ? { ...t, seoSlug: defaultTypologySettings()[0]!.seoSlug } : t));
    const saved = await saveDraftSection({ dataset: "tipologie", path: "", value: dup, expectedUpdatedAt: null });
    expect(saved).toMatchObject({ ok: false, status: 400 });
    expect(!saved.ok && saved.message).toMatch(/\[1\]\.seoSlug: slug SEO duplicato/);
    // bozza duplicata scritta senza passare dalla validazione (es. versione vecchia dello schema)
    const ok = await saveDraftSection({ dataset: "tipologie", path: "", value: defaultTypologySettings(), expectedUpdatedAt: null });
    expect(ok.ok).toBe(true);
    const draft = (await repo.getDraft("tipologie"))!;
    await (await getDb()).update(datasetVersions).set({ data: dup }).where(eq(datasetVersions.id, draft.id));
    const res = await publishDataset({ dataset: "tipologie", effectiveFrom: "2026-01-01", notes: null, expectedUpdatedAt: draft.updatedAt.toISOString() });
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(!res.ok && res.message).toMatch(/slug SEO duplicato/);
    expect((await repo.getActive("tipologie"))!.version).toBe(1);
  });

  it("preset di riferimento inesistente ⇒ pubblicazione rifiutata; esistente ⇒ pubblicata", async () => {
    const withRef = (id: string) => defaultTypologySettings().map((t) => (t.slug === "autoportante-bifalda" ? { ...t, referencePresetId: id } : t));
    expect((await saveDraftSection({ dataset: "tipologie", path: "", value: withRef("preset-fantasma"), expectedUpdatedAt: null })).ok).toBe(true);
    let lock = (await repo.getDraft("tipologie"))!.updatedAt.toISOString();
    expect(await publishDataset({ dataset: "tipologie", effectiveFrom: "2026-01-01", notes: null, expectedUpdatedAt: lock })).toEqual({
      ok: false,
      status: 409,
      message: "pubblicazione rifiutata: preset di riferimento inesistenti: autoportante-bifalda → preset-fantasma",
    });
    const ref = PRESET_CATALOG.find((p) => p.typologySlug === "autoportante-bifalda")!;
    expect((await saveDraftSection({ dataset: "tipologie", path: "", value: withRef(ref.id), expectedUpdatedAt: lock })).ok).toBe(true);
    lock = (await repo.getDraft("tipologie"))!.updatedAt.toISOString();
    expect(await publishDataset({ dataset: "tipologie", effectiveFrom: "2026-01-01", notes: null, expectedUpdatedAt: lock })).toMatchObject({ ok: true, data: { version: 2 } });
    // il preset usato come riferimento non può più essere tolto
    as(lucia);
    expect((await saveDraftSection({ dataset: "preset", path: "", value: PRESET_CATALOG.filter((p) => p.id !== ref.id), expectedUpdatedAt: null })).ok).toBe(true);
    const plock = (await repo.getDraft("preset"))!.updatedAt.toISOString();
    const res = await publishDataset({ dataset: "preset", effectiveFrom: "2026-01-01", notes: null, expectedUpdatedAt: plock });
    expect(!res.ok && res.message).toMatch(new RegExp(`preset usati come riferimento dalle tipologie: ${ref.id}`));
    // prezzo "a partire da"
    const price = startingPrice(ref, DEFAULT_PRICE_LIST, { id: "v1", version: 1, effectiveFrom: "2026-01-01", status: "attiva" });
    expect(price?.label).toMatch(/^a partire da \d{1,3}(\.\d{3})*,00\s€$/);
  });

  it("preset: l'ufficio tecnico modifica descrizione e visibilità, il commerciale no", async () => {
    as(lucia);
    const next = PRESET_CATALOG.map((p, i) => (i === 0 ? { ...p, description: "La più richiesta", visible: false } : p));
    expect((await saveDraftSection({ dataset: "preset", path: "", value: next, expectedUpdatedAt: null })).ok).toBe(true);
    expect((await repo.getDraft("preset"))!.data[0]).toMatchObject({ description: "La più richiesta", visible: false });
    as(await makeUser("mario@lovato.it", "commerciale"));
    const lock = (await repo.getDraft("preset"))!.updatedAt.toISOString();
    expect(await saveDraftSection({ dataset: "preset", path: "", value: PRESET_CATALOG, expectedUpdatedAt: lock })).toMatchObject({ ok: false, status: 403 });
  });

  it("immagini del sito: caricamento solo admin, tipo dai magic bytes, servite solo le chiavi sito/", async () => {
    const storage = createMemoryStorage();
    setFileStorage(storage);
    try {
      as(lucia);
      expect((await handleSiteImageUpload(uploadReq(PNG))).status).toBe(403);
      as(admin);
      const svg = await handleSiteImageUpload(uploadReq(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"), "x.png"));
      expect(svg.status).toBe(400);
      const res = await handleSiteImageUpload(uploadReq(PNG));
      expect(res.status).toBe(201);
      const { src } = (await res.json()) as { src: string };
      expect(src).toMatch(/^\/api\/immagini\/[A-Za-z0-9_-]{32}$/);
      const got = await handleSiteImageGet(src.split("/").pop()!);
      expect(got.status).toBe(200);
      expect(got.headers.get("content-type")).toBe("image/png");
      expect(got.headers.get("x-content-type-options")).toBe("nosniff");
      // una foto di un cliente con lo stesso formato di id non è raggiungibile da qui
      const fotoId = "A".repeat(32);
      await storage.put(`foto/${fotoId}`, PNG, "image/png");
      expect((await handleSiteImageGet(fotoId)).status).toBe(404);
      expect((await handleSiteImageGet("../foto/x")).status).toBe(404);
    } finally {
      setFileStorage(undefined);
    }
  });
});
