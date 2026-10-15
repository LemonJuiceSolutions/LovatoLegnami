import { describe, expect, it } from "vitest";
import { generatePassword, hashPassword, parsePasswordHash, passwordPolicyError, verifyPassword } from "../password";

describe("hash delle password (scrypt)", () => {
  it("formato scrypt$N$r$p$sale$hash con sale casuale", async () => {
    const a = await hashPassword("una password lunga");
    const b = await hashPassword("una password lunga");
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/);
    expect(a).not.toBe(b);
    const parsed = parsePasswordHash(a)!;
    expect(parsed.salt).toHaveLength(16);
    expect(parsed.key).toHaveLength(64);
  });

  it("verifica: giusta ⇒ true, sbagliata ⇒ false", async () => {
    const h = await hashPassword("Corretta-Cavallo-Batteria");
    expect(await verifyPassword("Corretta-Cavallo-Batteria", h)).toBe(true);
    expect(await verifyPassword("corretta-cavallo-batteria", h)).toBe(false);
    expect(await verifyPassword("", h)).toBe(false);
    expect(await verifyPassword("x".repeat(10_000), h)).toBe(false);
  });

  it("Unicode normalizzato (NFKC): stessa password con composizioni diverse", async () => {
    const h = await hashPassword("perché-lunghissima");
    expect(await verifyPassword("perché-lunghissima", h)).toBe(true);
  });

  it("hash assente o malformato ⇒ false senza eccezioni", async () => {
    const good = await hashPassword("abcdefghijklmn");
    const [, n, r, p, salt, key] = good.split("$");
    for (const bad of [
      null,
      undefined,
      "",
      "testo",
      `bcrypt$${n}$${r}$${p}$${salt}$${key}`,
      `scrypt$${n}$${r}$${p}$${salt}`,
      `scrypt$1000$${r}$${p}$${salt}$${key}`, // N non potenza di 2
      `scrypt$${2 ** 24}$${r}$${p}$${salt}$${key}`, // N fuori limite
      `scrypt$${n}$999$${p}$${salt}$${key}`,
      `scrypt$${n}$${r}$${p}$!!$${key}`,
      `scrypt$${n}$${r}$${p}$${salt}$QUJD`, // chiave troppo corta
    ]) {
      expect(await verifyPassword("abcdefghijklmn", bad)).toBe(false);
    }
  });

  it("regole: almeno 12 caratteri, niente spazi ai bordi", () => {
    expect(passwordPolicyError("corta")).toMatch(/almeno 12/);
    expect(passwordPolicyError(" abbastanza lunga")).toMatch(/spazio/);
    expect(passwordPolicyError("x".repeat(257))).toMatch(/al più/);
    expect(passwordPolicyError("abbastanza lunga")).toBeNull();
  });

  it("password generate: 20 caratteri, alfabeto senza ambiguità, tutte diverse", () => {
    const set = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(set.size).toBe(200);
    for (const p of set) {
      expect(p).toHaveLength(20);
      expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
      expect(passwordPolicyError(p)).toBeNull();
    }
  });
});
