/**
 * Su Vercel (`VERCEL=1` nel build) `npm run db:migrate` deve migrare il Postgres
 * dell'ambiente: senza `DATABASE_URL` migrerebbe un PGlite usa e getta sulla macchina di
 * build e il rilascio proseguirebbe con un database mai creato. In quel caso il comando
 * fallisce e il build si interrompe (la versione precedente resta attiva, P12).
 * In locale e in CI senza `DATABASE_URL` si migra PGlite come sempre.
 */
export function migrationTargetError(source: Readonly<Record<string, string | undefined>>): string | null {
  const onVercel = Boolean(source.VERCEL?.trim());
  const hasDatabase = Boolean(source.DATABASE_URL?.trim());
  if (onVercel && !hasDatabase) {
    const env = source.VERCEL_ENV?.trim() || "sconosciuto";
    return `DATABASE_URL mancante nel build Vercel (ambiente ${env}): collegare Neon al progetto per questo ambiente (vedi docs/deploy.md)`;
  }
  return null;
}
