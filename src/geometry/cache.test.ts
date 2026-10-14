import { describe, expect, it } from "vitest";
import { generate } from "@/domain";
import { LruCache, canonicalJson, pieceCacheKey, stableHash } from "./cache";

describe("cache geometrica", () => {
  it("canonicalJson ordina le chiavi, arrotonda i numeri e normalizza -0", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: -0, c: 1.0000000001 }] })).toBe('{"a":[2,{"c":1,"d":0}],"b":1}');
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
  });

  it("la chiave ignora id, posa e giunti ma dipende da tipo, sezione, lunghezza e lavorazioni", () => {
    const tvt = generate("addossata-monofalda").pieces.filter((p) => p.type === "travetto");
    expect(tvt.length).toBeGreaterThan(2);
    const keys = new Set(tvt.map(pieceCacheKey));
    expect(keys.size).toBe(1);
    const p = tvt[0];
    const k = pieceCacheKey(p);
    expect(pieceCacheKey({ ...p, length: p.length + 1 })).not.toBe(k);
    expect(pieceCacheKey({ ...p, section: { b: p.section.b, h: p.section.h + 20 } })).not.toBe(k);
    expect(pieceCacheKey({ ...p, type: "trave" })).not.toBe(k);
    expect(pieceCacheKey({ ...p, machinings: p.machinings.slice(1) })).not.toBe(k);
    expect(pieceCacheKey({ ...p, machinings: p.machinings.map((m) => ({ ...m, at: m.at + 0.5 })) })).not.toBe(k);
  });

  it("LRU: rimuove il meno usato e chiama onEvict", () => {
    const evicted: string[] = [];
    const c = new LruCache<number>(2, (_, k) => evicted.push(k));
    c.set("a", 1);
    c.set("b", 2);
    expect(c.get("a")).toBe(1);
    c.set("c", 3);
    expect(c.has("b")).toBe(false);
    expect(evicted).toEqual(["b"]);
    c.clear();
    expect(c.size).toBe(0);
    expect(evicted).toEqual(["b", "a", "c"]);
  });
});
