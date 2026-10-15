import { describe, expect, it } from "vitest";
import { parseEnv } from "../env";
import { createRateLimiter } from "../rate-limit";

const TEN_MIN = 10 * 60_000;

describe("rate limit (8.4)", () => {
  it("la sesta richiesta in 10 minuti → rifiutata; la finestra scorre", () => {
    let t = 0;
    const rl = createRateLimiter({ now: () => t });
    const rule = { limit: 5, windowMs: TEN_MIN };
    for (let i = 0; i < 5; i++) {
      expect(rl.check("submit:1.2.3.4", rule).allowed).toBe(true);
      t += 60_000; // una al minuto: 0, 1, 2, 3, 4 min
    }
    const denied = rl.check("submit:1.2.3.4", rule); // a 5 min
    expect(denied).toEqual({ allowed: false, remaining: 0, retryAfterSec: 300 });
    // un altro IP non è toccato
    expect(rl.check("submit:5.6.7.8", rule).allowed).toBe(true);
    // a 10 min esce la prima (t = 0): una richiesta torna possibile, la successiva no
    t = TEN_MIN;
    expect(rl.check("submit:1.2.3.4", rule).allowed).toBe(true);
    expect(rl.check("submit:1.2.3.4", rule).allowed).toBe(false);
    // dopo 11 min ne è uscita un'altra
    t = TEN_MIN + 60_000 + 1;
    expect(rl.check("submit:1.2.3.4", rule).allowed).toBe(true);
  });

  it("le richieste rifiutate non allungano il blocco", () => {
    let t = 0;
    const rl = createRateLimiter({ now: () => t });
    const rule = { limit: 1, windowMs: 1000 };
    expect(rl.check("k", rule).allowed).toBe(true);
    for (t = 100; t < 1000; t += 100) expect(rl.check("k", rule).allowed).toBe(false);
    t = 1001;
    expect(rl.check("k", rule).allowed).toBe(true);
  });

  it("memoria limitata a maxKeys", () => {
    let t = 0;
    const rl = createRateLimiter({ now: () => t, maxKeys: 100 });
    for (let i = 0; i < 1000; i++) {
      t += 1;
      rl.check(`estimate:10.0.${i >> 8}.${i & 255}`, { limit: 60, windowMs: 60_000 });
    }
    expect(rl.size).toBeLessThanOrEqual(100);
  });

  it("limiti da env con default 5/10 min e 60/min", () => {
    expect(parseEnv({}).rateLimits).toEqual({ submit: { limit: 5, windowMs: 600_000 }, estimate: { limit: 60, windowMs: 60_000 } });
    expect(parseEnv({ RATE_LIMIT_SUBMIT: "3/60" }).rateLimits.submit).toEqual({ limit: 3, windowMs: 60_000 });
    expect(() => parseEnv({ RATE_LIMIT_ESTIMATE: "tanti" })).toThrow("RATE_LIMIT_ESTIMATE");
    expect(() => parseEnv({ RATE_LIMIT_ESTIMATE: "0/60" })).toThrow("RATE_LIMIT_ESTIMATE");
  });
});
