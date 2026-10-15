import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Hash delle password con scrypt di `node:crypto` (nessuna dipendenza nativa). Formato
 * salvato in `users.password_hash`:
 *
 *   scrypt$N$r$p$<sale base64>$<hash base64>
 *
 * Parametri: N = 2^15, r = 8, p = 1 (≈ 32 MiB di memoria per verifica), sale di 16 byte,
 * chiave di 64 byte. I parametri sono nel valore salvato: si possono alzare in futuro
 * senza invalidare gli hash esistenti. Il confronto è a tempo costante (`timingSafeEqual`).
 */

export const PASSWORD_MIN_LENGTH = 12;
/** Limite superiore: evita di passare a scrypt input enormi (costo inutile). */
export const PASSWORD_MAX_LENGTH = 256;

const N = 2 ** 15;
const R = 8;
const P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
/** scrypt richiede 128·N·r byte (32 MiB con questi parametri): il limite predefinito (32 MiB) non basta. */
const maxmemFor = (n: number, r: number) => 128 * n * r * 2;

/** Limiti accettati in lettura (un hash manomesso non deve far allocare gigabyte). */
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 16;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password.normalize("NFKC"), salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_BYTES, { N, r: R, p: P, maxmem: maxmemFor(N, R) });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

interface ParsedHash {
  readonly n: number;
  readonly r: number;
  readonly p: number;
  readonly salt: Buffer;
  readonly key: Buffer;
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const int = (s: string | undefined): number | null => (s && /^\d{1,7}$/.test(s) ? Number(s) : null);

/** Hash nel formato atteso, o `null` (malformato o parametri fuori dai limiti). */
export function parsePasswordHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const n = int(parts[1]);
  const r = int(parts[2]);
  const p = int(parts[3]);
  if (n === null || r === null || p === null) return null;
  if (n < 2 || n > MAX_N || (n & (n - 1)) !== 0 || r < 1 || r > MAX_R || p < 1 || p > MAX_P) return null;
  if (!B64.test(parts[4]!) || !B64.test(parts[5]!)) return null;
  const salt = Buffer.from(parts[4]!, "base64");
  const key = Buffer.from(parts[5]!, "base64");
  if (salt.length < 8 || key.length < 16 || key.length > 128) return null;
  return { n, r, p, salt, key };
}

let dummyHash: Promise<string> | null = null;
/** Hash di una password casuale, calcolato una volta: serve a verificare anche senza utente. */
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(18).toString("base64")));

/**
 * `true` se `password` corrisponde a `stored`. Senza hash (utente inesistente o senza
 * password) o con un hash malformato si esegue comunque uno scrypt con i parametri
 * standard e si restituisce `false`: il tempo di risposta non rivela se l'utente esiste.
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parsed = stored ? parsePasswordHash(stored) : null;
  const target = parsed ?? parsePasswordHash(await getDummyHash())!;
  if (password.length > PASSWORD_MAX_LENGTH) {
    // Calcolo comunque (su un input troncato) per non distinguere i tempi, poi rifiuto.
    await scrypt(password.slice(0, PASSWORD_MAX_LENGTH), target.salt, target.key.length, { N: target.n, r: target.r, p: target.p, maxmem: maxmemFor(target.n, target.r) });
    return false;
  }
  const key = await scrypt(password, target.salt, target.key.length, { N: target.n, r: target.r, p: target.p, maxmem: maxmemFor(target.n, target.r) });
  return parsed !== null && timingSafeEqual(key, target.key);
}

/** Messaggio d'errore se la nuova password non rispetta le regole, altrimenti `null`. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `La password deve avere almeno ${PASSWORD_MIN_LENGTH} caratteri.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `La password può avere al più ${PASSWORD_MAX_LENGTH} caratteri.`;
  if (password.trim() !== password) return "La password non può iniziare o finire con uno spazio.";
  return null;
}

/** Alfabeto senza caratteri ambigui (niente 0/O, 1/l/I). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Password casuale (20 caratteri ≈ 116 bit), da mostrare una sola volta. */
export function generatePassword(length = 20): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
