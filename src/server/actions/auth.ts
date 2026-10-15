"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { z } from "zod";
import { signIn, signOut } from "@/server/auth/auth";
import { safeNextPath } from "@/server/auth/route-guard";
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

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/accesso?uscito=1" });
}
