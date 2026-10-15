/**
 * Seme del database (P5, `npm run db:seed`): prima versione attiva di listino, regole,
 * impostazioni delle tipologie e preset dai dati del dominio, più l'utente admin da
 * `ADMIN_EMAIL`. Idempotente per chiave naturale: un dataset che ha già la versione 1
 * non viene toccato, l'admin esistente (stessa email) nemmeno.
 *
 * In produzione si esegue a mano una volta con il `DATABASE_URL` dell'ambiente (P12).
 */
import { and, eq } from "drizzle-orm";
import { PRESET_CATALOG } from "@/domain/presets/catalog";
import { DEFAULT_PRICE_LIST_DATA, DEFAULT_PRICE_LIST_VERSION } from "@/domain/pricing/data/default-listino";
import { DEFAULT_LOVATO_DATA } from "@/domain/rules/data/default-lovato";
import { defaultTypologySettings } from "@/domain/site/typology-settings";
import { createVersion } from "@/server/repositories/datasets";
import { getEnv } from "@/server/env";
import { closeDb, getDb } from "./client";
import { datasetVersions, users, type Dataset } from "./schema";

export interface SeedOptions {
  /** Email dell'admin iniziale; default `ADMIN_EMAIL`. Assente ⇒ nessun admin (avviso). */
  readonly adminEmail?: string;
  readonly adminName?: string;
}

export interface SeedReport {
  /** Dataset creati in questa esecuzione (gli altri avevano già la v1). */
  readonly created: Dataset[];
  readonly skipped: Dataset[];
  readonly admin: "creato" | "esistente" | "assente";
}

/** Data di validità comune della prima versione: quella del listino seed. */
const EFFECTIVE_FROM = DEFAULT_PRICE_LIST_VERSION.effectiveFrom;
const SEED_NOTE = "Versione iniziale dai dati di dominio (DA VALIDARE con l'ufficio).";

const SEED_DATA: { readonly [D in Dataset]: () => unknown } = {
  listino: () => DEFAULT_PRICE_LIST_DATA,
  regole: () => DEFAULT_LOVATO_DATA,
  tipologie: () => defaultTypologySettings(),
  preset: () => PRESET_CATALOG,
};

export async function seedDatabase(options: SeedOptions = {}): Promise<SeedReport> {
  const db = await getDb();
  const adminEmail = (options.adminEmail ?? getEnv().adminEmail)?.trim().toLowerCase();
  return db.transaction(async (tx) => {
    let admin: SeedReport["admin"] = "assente";
    let adminId: string | null = null;
    if (adminEmail) {
      const inserted = await tx
        .insert(users)
        .values({ email: adminEmail, name: options.adminName ?? "Amministratore", role: "admin", active: true })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      admin = inserted.length ? "creato" : "esistente";
      adminId = inserted[0]?.id ?? null;
    }
    const created: Dataset[] = [];
    const skipped: Dataset[] = [];
    for (const dataset of Object.keys(SEED_DATA) as Dataset[]) {
      const [v1] = await tx
        .select({ id: datasetVersions.id })
        .from(datasetVersions)
        .where(and(eq(datasetVersions.dataset, dataset), eq(datasetVersions.version, 1)))
        .limit(1);
      if (v1) {
        skipped.push(dataset);
        continue;
      }
      await createVersion({ dataset, data: SEED_DATA[dataset](), status: "attiva", effectiveFrom: EFFECTIVE_FROM, version: 1, notes: SEED_NOTE, userId: adminId }, tx);
      created.push(dataset);
    }
    return { created, skipped, admin };
  });
}

async function main() {
  const report = await seedDatabase();
  console.log(`[db:seed] dataset creati: ${report.created.join(", ") || "nessuno"}; già presenti: ${report.skipped.join(", ") || "nessuno"}`);
  if (report.admin === "assente") console.warn("[db:seed] ADMIN_EMAIL non impostata: nessun utente amministratore creato");
  else console.log(`[db:seed] amministratore ${getEnv().adminEmail}: ${report.admin}`);
  await closeDb();
}

// Eseguito come script (`tsx src/db/seed.ts`, o `node tools/seed.cjs` nell'immagine Docker),
// non quando importato dai test.
if (process.argv[1] && /[\\/](src[\\/]db[\\/]seed\.ts|tools[\\/]seed\.cjs)$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error("[db:seed] errore:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
