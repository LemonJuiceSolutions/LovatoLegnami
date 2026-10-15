import type { NextAuthConfig } from "next-auth";
import { DEV_AUTH_SECRET } from "@/server/env";
import { isRole, type Role } from "./permissions";
import { safeAuthRedirect } from "./route-guard";

/**
 * Configurazione di Auth.js **senza adapter né provider** (P6): è quella che importa il
 * middleware edge, che deve solo verificare il JWT di sessione e reindirizzare. Il
 * provider email richiede l'adapter (Auth.js rifiuta un provider email senza adapter
 * a ogni richiesta), quindi provider e adapter si aggiungono in `auth.ts` (Node).
 */

/** Sessione: al più 30 giorni (spec). */
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;
/** Collegamento di accesso: 15 minuti, monouso (il token è cancellato all'uso dall'adapter). */
export const MAGIC_LINK_MAX_AGE_S = 15 * 60;

export const SIGN_IN_PATH = "/accesso";
/** Pagina "controlla la posta" (stessa per indirizzi registrati e non). */
export const VERIFY_REQUEST_PATH = "/accesso/inviato";

/**
 * Segreto di firma: `AUTH_SECRET`; in sviluppo e test il segreto fisso di `env.ts` (lo
 * stesso che usa `getEnv()`), in produzione nessun ripiego (Auth.js rifiuta di partire).
 */
export function authSecret(source: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  const v = source.AUTH_SECRET?.trim();
  if (v) return v;
  return source.NODE_ENV === "production" ? undefined : DEV_AUTH_SECRET;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: Role;
      active: boolean;
    };
  }
  interface User {
    role?: string;
    active?: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: Role;
    active?: boolean;
  }
}

export const authConfig = {
  providers: [],
  secret: authSecret(),
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_S },
  pages: { signIn: SIGN_IN_PATH, verifyRequest: VERIFY_REQUEST_PATH, error: SIGN_IN_PATH },
  callbacks: {
    /** Stesse regole di `safeNextPath` (senza elenco di aree): mai fuori dal sito. */
    redirect({ url, baseUrl }) {
      return safeAuthRedirect(url, baseUrl);
    },
    /** All'accesso copia nel token id, ruolo e stato dell'utente (riga di `users`). */
    jwt({ token, user }) {
      if (user) {
        if (user.id) token.sub = user.id;
        token.role = isRole(user.role) ? user.role : undefined;
        token.active = user.active !== false;
      }
      return token;
    },
    session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.sub ?? "",
        email: token.email ?? session.user?.email ?? "",
        name: token.name ?? null,
        role: token.role as Role,
        active: token.active !== false,
      };
      return session;
    },
  },
} satisfies NextAuthConfig;
