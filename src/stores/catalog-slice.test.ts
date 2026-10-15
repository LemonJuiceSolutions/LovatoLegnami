import { describe, expect, it } from "vitest";
import { DEFAULT_LOVATO_DATA, DEFAULT_PRICE_LIST_DATA } from "@/domain";
import { CATALOG_UNREACHABLE, catalogFromResponse, priceListLabel, ruleSetLabel, type ActiveDatasetsResponse } from "./catalog";
import { parseConfigFile, serializeConfig } from "./config-file";
import { createConfiguratoreStore } from "./configuratore-store";

/** Risposta dell'archivio con regole a interasse massimo `max` (v2 dal 01/06) e listino v5. */
function archive(max = 700): ActiveDatasetsResponse {
  const regole = structuredClone(DEFAULT_LOVATO_DATA) as { rules: { id: string; max?: number }[] };
  regole.rules.find((r) => r.id === "interasse-travetti-max")!.max = max;
  return {
    listino: { id: "lst-5", version: 5, effectiveFrom: "2026-06-01", data: DEFAULT_PRICE_LIST_DATA },
    regole: { id: "reg-2", version: 2, effectiveFrom: "2026-06-01", data: regole },
  };
}

const spacingErrors = (s: ReturnType<ReturnType<typeof createConfiguratoreStore>["getState"]>) =>
  s.derived.violations.filter((v) => v.ruleId === "interasse-travetti-max" && v.severity === "errore");

describe("store – catalogo dall'archivio (10.1)", () => {
  it("regole dall'archivio con interasse 700 ⇒ violazione a 750 e origine archivio", async () => {
    const store = createConfiguratoreStore();
    store.getState().setParam("interasse", 750);
    expect(spacingErrors(store.getState())).toEqual([]); // default: 800
    const catalog = await store.getState().loadCatalog(async () => archive(700));
    expect(catalog.source).toBe("archivio");
    const s = store.getState();
    expect(s.catalog).toMatchObject({ source: "archivio", error: null, loading: false, ruleSetVersion: { version: 2 } });
    expect(spacingErrors(s).length).toBeGreaterThan(0);
    // il preventivo usa il listino dell'archivio
    expect(s.derived.quote?.versionLabel).toBe("listino v5 del 2026-06-01");
    expect(s.derived.quote?.ruleSetVersion).toBe("reg-2");
    expect(priceListLabel(s.catalog.priceListVersion)).toBe("Listino v5 (dal 01/06)");
    expect(ruleSetLabel(s.catalog.ruleSetVersion)).toBe("Regole v2 (dal 01/06)");
  });

  it("fetch fallito ⇒ dati di default, origine default e avviso", async () => {
    const store = createConfiguratoreStore();
    const catalog = await store.getState().loadCatalog(async () => {
      throw new Error("HTTP 503");
    });
    expect(catalog).toMatchObject({ source: "default", error: CATALOG_UNREACHABLE, loading: false });
    expect(store.getState().catalog.ruleSetVersion).toBeNull();
    expect(store.getState().derived.quote?.versionLabel).toBe("listino v1 del 2026-01-01");
    expect(ruleSetLabel(null)).toBe("Regole di default");
  });

  it("archivio senza regole attive ⇒ listino dall'archivio, regole di default con avviso", () => {
    const c = catalogFromResponse({ ...archive(), regole: null });
    expect(c.sources).toEqual({ listino: "archivio", regole: "default" });
    expect(c.source).toBe("default");
    expect(c.error).toBe("Nessun set di regole attivo nell'archivio: in uso le regole di default.");
    const broken = catalogFromResponse({ listino: { ...archive().listino!, data: { foo: 1 } }, regole: archive().regole });
    expect(broken.error).toMatch(/listino v5 dell'archivio non è valido: in uso il listino di default/);
  });

  it("caricamenti concorrenti ⇒ una sola lettura", async () => {
    const store = createConfiguratoreStore();
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return archive();
    };
    await Promise.all([store.getState().loadCatalog(fetcher), store.getState().loadCatalog(fetcher)]);
    expect(calls).toBe(1);
  });
});

describe("store – preventivo nel derived (10.1)", () => {
  it("quote ricalcolato al cambio di larghezza, entro 300 ms", () => {
    const store = createConfiguratoreStore();
    store.getState().setParam("larghezza", 5000);
    const before = store.getState().derived;
    expect(before.quote?.status).toBeDefined();
    expect(before.siteFactors).not.toBeNull();
    const t0 = performance.now();
    store.getState().setParam("larghezza", 6000);
    const elapsed = performance.now() - t0;
    const after = store.getState().derived;
    expect(after.quote).not.toBe(before.quote);
    expect(after.quote!.totals.totalCents).toBeGreaterThan(before.quote!.totals.totalCents);
    expect(after.customerQuote!.totalCents).toBe(after.quote!.totals.totalCents);
    expect(elapsed).toBeLessThan(300);
  });

  it("le opzioni commerciali ricalcolano solo il preventivo (stesso assieme)", () => {
    const store = createConfiguratoreStore();
    const { assembly, quote } = store.getState().derived;
    expect(store.getState().setCommercial({ covering: "policarbonato-alveolare", cap: "37100" })).toEqual({ ok: true });
    const d = store.getState().derived;
    expect(d.assembly).toBe(assembly);
    expect(d.quote!.totals.totalCents).toBeGreaterThan(quote!.totals.totalCents);
    expect(d.quote!.groups.some((g) => g.category === "copertura")).toBe(true);
    const bad = store.getState().setCommercial({ cap: "123" });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.issues[0].path).toBe("commercial.cap");
    expect(store.getState().config.commercial?.cap).toBe("37100");
  });

  it("round-trip del JSON con commercial", () => {
    const store = createConfiguratoreStore();
    store.getState().setCommercial({ species: "larice", treatment: "impregnante-tinta", access: "difficile", anchoring: "muro", cap: "37026" });
    const { config } = store.getState();
    const text = serializeConfig(config);
    expect(JSON.parse(text).commercial).toEqual({
      species: "larice",
      quality: "lamellare",
      treatment: "impregnante-tinta",
      covering: null,
      access: "difficile",
      anchoring: "muro",
      cap: "37026",
    });
    expect(parseConfigFile(text)).toEqual(config);
    // senza commercial il file resta quello di prima
    const plain = createConfiguratoreStore().getState().config;
    expect(JSON.parse(serializeConfig(plain))).not.toHaveProperty("commercial");
    expect(parseConfigFile(serializeConfig(plain))).toEqual(plain);
  });
});
