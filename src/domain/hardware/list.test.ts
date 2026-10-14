import { describe, expect, it } from "vitest";
import * as domain from "..";
import { countItem } from "./expand";
import { mergeHardware } from "./list";
import type { HardwareItem } from "./types";

const joint = (id: string, code: string): HardwareItem => ({
  id,
  code,
  kind: "giunto-vie",
  description: code,
  quantity: 1,
  pieceIds: [],
  machiningIds: [],
  params: {},
});

describe("elenco ferramenta (2.5)", () => {
  it("4 giunti 3A (20 viti) + 2 giunti 4 vie (24) → una voce vite-6x40 da 128", () => {
    const items: HardwareItem[] = [];
    for (let i = 1; i <= 4; i++) items.push(joint(`GNT-0${i}`, "giunto-joint-3a-vie-90-90"), countItem("vite-6x40", 20, [`PIL-0${i}`]));
    for (let i = 5; i <= 6; i++) items.push(joint(`GNT-0${i}`, "giunto-joint-4-vie-90-90"), countItem("vite-6x40", 24, [`PIL-0${i}`]));
    const out = mergeHardware(items);
    const viti = out.filter((i) => i.kind === "vite");
    expect(viti).toHaveLength(1);
    expect(viti[0]).toMatchObject({ id: "VIT-01", code: "vite-6x40", quantity: 128, machiningIds: [] });
    expect(viti[0].pose).toBeUndefined();
    expect(viti[0].pieceIds).toEqual(["PIL-01", "PIL-02", "PIL-03", "PIL-04", "PIL-05", "PIL-06"]);
    // i giunti restano singoli, nell'ordine; la voce fusa sta alla prima occorrenza
    expect(out.map((i) => i.id)).toEqual(["GNT-01", "VIT-01", "GNT-02", "GNT-03", "GNT-04", "GNT-05", "GNT-06"]);
  });

  it("12 travetti su 3 travi → viti di appoggio 36; codici diversi → voci e id distinti", () => {
    const items: HardwareItem[] = [];
    for (let t = 1; t <= 12; t++)
      for (let b = 1; b <= 3; b++) items.push(countItem("vite-6x160", 1, [`TVT-${String(t).padStart(2, "0")}`, `TAV-0${b}`]));
    items.push(countItem("tassello-10x85", 2, ["STM-01"]), countItem("vite-8x40", 4, ["PIL-01"]));
    const out = mergeHardware(items);
    expect(out.map((i) => [i.id, i.code, i.quantity])).toEqual([
      ["VIT-01", "vite-6x160", 36],
      ["TAS-01", "tassello-10x85", 2],
      ["VIT-02", "vite-8x40", 4],
    ]);
    expect(mergeHardware(items)).toEqual(out); // deterministico
  });

  it("il modulo è esportato da @/domain", () => {
    expect(domain.mergeHardware).toBe(mergeHardware);
    expect(typeof domain.findHardware).toBe("function");
    expect(typeof domain.expandBolt).toBe("function");
    expect(domain.HARDWARE_KINDS).toContain("cuspide");
  });
});
