"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { headers } from "next/headers";
import { z } from "zod";
import { signIn, signOut } from "@/server/auth/auth";
import { safeNextPath } from "@/server/auth/route-guard";
import { LOGIN_ERROR_MESSAGE, LOGIN_RATE_MESSAGE, PASSWORD_PROVIDER_ID, TooManyAttempts } from "@/server/auth/password-login";
import { PASSWORD_MAX_LENGTH } from "@/server/auth/password";
import { checkRateLimit } from "@/server/rate-limit";

/**
 * Server action dell'accesso (7.4). La risposta è neutra: per un indirizzo valido, che
 * sia registrato o no, l'utente finisce sulla pagina "controlla la posta" (redirect di
 * Auth.js); l'unico errore mostrato è quello di formato.
 */

export type SignInResult = { readonly ok: false; readonly message: string };

const SIGN_IN_RATE_MESSAGE = "Troppe richieste di accesso: riprova tra qualche minuto.";

const EmailSchema = z.string().trim().toLowerCase().email().max(254);

export async function requestSignIn(formData: FormData): Promise<SignInResult | void> {
  const email = EmailSchema.safeParse(formData.get("email"));
  if (!email.success) return { ok: false, message: "Inserisci un indirizzo email valido." };
  const next = safeNextPath(String(formData.get("next") ?? ""));
  // Limite per IP e per indirizzo (stessi valori dell'invio richieste, 5 ogni 10 minuti):
  // evita di inondare di email la casella di un utente interno.
  const h = headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "sconosciuto").slice(0, 64);
  if (!checkRateLimit("submit", `accesso:${ip}`).allowed || !checkRateLimit("submit", `accesso-email:${email.data}`).allowed)
    return { ok: false, message: SIGN_IN_RATE_MESSAGE };
  try {
    // Lancia il redirect di Next verso la pagina di conferma (non va intercettato).
    await signIn("resend", { email: email.data, redirectTo: next });
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, message: "Invio non riuscito: riprova tra qualche minuto." };
    throw e;
  }
}

/**
 * Accesso con email e password (provider `password`). Errore sempre generico; il limite dei
 * tentativi (per IP e per email) è applicato in `authorize`, quindi vale anche per chi
 * chiama direttamente `/api/auth/callback/password` (lì con il token CSRF di Auth.js).
 */
export async function signInWithPassword(formData: FormData): Promise<SignInResult | void> {
  const email = EmailSchema.safeParse(formData.get("email"));
  const password = formData.get("password");
  if (!email.success || typeof password !== "string" || !password || password.length > PASSWORD_MAX_LENGTH) return { ok: false, message: LOGIN_ERROR_MESSAGE };
  const next = safeNextPath(String(formData.get("next") ?? ""));
  try {
    // Riuscito: lancia il redirect di Next verso la destinazione (non va intercettato).
    await signIn(PASSWORD_PROVIDER_ID, { email: email.data, password, redirectTo: next });
  } catch (e) {
    if (e instanceof TooManyAttempts || (e instanceof CredentialsSignin && e.code === "tentativi")) return { ok: false, message: LOGIN_RATE_MESSAGE };
    if (e instanceof AuthError) return { ok: false, message: LOGIN_ERROR_MESSAGE };
    throw e;
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/accesso?uscito=1" });
}
