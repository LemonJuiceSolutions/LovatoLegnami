"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/server/auth/auth";
import { safeNextPath } from "@/server/auth/route-guard";

/**
 * Server action dell'accesso (7.4). La risposta è neutra: per un indirizzo valido, che
 * sia registrato o no, l'utente finisce sulla pagina "controlla la posta" (redirect di
 * Auth.js); l'unico errore mostrato è quello di formato.
 */

export type SignInResult = { readonly ok: false; readonly message: string };

const EmailSchema = z.string().trim().toLowerCase().email().max(254);

export async function requestSignIn(formData: FormData): Promise<SignInResult | void> {
  const email = EmailSchema.safeParse(formData.get("email"));
  if (!email.success) return { ok: false, message: "Inserisci un indirizzo email valido." };
  const next = safeNextPath(String(formData.get("next") ?? ""));
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
