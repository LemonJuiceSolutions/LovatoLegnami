import { describe, expect, it } from "vitest";
import { generate, getPreset, listTypologies, loadPreset as loadDomainPreset, PRESET_CATALOG } from "@/domain";
import { buildDistinta } from "@/export/csv";
import { ConfigFileSchema, parseConfigFile, serializeConfig } from "./config-file";
import { computeDerived, defaultConfig, hiddenParamNames, presetConfig } from "./config";
import { createConfiguratoreStore, selectHardwareRows, selectHiddenParams } from "./configuratore-store";
import { EXAMPLES, exampleConfig } from "./examples";

/** Store con le tipologie estese (task 10.1 di `tipologie-estese`). */

describe("store – preset commerciali", () => {
  it('loadPreset("maxi-5x5") → portale-sandwich con i parametri del preset e assieme rigenerato', () => {
    const store = createConfiguratoreStore();
    const before = store.getState().derived.assembly;
    store.getState().selectPieces(["PIL-01"]);
    expect(store.getState().loadPreset("maxi-5x5")).toEqual({ ok: true });
    const { config, derived, selection } = store.getState();
    const preset = getPreset("maxi-5x5");
    expect(config.typology).toBe("portale-sandwich");
    for (const [name, value] of Object.entries(preset.params)) expect(config.params[name]).toEqual(value);
    expect(config.params).toEqual(loadDomainPreset("maxi-5x5").params);
    expect(derived.assembly).not.toBe(before);
    expect(derived.assembly?.typologySlug).toBe("portale-sandwich");
    expect(derived.assembly?.params.larghezza).toBe(preset.params.larghezza);
    expect(derived.stale).toBe(false);
    expect(derived.error).toBeNull();
    expect(selection).toEqual([]);
  });

  it("l'ingombro del preset entra nello store; senza ingombro quello di default allargato all'assieme", () => {
    const store = createConfiguratoreStore();
    store.getState().setExportOption("producer", "CAM X");
    store.getState().loadPreset("libera-4x6");
    expect(store.getState().config.envelope).toEqual(loadDomainPreset("libera-4x6").envelope);
    expect(store.getState().config.envelope.obstacles.map((o) => o.id)).toEqual(["OST-01"]);
    expect(store.getState().config.exportOptions.sat.producer).toBe("CAM X");
    expect(store.getState().derived.collisions).toEqual([]);
    store.getState().loadPreset("maxi-5x5");
    expect(getPreset("maxi-5x5").envelope).toBeUndefined();
    expect(store.getState().config.envelope.box.width).toBeGreaterThanOrEqual(5000);
    expect(store.getState().derived.collisions).toEqual([]);
  });

  it("id sconosciuto → errore e stato invariato", () => {
    const store = createConfiguratoreStore();
    const config = store.getState().config;
    const r = store.getState().loadPreset("piramide");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/preset non trovato/);
    expect(store.getState().config).toBe(config);
  });

  it.each(PRESET_CATALOG.map((p) => p.id))("%s: presetConfig genera senza errori di parametri né di generazione", (id) => {
    const derived = computeDerived(presetConfig(id));
    expect(derived.error).toBeNull();
    expect(derived.paramErrors).toEqual({});
    expect(derived.violations.filter((v) => v.severity === "errore")).toEqual([]);
  });

  it("examples.ts include tutti i preset del dominio (gli esempi MVP per primi), con fonte e note", () => {
    expect(EXAMPLES.slice(0, 2).map((e) => e.id)).toEqual(["monofalda-grondaia", "bifalda-libera"]);
    expect(EXAMPLES.map((e) => e.id).sort()).toEqual(PRESET_CATALOG.map((p) => p.id).sort());
    const maxi = EXAMPLES.find((e) => e.id === "maxi-5x5")!;
    expect(maxi.name).toBe("MAXI 5×5");
    expect(maxi.typologySlug).toBe("portale-sandwich");
    expect(maxi.source).toBe(getPreset("maxi-5x5").source);
    expect(maxi.notes).toEqual(getPreset("maxi-5x5").notes);
    expect(ConfigFileSchema.safeParse(maxi.file).success).toBe(true);
    expect(exampleConfig("maxi-5x5")).toEqual(presetConfig("maxi-5x5"));
    expect(exampleConfig("libera-4x6")).toEqual(presetConfig("libera-4x6"));
  });
});

describe("store – parametri enum e cambio tipologia", () => {
  it("costruzione compatibile conservata al cambio tipologia", () => {
    const store = createConfiguratoreStore({ initialConfig: defaultConfig("portale-sandwich") });
    store.getState().setParam("costruzione", "carpenteria");
    expect(store.getState().setTypology("addossata-sandwich")).toEqual({ ok: true });
    expect(store.getState().config.params.costruzione).toBe("carpenteria");
    expect(store.getState().derived.assembly?.params.costruzione).toBe("carpenteria");
    store.getState().setTypology("gazebo-padiglione");
    expect(store.getState().config.params.costruzione).toBe("carpenteria");
  });

  it("enum con valore non tra le opzioni della nuova tipologia → default", () => {
    const store = createConfiguratoreStore({ initialConfig: defaultConfig("portale-sandwich") });
    store.getState().setParam("forma", "monofalda");
    store.getState().setTypology("telaio-giunti");
    expect(store.getState().config.params.forma).toBe("piana");
    const store2 = createConfiguratoreStore({ initialConfig: defaultConfig("addossata-sandwich") });
    store2.getState().setParam("attaccoMuro", "listoni-paralleli");
    store2.getState().setTypology("a-elle");
    expect(store2.getState().config.params.attaccoMuro).toBe("staffa-inclinata-15");
  });

  it("enum fuori opzioni: errore inline con le opzioni, assieme non rigenerato", () => {
    const store = createConfiguratoreStore({ initialConfig: defaultConfig("portale-sandwich") });
    const before = store.getState().derived.assembly;
    store.getState().setParam("costruzione", "saldata");
    expect(store.getState().derived.paramErrors.costruzione).toMatch(/bullonata/);
    expect(store.getState().derived.assembly).toBe(before);
  });

  it("ConfigFileSchema accetta i parametri enum (stringhe), schemaVersion invariato", () => {
    const store = createConfiguratoreStore();
    store.getState().loadPreset("libera-4x6");
    store.getState().setParam("costruzione", "carpenteria");
    const config = store.getState().config;
    const json = JSON.parse(serializeConfig(config));
    expect(json.schemaVersion).toBe(1);
    expect(json.params.costruzione).toBe("carpenteria");
    expect(ConfigFileSchema.safeParse(json).success).toBe(true);
    expect(parseConfigFile(json)).toEqual(config);
    expect(() => parseConfigFile({ ...json, params: { ...json.params, costruzione: "saldata" } })).toThrow(/configurazione non valida/);
  });
});

describe("store – ferramenta e visibilità", () => {
  it("derived.hardwareRows = tabella ferramenta di buildDistinta, selettore stabile", () => {
    const store = createConfiguratoreStore();
    expect(store.getState().derived.hardwareRows).toEqual([]);
    store.getState().loadPreset("libera-4x6");
    const { derived } = store.getState();
    expect(derived.hardwareRows).toEqual(buildDistinta(derived.assembly!).hardwareRows);
    expect(derived.hardwareRows.find((r) => r.code === "bullone-m12x200")?.quantity).toBe(12);
    expect(selectHardwareRows(store.getState())).toBe(derived.hardwareRows);
    store.getState().setParam("costruzione", "carpenteria");
    expect(store.getState().derived.hardwareRows.some((r) => r.kind === "bullone")).toBe(false);
  });

  it("hardwareRows restano coerenti con l'assieme mantenuto quando un parametro non è valido", () => {
    const store = createConfiguratoreStore();
    store.getState().loadPreset("libera-4x6");
    const rows = store.getState().derived.hardwareRows;
    store.getState().setParam("larghezza", -1);
    expect(store.getState().derived.stale).toBe(true);
    expect(store.getState().derived.hardwareRows).toBe(rows);
  });

  it("parametri nascosti da visibleWhen: testaPilastro nascosto con forma piana, valore conservato", () => {
    const store = createConfiguratoreStore({ initialConfig: defaultConfig("portale-sandwich") });
    store.getState().setParams({ forma: "monofalda", direzionePendenza: "larghezza", testaPilastro: "inclinata" });
    expect(selectHiddenParams(store.getState())).not.toContain("testaPilastro");
    store.getState().setParam("forma", "piana");
    const hidden = selectHiddenParams(store.getState());
    expect(hidden).toContain("testaPilastro");
    expect(selectHiddenParams(store.getState())).toBe(hidden);
    expect(store.getState().config.params.testaPilastro).toBe("inclinata");
    // con un parametro non valido la visibilità usa comunque i valori ammessi
    store.getState().setParam("larghezza", -1);
    expect(hiddenParamNames(store.getState().config)).toContain("testaPilastro");
  });

  it("ogni tipologia di default: hiddenParamNames sono parametri del template", () => {
    for (const t of listTypologies()) {
      const names = new Set(t.params.map((p) => p.name));
      for (const n of hiddenParamNames(defaultConfig(t.slug))) expect(names.has(n)).toBe(true);
    }
    expect(generate("portale-sandwich").params.forma).toBe("piana");
  });
});
