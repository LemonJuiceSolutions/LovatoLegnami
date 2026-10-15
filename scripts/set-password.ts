/**
 * `npm run admin:set-password -- <email> [password]`: imposta la password di accesso di un
 * utente esistente. Senza password ne genera una casuale (20 caratteri) e la stampa **una
 * sola volta**. Nessuna route HTTP: lo esegue solo chi ha accesso al server (shell nel
 * container). Usa `DATABASE_URL` dell'ambiente, come l'applicazione.
 *
 *   npm run admin:set-password -- admin@esempio.it
 *
 * Una password passata come argomento resta nella cronologia della shell: meglio generarla.
 */
import { closeDb, getDb } from "@/db/client";
import { PasswordError, setPasswordByEmail } from "@/server/auth/password-store";

async function main() {
  const [email, password, ...rest] = process.argv.slice(2);
  if (!email || rest.length > 0 || email.startsWith("-")) {
    console.error("uso: npm run admin:set-password -- <email> [password, almeno 12 caratteri; se omessa è generata]");
    process.exit(2);
  }
  const r = await setPasswordByEmail(await getDb(), email, password);
  console.log(`[admin:set-password] password impostata per ${r.email}${r.active ? "" : " (ATTENZIONE: utente disattivato, non può accedere)"}`);
  if (r.generated) {
    console.log("[admin:set-password] password generata (mostrata solo ora, conservala in un luogo sicuro):");
    console.log(r.generated);
  }
  await closeDb();
}

main().catch(async (e) => {
  console.error("[admin:set-password] errore:", e instanceof PasswordError || e instanceof Error ? e.message : e);
  await closeDb().catch(() => {});
  process.exit(1);
});
