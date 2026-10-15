/**
 * `npm run admin:link -- <email> <url-di-base> [pagina]`: stampa un collegamento di accesso
 * monouso (15 minuti) per un utente esistente e attivo, senza inviare email. Serve quando
 * Resend non è configurato (le email finiscono solo nel log). Usa `DATABASE_URL` e
 * `AUTH_SECRET` dell'ambiente: gli stessi dell'applicazione, altrimenti il link è rifiutato.
 *
 *   npm run admin:link -- admin@esempio.it https://configuratore.esempio.it
 */
import { closeDb, getDb } from "@/db/client";
import { createAdminLink } from "@/server/auth/admin-link";
import { getEnv } from "@/server/env";

async function main() {
  const [email, baseUrl, next] = process.argv.slice(2);
  if (!email || !baseUrl) {
    console.error("uso: npm run admin:link -- <email> <url-di-base> [pagina, default /admin]");
    process.exit(2);
  }
  // in produzione `getEnv()` esige AUTH_SECRET; in sviluppo è il segreto locale di `env.ts`
  const secret = getEnv().authSecret;
  const link = await createAdminLink(await getDb(), { email, baseUrl, secret, next });
  console.log(`[admin:link] collegamento per ${link.email}, valido fino alle ${link.expires.toISOString()} (una sola volta):`);
  console.log(link.url);
  await closeDb();
}

main().catch(async (e) => {
  console.error("[admin:link] errore:", e instanceof Error ? e.message : e);
  await closeDb().catch(() => {});
  process.exit(1);
});
