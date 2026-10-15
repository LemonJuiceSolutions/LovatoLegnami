// Comandi operativi per l'immagine Docker (`deploy/hetzner/`): `db:migrate`, `db:seed`,
// `admin:link` e `admin:set-password` impacchettati con esbuild in `.next/tools/*.cjs` (un file ciascuno, Node
// puro, nessun `tsx` né sorgenti TypeScript nell'immagine finale). Le dipendenze sono
// incluse nel file; restano esterne solo PGlite (mai usato con DATABASE_URL) e il driver
// nativo opzionale di `pg`. Le migrazioni SQL si leggono da `<cwd>/drizzle/`.
// Eseguito dal Dockerfile dopo `next build`: `node scripts/build-tools.mjs`.
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = join(root, ".next", "tools");

const entries = {
  migrate: "src/db/migrate.ts",
  seed: "src/db/seed.ts",
  "admin-link": "scripts/admin-link.ts",
  "set-password": "scripts/set-password.ts",
};

await build({
  absWorkingDir: root,
  entryPoints: Object.fromEntries(Object.entries(entries).map(([name, file]) => [name, join(root, file)])),
  outdir,
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  tsconfig: join(root, "tsconfig.json"),
  external: ["@electric-sql/pglite", "pg-native"],
  logLevel: "info",
});
console.log(`[build-tools] ${Object.keys(entries).map((n) => `${n}.cjs`).join(", ")} → .next/tools/`);
