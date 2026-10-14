import { describe, expect, it } from "vitest";
import { ConfigFileError, ConfigFileSchema, parseConfigFile, serializeConfig } from "./config-file";
import { defaultConfig } from "./config";
import { STORAGE_KEY, createConfiguratoreStore, createPersistentConfiguratoreStore } from "./configuratore-store";

function issuesOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigFileError);
    return (e as ConfigFileError).issues;
  }
  throw new Error("nessun errore");
}

/** Storage sincrono in memoria (come localStorage). */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("file di configurazione", () => {
  it("round-trip: serialize → parse restituisce la stessa configurazione", () => {
    const store = createConfiguratoreStore();
    store.getState().setTypology("autoportante-bifalda");
    store.getState().setParam("larghezza", 5200);
    store.getState().addObstacle({ type: "grondaia", side: "posteriore", elevation: 3000, height: 120 });
    store.getState().setFloor({ corners: { backLeft: -80 }, points: [{ x: 1000, y: 1000, z: -20 }] });
    store.getState().setEmbedment(150);
    store.getState().setExportOption("fileMode", "un-file-per-pezzo");
    const config = store.getState().config;
    const text = serializeConfig(config);
    expect(JSON.parse(text).schemaVersion).toBe(1);
    expect(ConfigFileSchema.safeParse(JSON.parse(text)).success).toBe(true);
    expect(parseConfigFile(text)).toEqual(config);
    expect(serializeConfig(parseConfigFile(text))).toBe(text);
  });

  it("schemaVersion 99 → errore di versione non supportata", () => {
    const data = { ...JSON.parse(serializeConfig(defaultConfig())), schemaVersion: 99 };
    const issues = issuesOf(() => parseConfigFile(JSON.stringify(data)));
    expect(issues).toEqual([{ path: "schemaVersion", message: "versione 99 non supportata (supportate: 1)" }]);
    expect(issuesOf(() => parseConfigFile({ typology: "x" }))[0].path).toBe("schemaVersion");
  });

  it("campo errato → errore con il percorso", () => {
    const data = JSON.parse(serializeConfig(defaultConfig()));
    data.envelope.box.height = -10;
    expect(issuesOf(() => parseConfigFile(data))[0].path).toBe("envelope.box.height");

    const badParam = JSON.parse(serializeConfig(defaultConfig()));
    badParam.params.pendenza = 50;
    badParam.params.colore = "rosso";
    const issues = issuesOf(() => parseConfigFile(badParam));
    expect(issues.map((i) => i.path).sort()).toEqual(["params.colore", "params.pendenza"]);
    expect(issues.find((i) => i.path === "params.pendenza")!.message).toMatch(/\[3, 45\]/);

    const badTypology = { ...JSON.parse(serializeConfig(defaultConfig())), typology: "piramide" };
    expect(issuesOf(() => parseConfigFile(badTypology))[0].path).toBe("typology");
    expect(issuesOf(() => parseConfigFile("{ non json")).at(0)!.message).toMatch(/JSON non valido/);
    const extra = { ...JSON.parse(serializeConfig(defaultConfig())), extra: 1 };
    expect(issuesOf(() => parseConfigFile(extra)).length).toBeGreaterThan(0);
  });

  it("parametri mancanti prendono il default della tipologia", () => {
    const data = { ...JSON.parse(serializeConfig(defaultConfig())), params: { larghezza: 4000 } };
    const config = parseConfigFile(data);
    expect(config.params.larghezza).toBe(4000);
    expect(config.params.pendenza).toBe(defaultConfig().params.pendenza);
  });
});

describe("persistenza dello store", () => {
  it("salva solo config con la chiave lovato-configuratore-v1 e la ripristina in un nuovo store", () => {
    const storage = memoryStorage();
    const a = createPersistentConfiguratoreStore({ storage });
    a.getState().setParam("larghezza", 4800);
    const saved = JSON.parse(storage.data.get(STORAGE_KEY)!);
    expect(Object.keys(saved.state)).toEqual(["config"]);
    expect(saved.state.config.params.larghezza).toBe(4800);

    const b = createPersistentConfiguratoreStore({ storage });
    expect(b.getState().config).toEqual(a.getState().config);
    expect(b.getState().derived.assembly?.params.larghezza).toBe(4800);
  });

  it("configurazione salvata non valida → ignorata, resta il default", () => {
    const storage = memoryStorage({
      [STORAGE_KEY]: JSON.stringify({ state: { config: { ...defaultConfig(), schemaVersion: 99 } }, version: 1 }),
    });
    const store = createPersistentConfiguratoreStore({ storage });
    expect(store.getState().config).toEqual(defaultConfig());
  });

  it("parametro fuori limite non perde la configurazione salvata al ricaricamento", () => {
    const storage = memoryStorage();
    const a = createPersistentConfiguratoreStore({ storage });
    a.getState().setParam("larghezza", 4800);
    a.getState().setBox({ depth: 4000 });
    a.getState().setParam("pendenza", 50); // fuori limite (3–45°): errore inline
    expect(a.getState().derived.paramErrors.pendenza).toBeDefined();

    const b = createPersistentConfiguratoreStore({ storage });
    const { config, derived } = b.getState();
    expect(config.params.larghezza).toBe(4800);
    expect(config.params.pendenza).toBe(50);
    expect(config.envelope.box.depth).toBe(4000);
    expect(derived.paramErrors.pendenza).toBeDefined();
  });

  it("parametri sconosciuti nello stato salvato sono scartati, il file JSON resta rigoroso", () => {
    const bad = { ...defaultConfig(), params: { ...defaultConfig().params, inesistente: 1, pendenza: 50 } };
    expect(issuesOf(() => parseConfigFile(bad)).map((i) => i.path).sort()).toEqual(["params.inesistente", "params.pendenza"]);
    const kept = parseConfigFile(bad, { keepInvalidParams: true });
    expect(kept.params.pendenza).toBe(50);
    expect("inesistente" in kept.params).toBe(false);
  });

  it("skipHydration: ripristino solo su richiesta", async () => {
    const storage = memoryStorage();
    createPersistentConfiguratoreStore({ storage }).getState().setParam("larghezza", 4500);
    const store = createPersistentConfiguratoreStore({ storage, skipHydration: true });
    expect(store.getState().config.params.larghezza).toBe(defaultConfig().params.larghezza);
    await store.persist.rehydrate();
    expect(store.getState().config.params.larghezza).toBe(4500);
  });
});
