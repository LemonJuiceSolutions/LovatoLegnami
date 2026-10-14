import { describe, expect, it } from "vitest";
import {
  DEFAULT_SAT_VERSION,
  SAT_VERSIONS,
  ctimeString,
  formatSatString,
  recordLayout,
  satHeader,
  satVersionInfo,
  typeMatches,
  versionFromCode,
} from "./versions";

const date = new Date(2026, 9, 14, 9, 30, 5);
const names = (version: "4.0" | "7.0" | "21.0", type: string) =>
  recordLayout(satVersionInfo(version), type)?.map((f) => f.name);

describe("versioni SAT", () => {
  it("elenco e default", () => {
    expect(SAT_VERSIONS).toEqual(["4.0", "7.0", "21.0"]);
    expect(DEFAULT_SAT_VERSION).toBe("7.0");
    expect(versionFromCode(700)).toBe("7.0");
    expect(versionFromCode(21000)).toBe("21.0");
    expect(versionFromCode(600)).toBeUndefined();
    expect(() => satVersionInfo("9.0" as never)).toThrow(/non supportata/);
  });

  it("data in formato ctime", () => {
    expect(ctimeString(date)).toBe("Wed Oct 14 09:30:05 2026");
    expect(ctimeString(new Date(2026, 9, 4, 0, 0, 0))).toBe("Sun Oct  4 00:00:00 2026");
  });

  it("header 7.0", () => {
    expect(satHeader(satVersionInfo("7.0"), { producer: "Lovato Legnami", date, bodyCount: 20 })).toEqual([
      "700 0 20 0",
      "@14 Lovato Legnami @11 ACIS 7.0 NT @24 Wed Oct 14 09:30:05 2026",
      "1 9.9999999999999995e-007 1e-010",
    ]);
  });

  it("header 4.0 (stringhe senza @)", () => {
    expect(satHeader(satVersionInfo("4.0"), { producer: "CAM Biesse", date, bodyCount: 1 })).toEqual([
      "400 0 1 0",
      "10 CAM Biesse 11 ACIS 4.0 NT 24 Wed Oct 14 09:30:05 2026",
      "1 9.9999999999999995e-007 1e-010",
    ]);
  });

  it("header 21.0", () => {
    const [l1, l2, l3] = satHeader(satVersionInfo("21.0"), { producer: "x", date, bodyCount: 3 });
    expect(l1).toBe("21000 0 3 0");
    expect(l2).toBe("@1 x @12 ACIS 21.0 NT @24 Wed Oct 14 09:30:05 2026");
    expect(l3).toBe("1 9.9999999999999995e-007 1e-010");
  });

  it("stringhe ASCII con lunghezza", () => {
    const v7 = satVersionInfo("7.0");
    expect(formatSatString(v7, "PIL-01")).toBe("@6 PIL-01");
    expect(formatSatString(v7, "Falegnameria Città")).toBe("@18 Falegnameria Citta");
    expect(formatSatString(satVersionInfo("4.0"), "unknown")).toBe("7 unknown");
    expect(satHeader(v7, { producer: "  ", date, bodyCount: 0 })[1]).toMatch(/^@7 unknown /);
  });

  it("layout dei record: intestazione comune per versione", () => {
    expect(names("7.0", "body")).toEqual(["attrib", "id", "pattern", "lump", "wire", "transform"]);
    expect(names("4.0", "body")).toEqual(["attrib", "lump", "wire", "transform"]);
    expect(names("21.0", "body")).toEqual(names("7.0", "body"));
    expect(names("7.0", "point")).toEqual(["attrib", "id", "pattern", "location"]);
    expect(names("7.0", "string_attrib-name_attrib-gen-attrib")?.slice(0, 5)).toEqual([
      "attrib",
      "id",
      "next",
      "prev",
      "owner",
    ]);
    expect(names("7.0", "spline-surface")).toBeUndefined();
  });

  it("layout dello spigolo: parametri e convessità solo da 7.0", () => {
    expect(names("7.0", "edge")).toEqual([
      "attrib",
      "id",
      "pattern",
      "start",
      "startParam",
      "end",
      "endParam",
      "coedge",
      "curve",
      "sense",
      "convexity",
    ]);
    expect(names("4.0", "edge")).toEqual(["attrib", "start", "end", "coedge", "curve", "sense"]);
  });

  it("compatibilità dei tipi nei riferimenti", () => {
    expect(typeMatches("*-surface", "cone-surface")).toBe(true);
    expect(typeMatches("*-surface", "straight-curve")).toBe(false);
    expect(typeMatches("*attrib", "string_attrib-name_attrib-gen-attrib")).toBe(true);
    expect(typeMatches("*", "body")).toBe(true);
    expect(typeMatches("loop", "lump")).toBe(false);
  });
});
