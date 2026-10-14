import { describe, expect, it } from "vitest";
import { getTypology } from "@/domain";
import {
  createConfiguratoreStore,
  selectErrors,
  selectNeedsExportConfirmation,
  selectWarnings,
} from "./configuratore-store";
import { defaultConfig } from "./config";

describe("store configuratore – config e derived", () => {
  it("stato iniziale: monofalda di default, schemaVersion 1, assieme senza errori né collisioni", () => {
    const store = createConfiguratoreStore();
    const { config, derived } = store.getState();
    expect(config.schemaVersion).toBe(1);
    expect(config.typology).toBe("addossata-monofalda");
    expect(config.exportOptions.sat.version).toBe("7.0");
    expect(derived.assembly?.typologySlug).toBe("addossata-monofalda");
    expect(derived.stale).toBe(false);
    expect(selectErrors(store.getState())).toEqual([]);
    expect(derived.collisions).toEqual([]);
    expect(selectNeedsExportConfirmation(store.getState())).toBe(false);
  });

  it("cambiare un parametro aggiorna derived (assieme rigenerato)", () => {
    const store = createConfiguratoreStore();
    const before = store.getState().derived.assembly!;
    const width = (a: typeof before) => Math.max(...a.pieces.filter((p) => p.type === "trave").map((p) => p.length));
    store.getState().setParam("larghezza", 5000);
    const after = store.getState().derived.assembly!;
    expect(after).not.toBe(before);
    expect(after.params.larghezza).toBe(5000);
    expect(width(after)).toBeLessThan(width(before));
  });

  it("valore fuori limite: errore per parametro e assieme non rigenerato", () => {
    const store = createConfiguratoreStore();
    const before = store.getState().derived.assembly;
    store.getState().setParam("pendenza", 50);
    const { config, derived } = store.getState();
    expect(config.params.pendenza).toBe(50);
    expect(derived.paramErrors.pendenza).toMatch(/\[3, 45\]/);
    expect(derived.assembly).toBe(before);
    expect(derived.stale).toBe(true);
    store.getState().setParam("pendenza", 20);
    expect(store.getState().derived.paramErrors).toEqual({});
    expect(store.getState().derived.stale).toBe(false);
  });

  it("il cambio tipologia conserva larghezza (e i parametri comuni), i nuovi prendono il default", () => {
    const store = createConfiguratoreStore();
    store.getState().setParams({ larghezza: 5500, pendenza: 12 });
    expect(store.getState().setTypology("autoportante-bifalda")).toEqual({ ok: true });
    const { config, derived } = store.getState();
    expect(config.typology).toBe("autoportante-bifalda");
    expect(config.params.larghezza).toBe(5500);
    expect(config.params.pendenza).toBe(12);
    expect(config.params.sezioneColmo).toBe(getTypology("autoportante-bifalda").params.find((p) => p.name === "sezioneColmo")!.default);
    expect(config.params).not.toHaveProperty("passoFori");
    expect(derived.assembly?.typologySlug).toBe("autoportante-bifalda");
    // tipologia sconosciuta → stato invariato
    const r = store.getState().setTypology("piramide");
    expect(r.ok).toBe(false);
    expect(store.getState().config.typology).toBe("autoportante-bifalda");
  });

  it("parametro comune non ammesso dalla nuova tipologia torna al default", () => {
    const store = createConfiguratoreStore({ initialConfig: defaultConfig("autoportante-bifalda") });
    store.getState().setParam("pendenza", 34);
    store.getState().setParam("larghezza", 999999); // fuori limite: non viene portato
    store.getState().setTypology("addossata-monofalda");
    const p = store.getState().config.params;
    expect(p.pendenza).toBe(34);
    expect(p.larghezza).toBe(defaultConfig().params.larghezza);
  });

  it("ostacoli: aggiunta con id automatico, modifica, rimozione; considerati nelle collisioni", () => {
    const store = createConfiguratoreStore();
    const added = store.getState().addObstacle({ type: "grondaia", side: "posteriore", elevation: 2950, height: 400 });
    expect(added).toMatchObject({ ok: true, id: "OST-01" });
    const env = () => store.getState().config.envelope;
    expect(env().obstacles[0]).toMatchObject({ id: "OST-01", projection: 150 });
    expect(store.getState().derived.collisions.some((c) => c.obstacleId === "OST-01")).toBe(true);

    expect(store.getState().updateObstacle("OST-01", { elevation: 3620, height: 50 }).ok).toBe(true);
    expect(env().obstacles[0].elevation).toBe(3620);
    expect(store.getState().derived.collisions.filter((c) => c.obstacleId === "OST-01")).toEqual([]);

    const bad = store.getState().updateObstacle("OST-01", { height: -1 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues[0].path).toBe("obstacles[0].height");
    expect(env().obstacles[0].height).toBe(50);
    expect(store.getState().updateObstacle("OST-99", {}).ok).toBe(false);

    expect(store.getState().addObstacle({ type: "finestra", side: "sinistro", height: 1000 })).toMatchObject({ id: "OST-02" });
    store.getState().removeObstacle("OST-01");
    expect(env().obstacles.map((o) => o.id)).toEqual(["OST-02"]);
  });

  it("pavimento, box, affondamento e opzioni export: validati, aggiornano derived", () => {
    const store = createConfiguratoreStore();
    const pillarLengths = () => store.getState().derived.assembly!.pieces.filter((p) => p.type === "pilastro").map((p) => p.length);
    const flat = pillarLengths();
    expect(store.getState().setFloor({ corners: { frontLeft: -100 } }).ok).toBe(true);
    expect(store.getState().config.envelope.floor.corners).toMatchObject({ frontLeft: -100, frontRight: 0 });
    expect(pillarLengths()[0]).toBeGreaterThan(flat[0]);

    expect(store.getState().setEmbedment(200).ok).toBe(true);
    expect(pillarLengths()[0]).toBeGreaterThan(flat[0] + 200);
    expect(store.getState().setEmbedment(-5).ok).toBe(false);

    const box = store.getState().setBox({ height: 0 });
    expect(box.ok).toBe(false);
    if (!box.ok) expect(box.issues[0].path).toBe("box.height");
    expect(store.getState().setBox({ height: 2000 }).ok).toBe(true);
    expect(store.getState().derived.collisions.length).toBeGreaterThan(0);
    expect(selectNeedsExportConfirmation(store.getState())).toBe(true);

    expect(store.getState().setExportOption("version", "21.0").ok).toBe(true);
    expect(store.getState().config.exportOptions.sat.version).toBe("21.0");
    const wrong = store.getState().setExportOption("version", "9.9" as never);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.issues[0].path).toBe("exportOptions.sat.version");
  });

  it("selettori con riferimenti stabili finché derived non cambia; loadConfig e resetConfig", () => {
    const store = createConfiguratoreStore();
    const s = store.getState();
    expect(selectWarnings(s)).toBe(selectWarnings(store.getState()));
    store.getState().loadConfig(defaultConfig("autoportante-bifalda"));
    expect(store.getState().derived.assembly?.typologySlug).toBe("autoportante-bifalda");
    store.getState().resetConfig();
    expect(store.getState().config).toEqual(defaultConfig());
  });
});
