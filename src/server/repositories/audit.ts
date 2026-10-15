import { and, desc, eq, type SQL } from "drizzle-orm";
import { diffDocuments, type DiffEntry } from "@/domain/pricing/diff";
import { getDb, type DbOrTx } from "@/db/client";
import { auditLog, type Dataset } from "@/db/schema";

/**
 * Registro delle modifiche (spec `listini-versionati`, P10): solo inserimenti e letture.
 * Il modulo non espone funzioni di modifica o cancellazione delle voci: è il punto
 * unico di accesso alla tabella `audit_log`.
 */

export type AuditAction =
  | "crea"
  | "salva"
  | "pubblica"
  | "archivia"
  | "importa"
  | "cancella"
  | "cambia-stato"
  | "assegna"
  | "preventivo-definitivo"
  | "anonimizza"
  | "crea-utente"
  | "attiva-utente"
  | "disattiva-utente"
  | "cambia-ruolo";

export interface AuditEntryInput {
  readonly userId: string | null;
  readonly dataset?: Dataset | null;
  /** Tipo di entità: `dataset_version`, `lead`, `user`, … */
  readonly entity: string;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly diff?: readonly DiffEntry[];
}

export interface AuditEntry {
  readonly id: number;
  readonly at: Date;
  readonly userId: string | null;
  readonly dataset: Dataset | null;
  readonly entity: string;
  readonly entityId: string;
  readonly action: string;
  readonly diff: readonly DiffEntry[];
}

/** Registra una voce (nella transazione dell'operazione, se passata). */
export async function record(entry: AuditEntryInput, db?: DbOrTx): Promise<AuditEntry> {
  const conn = db ?? (await getDb());
  const [row] = await conn
    .insert(auditLog)
    .values({
      at: new Date(),
      userId: entry.userId,
      dataset: entry.dataset ?? null,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      diff: entry.diff ?? [],
    })
    .returning();
  return row as AuditEntry;
}

export interface AuditFilter {
  readonly dataset?: Dataset;
  readonly userId?: string;
  readonly entity?: string;
  readonly entityId?: string;
  /** Default 100, massimo 500. */
  readonly limit?: number;
}

/** Voci dalla più recente, filtrabili per insieme di dati, utente o entità. */
export async function list(filter: AuditFilter = {}): Promise<AuditEntry[]> {
  const db = await getDb();
  const where: SQL[] = [];
  if (filter.dataset) where.push(eq(auditLog.dataset, filter.dataset));
  if (filter.userId) where.push(eq(auditLog.userId, filter.userId));
  if (filter.entity) where.push(eq(auditLog.entity, filter.entity));
  if (filter.entityId) where.push(eq(auditLog.entityId, filter.entityId));
  const limit = Math.min(Math.max(1, Math.trunc(filter.limit ?? 100)), 500);
  const rows = await db
    .select()
    .from(auditLog)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(limit);
  return rows as AuditEntry[];
}

export interface AuditMeta {
  readonly userId: string | null;
  readonly dataset?: Dataset | null;
  readonly entity: string;
  /** Se assente lo fornisce l'operazione (es. id appena creato). */
  readonly entityId?: string;
}

export interface Audited<T> {
  readonly result: T;
  /** Stato prima e dopo: la voce registra `diffDocuments(before, after)`. */
  readonly before: unknown;
  readonly after: unknown;
  readonly entityId?: string;
}

/**
 * Esegue un'operazione e ne registra la differenza prima/dopo nella stessa transazione
 * (se l'operazione fallisce, nessuna voce). Uso:
 * `withAudit("salva", { userId, dataset, entity })(tx, async () => ({ result, before, after }))`.
 */
export function withAudit(action: AuditAction, meta: AuditMeta) {
  return async <T>(tx: DbOrTx, op: () => Promise<Audited<T>>): Promise<T> => {
    const { result, before, after, entityId } = await op();
    const id = entityId ?? meta.entityId;
    if (!id) throw new Error(`withAudit(${action}): entityId mancante`);
    await record({ userId: meta.userId, dataset: meta.dataset ?? null, entity: meta.entity, entityId: id, action, diff: diffDocuments(before, after) }, tx);
    return result;
  };
}
