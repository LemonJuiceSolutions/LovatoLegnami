import NextAuth, { type NextAuthConfig } from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { getEmailSender, type EmailSender } from "@/server/email/sender";
import { accessEmail } from "@/server/email/templates/accesso";
import { getEnv, type ServerEnv } from "@/server/env";
import { MAGIC_LINK_MAX_AGE_S, authConfig } from "./auth.config";

/**
 * Auth.js completo (runtime Node, P6): adapter Drizzle sulle tabelle di `schema.ts` e
 * provider email "resend" (collegamento monouso). L'invio passa dall'adattatore email
 * del progetto: Resend in produzione, console in sviluppo (il link è stampato nel
 * terminale di `npm run dev`), memoria nei test.
 *
 * Solo gli utenti creati dall'admin e attivi possono accedere. Per un indirizzo non
 * registrato `signIn` non invia nulla e restituisce la stessa destinazione della
 * richiesta riuscita (pagina "controlla la posta"): la risposta è identica.
 */

export interface AuthDeps {
  readonly db: Db;
  readonly sender: EmailSender;
  readonly env: Pick<ServerEnv, "authSecret" | "emailFrom" | "resendApiKey" | "production">;
}

/** Indirizzo nella forma che usa Auth.js (minuscole, spazi tolti). */
export const normalizeEmail = (email: string): string => email.normalize("NFKC").trim().toLowerCase();

/** `true` se l'indirizzo appartiene a un utente registrato e attivo. */
export async function isAllowedToSignIn(db: Db, email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const [u] = await db.select({ active: users.active }).from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  return u?.active === true;
}

/** Destinazione dopo la richiesta del collegamento (come la produce Auth.js per il provider "resend"). */
export const NEUTRAL_SIGN_IN_REDIRECT = "/api/auth/verify-request?provider=resend&type=email";

export function createAuthConfig(deps: AuthDeps): NextAuthConfig {
  return {
    ...authConfig,
    secret: deps.env.authSecret,
    adapter: DrizzleAdapter(deps.db, {
      usersTable: users as never,
      accountsTable: accounts as never,
      sessionsTable: sessions as never,
      verificationTokensTable: verificationTokens as never,
    }),
    providers: [
      Resend({
        from: deps.env.emailFrom,
        apiKey: deps.env.resendApiKey,
        maxAge: MAGIC_LINK_MAX_AGE_S,
        normalizeIdentifier: normalizeEmail,
        async sendVerificationRequest({ identifier, url }) {
          await deps.sender.send(accessEmail({ to: identifier, url, minutes: Math.round(MAGIC_LINK_MAX_AGE_S / 60) }));
        },
      }),
    ],
    callbacks: {
      ...authConfig.callbacks,
      async signIn({ user, email }) {
        const allowed = await isAllowedToSignIn(deps.db, user.email);
        if (email?.verificationRequest) return allowed ? true : NEUTRAL_SIGN_IN_REDIRECT;
        // Apertura del collegamento: l'utente potrebbe essere stato disattivato nel frattempo.
        return allowed;
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(async () =>
  createAuthConfig({ db: await getDb(), sender: getEmailSender(), env: getEnv() }),
);
