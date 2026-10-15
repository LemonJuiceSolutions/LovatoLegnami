import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { seedDatabase } from "@/db/seed";
import { freshDb } from "@/server/repositories/__tests__/helpers";
import { resetEnvCache } from "@/server/env";
import { blacklistedKeys, EstimateResponseSchema } from "@/server/public-dto";
import { invalidatePublicCatalog } from "@/server/quotes/catalog";
import { resetRateLimits } from "@/server/rate-limit";
import { defaultConfig, serializeConfig } from "@/stores";
import { handleEstimatePost, handleRulesGet } from "../estimate";

const config = (slug = "autoportante-bifalda") => JSON.parse(serializeConfig(defaultConfig(slug)));

const post = (body: unknown, headers: Record<string, string> = {}) =>
  handleEstimatePost(
    new Request("http://localhost/api/preventivo/stima", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const bifalda = () => ({
  config: config(),
  declared: { access: "facile", cap: "37026" },
  commercial: { species: "abete", quality: "lamellare", treatment: "impregnante-incolore", covering: "policarbonato-alveolare" },
});

beforeAll(async () => {
  await freshDb();
  await seedDatabase();
  invalidatePublicCatalog();
});
beforeEach(() => resetRateLimits());
afterAll(() => {
  delete process.env.RATE_LIMIT_ESTIMATE;
  resetEnvCache();
  return closeDb();
});

describe("POST /api/preventivo/stima (8.5)", () => {
  it("bifalda di default: vista cliente valida, nessuna chiave interna, < 500 ms", async () => {
    await post(bifalda()); // riscaldamento (catalogo in cache)
    const t0 = performance.now();
    const res = await post(bifalda());
    const elapsed = performance.now() - t0;
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(EstimateResponseSchema.safeParse(body).success).toBe(true);
    expect(blacklistedKeys(body)).toEqual([]);
    const text = JSON.stringify(body).toLowerCase();
    for (const w of ["margine", "€/h", "tariffa", "sfrido", "kerf"]) expect(text).not.toContain(w);
    expect(body.quote.status).toBe("completo");
    expect(body.quote.totalCents).toBeGreaterThan(300_000);
    expect(elapsed).toBeLessThan(500);
  });

  it("config non valida → 400 con il percorso del campo", async () => {
    const bad = bifalda();
    bad.config.params.larghezza = 999_999;
    const res = await post(bad);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues.map((i: { path: string }) => i.path)).toContain("config.params.larghezza");
    expect(JSON.stringify(body)).not.toMatch(/at \w+ \(|node_modules|\.ts:/);

    const neg = bifalda();
    neg.config.envelope.box.height = -5;
    expect((await (await post(neg)).json()).issues[0].path).toBe("config.envelope.box.height");
  });

  it("tipologia non visibile, finiture non a listino, chiavi in più, JSON rotto, tipo sbagliato → 4xx", async () => {
    expect((await post({ ...bifalda(), config: config("gazebo-padiglione") })).status).toBe(400);
    const r = await post({ ...bifalda(), commercial: { species: "teak", quality: "lamellare" } });
    expect((await r.json()).issues).toEqual([{ path: "commercial.species", message: "specie non disponibile" }]);
    expect((await post({ ...bifalda(), assembly: { pieces: [] } })).status).toBe(400);
    expect((await post("{non json")).status).toBe(400);
    expect((await post(bifalda(), { "content-type": "text/plain" })).status).toBe(415);
    expect((await post("x".repeat(70_000))).status).toBe(413);
  });

  it("sezioni sotto regola inviate dal client: il server le riadegua prima del prezzo", async () => {
    const tampered = bifalda();
    tampered.config.params.sezioneTravetto = "60×80";
    const res = await post(tampered);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes.join(" ")).toMatch(/sezioni del legno sono state adeguate/);
  });

  it("parametri incompatibili tra loro → 422 senza il dettaglio interno del dominio", async () => {
    const tampered = bifalda();
    tampered.config.params.sezioneTrave = "60×80";
    tampered.config.params.sezioneColmo = "60×80";
    const res = await post(tampered);
    expect(res.status).toBe(422);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("non realizzabile");
    expect(text).not.toMatch(/mortasa|Giunto|TRV-/);
  });

  it("rate limit: oltre il limite per IP → 429 con Retry-After", async () => {
    process.env.RATE_LIMIT_ESTIMATE = "3/60";
    resetEnvCache();
    try {
      for (let i = 0; i < 3; i++) expect((await post(bifalda(), { "x-forwarded-for": "203.0.113.50" })).status).toBe(200);
      const res = await post(bifalda(), { "x-forwarded-for": "203.0.113.50" });
      expect(res.status).toBe(429);
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      expect((await post(bifalda(), { "x-forwarded-for": "203.0.113.51" })).status).toBe(200);
    } finally {
      delete process.env.RATE_LIMIT_ESTIMATE;
      resetEnvCache();
    }
  });
});

describe("GET /api/preventivo/regole (8.5)", () => {
  it("restituisce il set di regole attivo", async () => {
    const res = await handleRulesGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(1);
    expect(body.ruleSet.rules.length).toBeGreaterThan(3);
  });
});
