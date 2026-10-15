import { describe, expect, it } from "vitest";
import { parseEnvelope, type TaglioTesta } from "@/domain";
import { parseConfigFile, serializeConfig } from "./config-file";
import { computeDerived, defaultConfig } from "./config";
import { createConfiguratoreStore } from "./configuratore-store";

const rad = (d: number) => (d * Math.PI) / 180;
const rise = 6000 * Math.tan(rad(5));
/** Ingombro di default della monofalda con il muro posteriore a 5° (si allontana verso destra). */
const input = {
  box: { width: 6000, depth: 3600 + rise, height: 4000 }, // verso destra i travetti salgono di più
  plan: { corners: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 3600 + rise }, { x: 0, y: 3600 }] as const },
};
const skewed = parseEnvelope(input);

describe("configurazione con pianta fuori squadra", () => {
  it("monofalda con muro a 5° nello store → assieme con tagli composti, senza collisioni", () => {
    const store = createConfiguratoreStore();
    store.getState().setEnvelope(input);
    const { assembly, collisions, error } = store.getState().derived;
    expect(error).toBeNull();
    expect(collisions).toEqual([]);
    const tvt = assembly!.pieces.filter((p) => p.type === "travetto");
    for (const p of tvt) {
      const cut = p.machinings.filter((m): m is TaglioTesta => m.type === "taglio-testa").at(-1)!;
      expect(Math.abs(cut.angle2 ?? 0)).toBeGreaterThan(5);
    }
    // senza pianta lo stesso store torna all'assieme di sempre
    const plain = computeDerived(defaultConfig()).assembly!;
    expect(plain.pieces.filter((p) => p.type === "travetto").every((p) => p.machinings.every((m) => m.type !== "taglio-testa" || m.angle2 === undefined))).toBe(true);
  });

  it("file JSON con `plan` → round-trip (schemaVersion invariata)", () => {
    const config = { ...defaultConfig(), envelope: skewed };
    const json = serializeConfig(config);
    expect(JSON.parse(json).schemaVersion).toBe(1);
    expect(JSON.parse(json).envelope.plan.corners).toHaveLength(4);
    const back = parseConfigFile(json);
    expect(back).toEqual(config);
    expect(serializeConfig(back)).toBe(json);
    // file esistenti senza pianta: invariati
    expect("plan" in parseConfigFile(serializeConfig(defaultConfig())).envelope).toBe(false);
  });

  it("pianta non valida nel file → errore con il percorso dell'angolo", () => {
    const bad = JSON.parse(serializeConfig({ ...defaultConfig(), envelope: skewed }));
    bad.envelope.plan.corners[2] = { x: 3000, y: 1000 };
    expect(() => parseConfigFile(bad)).toThrow(/envelope\.plan\.corners\[2\]: angolo posteriore destro rientrante/);
  });
});
