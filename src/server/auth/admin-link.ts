import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { users, verificationTokens } from "@/db/schema";

/**
 * Collegamento di accesso generato dall'operatore (`npm run admin:link`), per entrare nel
 * back-office quando le email non partono (nessun `RESEND_API_KEY`: adattatore console).
 * Nessuna route HTTP: lo esegue solo chi ha accesso al server.
 *
 * Il token è salvato in `verification_tokens` **esattamente** come lo salva Auth.js
 * (`@auth/core` `sendToken`): `identifier` = email normalizzata, `token` = SHA-256 esadecimale
 * di `token + AUTH_SECRET`, scadenza a 15 minuti. Il collegamento punta alla callback del
 * provider email `resend` (id del provider in `auth.ts`), che lo consuma con
 * `useVerificationToken` dell'adapter: monouso, come quelli inviati per email.
 */

// Niente import da `auth.ts`/`auth.config.ts`: trascinerebbero `next-auth` e `next/server`
// nello script. Valori allineati da `admin-link.db.test.ts`.
export const ADMIN_LINK_PROVIDER_ID = "resend";
/** = `MAGIC_LINK_MAX_AGE_S` (15 minuti). */
export const ADMIN_LINK_MAX_AGE_S = 15 * 60;
/** = `normalizeEmail` di `auth.ts`. */
const normalizeEmail = (email: string): string => email.normalize("NFKC").trim().toLowerCase();
export const ADMIN_LINK_DEFAULT_PATH = "/admin";

export class AdminLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminLinkError";
  }
}

export interface AdminLinkInput {
  readonly email: string;
  /** Origine del sito, es. `https://configuratore.esempio.it` (senza percorso). */
  readonly baseUrl: string;
  readonly secret: string;
  /** Pagina di arrivo dopo l'accesso (percorso interno); default `/admin`. */
  readonly next?: string;
  readonly now?: Date;
}

export interface AdminLink {
  readonly url: string;
  readonly email: string;
  readonly expires: Date;
}

/** Hash del token come `createHash` di `@auth/core` (SHA-256 esadecimale di token + segreto). */
export const hashVerificationToken = (token: string, secret: string): string =>
  createHash("sha256").update(`${token}${secret}`).digest("hex");

function parseBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AdminLinkError(`URL di base non valido: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new AdminLinkError("l'URL di base deve iniziare con https:// (o http:// in locale)");
  return url;
}

/** Crea il token monouso per un utente **esistente e attivo** e restituisce il collegamento di callback. */
export async function createAdminLink(db: DbOrTx, input: AdminLinkInput): Promise<AdminLink> {
  if (!input.secret) throw new AdminLinkError("AUTH_SECRET mancante: lo stesso segreto dell'applicazione è necessario");
  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new AdminLinkError(`indirizzo email non valido: ${input.email}`);
  const base = parseBaseUrl(input.baseUrl);
  const next = input.next ?? ADMIN_LINK_DEFAULT_PATH;
  if (!next.startsWith("/") || next.startsWith("//")) throw new AdminLinkError("la pagina di arrivo deve essere un percorso interno (es. /admin)");

  const [user] = await db.select({ active: users.active }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new AdminLinkError(`nessun utente con email ${email}: crealo con il seed (ADMIN_EMAIL) o dal back-office`);
  if (!user.active) throw new AdminLinkError(`l'utente ${email} è disattivato`);

  const token = randomBytes(32).toString("hex");
  const expires = new Date((input.now ?? new Date()).getTime() + ADMIN_LINK_MAX_AGE_S * 1000);
  await db.insert(verificationTokens).values({ identifier: email, token: hashVerificationToken(token, input.secret), expires });

  const callback = new URL(`/api/auth/callback/${ADMIN_LINK_PROVIDER_ID}`, base.origin);
  callback.search = new URLSearchParams({ callbackUrl: new URL(next, base.origin).toString(), token, email }).toString();
  return { url: callback.toString(), email, expires };
}
