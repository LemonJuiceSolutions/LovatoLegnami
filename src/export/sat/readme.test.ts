import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { identity } from "@/domain/math/mat4";
import { vec3 } from "@/domain/math/vec3";
import { boxBrep } from "@/geometry/neutral-brep-box";
import { holeBoxBrep } from "./__fixtures__/breps";
import * as sat from ".";

/** Il README del modulo cita solo API, comandi e record che esistono davvero. */
const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");
const blocks = (lang: string) =>
  [...readme.matchAll(new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g"))].map((m) => m[1].trimEnd().split("\n"));
const date = new Date(2026, 9, 14, 9, 30, 0);

describe("README export SAT", () => {
  it("gli esempi di file SAT sono righe prodotte dal writer", () => {
    const [boxBlock, holeBlock] = blocks("sat");
    const boxText = sat.writeSat([{ id: "BOX-01", brep: boxBrep(vec3(0, 0, 0), vec3(10, 20, 30)), pose: identity() }], {
      date,
    }).text;
    const holeText = sat.writeSat([{ id: "FORO", brep: holeBoxBrep(), pose: identity() }], {
      date,
      includeName: false,
    }).text;
    const boxLines = new Set(boxText.split("\n"));
    const holeLines = new Set(holeText.split("\n"));
    for (const l of boxBlock) expect(boxLines.has(l), l).toBe(true);
    for (const l of holeBlock) expect(holeLines.has(l), l).toBe(true);
    // header, prima riga dei record e terminatore sono quelli veri, nell'ordine
    expect(boxBlock.slice(0, 7)).toEqual(boxText.split("\n").slice(0, 7));
    expect(boxBlock[boxBlock.length - 1]).toBe("End-of-ACIS-data");
  });

  it("le funzioni e le costanti citate sono esportate dal modulo", () => {
    const cited = [...readme.matchAll(/`([A-Za-z][A-Za-z0-9_]+)(\(|`)/g)].map((m) => m[1]);
    const api = [
      "formatSatNumber",
      "writeSat",
      "SatExportOptionsSchema",
      "DEFAULT_SAT_OPTIONS",
      "validateSat",
      "scanSat",
      "compareWithSample",
      "summarizeSat",
      "suggestVersion",
      "exportSat",
    ];
    for (const name of api) {
      expect(cited, name).toContain(name);
      expect(sat, name).toHaveProperty(name);
    }
    const imported = blocks("ts")
      .flat()
      .flatMap((l) => /import \{([^}]+)\} from "@\/export\/sat"/.exec(l)?.[1].split(",") ?? [])
      .map((s) => s.trim());
    expect(imported.length).toBeGreaterThan(0);
    for (const name of imported) expect(sat, name).toHaveProperty(name);
  });

  it("la tabella delle opzioni copre tutte le opzioni con i default veri", () => {
    for (const [key, value] of Object.entries(sat.DEFAULT_SAT_OPTIONS)) {
      const row = readme.split("\n").find((l) => l.startsWith(`| \`${key}\``));
      expect(row, key).toBeDefined();
      expect(row).toContain(String(value));
    }
  });

  it("gli script npm citati esistono", () => {
    const scripts = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).scripts;
    for (const [, name] of readme.matchAll(/npm (?:run )?([a-z:]+)(?= )/g)) {
      expect(scripts, name).toHaveProperty(name);
    }
  });
});
