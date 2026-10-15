import { getEnv, type RateLimitSetting } from "@/server/env";

/**
 * Rate limit delle API pubbliche: finestra **scorrevole** (registro degli istanti) in
 * memoria, per chiave `rotta:IP`. Le richieste rifiutate non contano (un client che
 * insiste non allunga il proprio blocco oltre la finestra).
 *
 * **Best effort su serverless**: ogni istanza di Vercel ha la propria memoria, quindi il
 * limite effettivo è "N per istanza" e si azzera a ogni avvio a freddo. Basta contro
 * invii ripetuti da un browser o uno script banale; contro un attacco distribuito servono
 * il firewall della piattaforma (Vercel WAF, regole di rate limit) o un archivio condiviso
 * (Redis/Upstash) dietro la stessa interfaccia `RateLimiter`.
 *
 * Memoria limitata: al massimo `maxKeys` chiavi; oltre, si scartano prima le chiavi senza
 * istanti nella finestra e poi le più vecchie (ordine di inserimento della `Map`).
 */

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Secondi dopo cui riprovare (solo se rifiutata). */
  readonly retryAfterSec: number;
}

export interface RateLimiter {
  check(key: string, rule: RateLimitSetting): RateLimitResult;
  reset(): void;
  readonly size: number;
}

export function createRateLimiter(options: { now?: () => number; maxKeys?: number } = {}): RateLimiter {
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? 10_000;
  const hits = new Map<string, number[]>();

  const evict = (t: number, windowMs: number) => {
    for (const [k, list] of hits) {
      if (hits.size < maxKeys) return;
      if (list.length === 0 || list[list.length - 1]! <= t - windowMs) hits.delete(k);
    }
    while (hits.size >= maxKeys) hits.delete(hits.keys().next().value!);
  };

  return {
    get size() {
      return hits.size;
    },
    reset: () => hits.clear(),
    check(key, rule) {
      const t = now();
      const from = t - rule.windowMs;
      const list = (hits.get(key) ?? []).filter((x) => x > from);
      if (list.length >= rule.limit) {
        hits.set(key, list);
        return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((list[0]! + rule.windowMs - t) / 1000)) };
      }
      if (!hits.has(key) && hits.size >= maxKeys) evict(t, rule.windowMs);
      list.push(t);
      hits.delete(key); // reinserita in coda: le chiavi attive restano le più recenti
      hits.set(key, list);
      return { allowed: true, remaining: rule.limit - list.length, retryAfterSec: 0 };
    },
  };
}

export type RateLimitedRoute = "submit" | "estimate";

const processLimiter = createRateLimiter();

/** Limite di processo per la rotta pubblica e l'IP, con i valori da env. */
export function checkRateLimit(route: RateLimitedRoute, ip: string, limiter: RateLimiter = processLimiter): RateLimitResult {
  return limiter.check(`${route}:${ip}`, getEnv().rateLimits[route]);
}

/** Solo test: azzera il limite di processo. */
export function resetRateLimits(): void {
  processLimiter.reset();
}

export const RATE_LIMIT_MESSAGE = "Hai inviato troppe richieste in poco tempo: riprova tra qualche minuto. Se hai bisogno, chiamaci.";
