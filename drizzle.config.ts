import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit (P5): genera le migrazioni SQL in `drizzle/` da `src/db/schema.ts`
 * (`npm run db:generate`). Le stesse migrazioni sono applicate da `src/db/migrate.ts`
 * a Postgres (`DATABASE_URL`) o a PGlite. `db:studio` richiede `DATABASE_URL`.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  ...(process.env.DATABASE_URL ? { dbCredentials: { url: process.env.DATABASE_URL } } : {}),
  strict: true,
  verbose: true,
});
