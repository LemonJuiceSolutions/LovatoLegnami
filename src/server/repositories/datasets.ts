import { and, desc, eq, getTableColumns, lte, max } from "drizzle-orm";
import { diffDocuments, type DiffEntry } from "@/domain/pricing/diff";
import { isoDay } from "@/domain/pricing/types";
import { getDb, type DbOrTx } from "@/db/client";
import { datasetVersions, users, type Dataset, type DatasetStatus, type DatasetVersionRow } from "@/db/schema";
import { record, withAudit } from "./audit";
import { validateDataset, type DatasetDocuments } from "./dataset-schemas";
import { ConcurrentEditError, NotFoundError } from "./errors";

/**
 * Insiemi di dati versionati (spec `listini-versionati`, P5): listino, regole, tipologie
 * e preset come documenti interi `jsonb` con stati `bozza → attiva → archiviata`.
 *
 * - al più una bozza per insieme (indice parziale): `openDraft` riusa quella esistente;
 * - ogni scrittura è validata con lo schema del dominio (`validateDataset`), e anche la
 *   lettura: un documento salvato con uno schema vecchio non passa in silenzio;
 * - `saveDraft` usa un lock ottimistico su `updatedAt`;
 * - `publishDraft` attiva la bozza e archivia l'attiva con la stessa validità, in una
 *   transazione.
 */

export interface DatasetVersion<D extends Dataset = Dataset> {
  readonly id: string;
  readonly dataset: D;
  readonly version: number;
  readonly status: DatasetStatus;
  readonly effectiveFrom: string;
  readonly data: DatasetDocuments[D];
  readonly notes: string | null;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedBy: string | null;
  readonly updatedAt: Date;
  readonly publishedBy: string | null;
  readonly publishedAt: Date | null;
}

/** Versione senza documento, per gli elenchi. */
export type DatasetVersionSummary<D extends Dataset = Dataset> = Omit<DatasetVersion<D>, "data">;

const toVersion = <D extends Dataset>(row: DatasetVersionRow): DatasetVersion<D> => ({
  ...row,
  dataset: row.dataset as D,
  data: validateDataset(row.dataset as D, row.data),
});

function summaryColumnsOf() {
  const { data, ...rest } = getTableColumns(datasetVersions);
  void data;
  return rest;
}
const summaryColumns = summaryColumnsOf();

/** Versione attiva alla data (default oggi): l'ultima validità ≤ data, a parità la versione più alta. */
export async function getActive<D extends Dataset>(dataset: D, date: Date | string = new Date(), db?: DbOrTx): Promise<DatasetVersion<D> | null> {
  const conn = db ?? (await getDb());
  const [row] = await conn
    .select()
    .from(datasetVersions)
    .where(and(eq(datasetVersions.dataset, dataset), eq(datasetVersions.status, "attiva"), lte(datasetVersions.effectiveFrom, isoDay(date))))
    .orderBy(desc(datasetVersions.effectiveFrom), desc(datasetVersions.version))
    .limit(1);
  return row ? toVersion<D>(row) : null;
}

/** Bozza in corso dell'insieme, se esiste. */
export async function getDraft<D extends Dataset>(dataset: D, db?: DbOrTx): Promise<DatasetVersion<D> | null> {
  const conn = db ?? (await getDb());
  const [row] = await conn
    .select()
    .from(datasetVersions)
    .where(and(eq(datasetVersions.dataset, dataset), eq(datasetVersions.status, "bozza")))
    .limit(1);
  return row ? toVersion<D>(row) : null;
}

export async function getVersion(id: string, db?: DbOrTx): Promise<DatasetVersion> {
  const conn = db ?? (await getDb());
  const [row] = await conn.select().from(datasetVersions).where(eq(datasetVersions.id, id)).limit(1);
  if (!row) throw new NotFoundError(`versione ${id} non trovata`);
  return toVersion(row);
}

export interface OpenDraftOptions {
  /** Validità della nuova bozza; default: quella della versione di partenza, o oggi. */
  readonly effectiveFrom?: string;
  readonly notes?: string;
}

/**
 * Bozza dell'insieme: quella esistente se c'è (bozza unica), altrimenti una nuova
 * versione (numero successivo al massimo) copiata dall'attiva di oggi o, in mancanza,
 * dall'ultima versione. Senza alcuna versione serve `createVersion` (seed).
 */
export async function openDraft<D extends Dataset>(dataset: D, userId: string | null, options: OpenDraftOptions = {}): Promise<DatasetVersion<D>> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const existing = await getDraft(dataset, tx);
    if (existing) return existing;
    const base =
      (await getActive(dataset, new Date(), tx)) ??
      (await tx
        .select()
        .from(datasetVersions)
        .where(eq(datasetVersions.dataset, dataset))
        .orderBy(desc(datasetVersions.version))
        .limit(1)
        .then(([r]) => (r ? toVersion<D>(r) : null)));
    if (!base) throw new NotFoundError(`nessuna versione di ${dataset} da cui partire`);
    const at = new Date();
    const [row] = await tx
      .insert(datasetVersions)
      .values({
        dataset,
        version: (await nextVersion(dataset, tx)),
        status: "bozza",
        effectiveFrom: options.effectiveFrom ?? base.effectiveFrom,
        data: base.data,
        notes: options.notes ?? null,
        createdBy: userId,
        createdAt: at,
        updatedBy: userId,
        updatedAt: at,
      })
      .returning();
    await record({ userId, dataset, entity: ENTITY, entityId: row!.id, action: "crea" }, tx);
    return toVersion<D>(row!);
  });
}

const ENTITY = "dataset_version";

async function nextVersion(dataset: Dataset, db: DbOrTx): Promise<number> {
  const [r] = await db.select({ v: max(datasetVersions.version) }).from(datasetVersions).where(eq(datasetVersions.dataset, dataset));
  return (r?.v ?? 0) + 1;
}

export interface CreateVersionInput<D extends Dataset> {
  readonly dataset: D;
  readonly data: unknown;
  readonly status: DatasetStatus;
  readonly effectiveFrom: string;
  readonly version?: number;
  readonly notes?: string;
  readonly userId?: string | null;
}

/** Inserisce una versione già decisa (seed, import): validata, numero successivo se non dato. */
export async function createVersion<D extends Dataset>(input: CreateVersionInput<D>, db?: DbOrTx): Promise<DatasetVersion<D>> {
  const conn = db ?? (await getDb());
  const data = validateDataset(input.dataset, input.data);
  const at = new Date();
  const [row] = await conn
    .insert(datasetVersions)
    .values({
      dataset: input.dataset,
      version: input.version ?? (await nextVersion(input.dataset, conn)),
      status: input.status,
      effectiveFrom: input.effectiveFrom,
      data,
      notes: input.notes ?? null,
      createdBy: input.userId ?? null,
      createdAt: at,
      updatedBy: input.userId ?? null,
      updatedAt: at,
      ...(input.status === "attiva" ? { publishedAt: at, publishedBy: input.userId ?? null } : {}),
    })
    .returning();
  await record({ userId: input.userId ?? null, dataset: input.dataset, entity: ENTITY, entityId: row!.id, action: "crea" }, conn);
  return toVersion<D>(row!);
}

async function lockDraft(dataset: Dataset, tx: DbOrTx): Promise<DatasetVersionRow> {
  const [row] = await tx
    .select()
    .from(datasetVersions)
    .where(and(eq(datasetVersions.dataset, dataset), eq(datasetVersions.status, "bozza")))
    .for("update")
    .limit(1);
  if (!row) throw new NotFoundError(`nessuna bozza di ${dataset} aperta`);
  return row;
}

async function userLabel(userId: string | null, db: DbOrTx): Promise<string> {
  if (!userId) return "un altro utente";
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u ? (u.name ?? u.email) : "un altro utente";
}

export interface SaveDraftOptions {
  readonly notes?: string | null;
  readonly effectiveFrom?: string;
  /** Azione del registro: `salva` (default) o `importa` (import CSV, 9.5). */
  readonly auditAction?: "salva" | "importa";
}

/**
 * Salva il documento nella bozza. Il documento è validato prima di scrivere (errore ⇒
 * bozza intatta); `expectedUpdatedAt` è l'`updatedAt` letto dall'utente: se la bozza è
 * cambiata nel frattempo `ConcurrentEditError` ("bozza modificata da …").
 */
export async function saveDraft<D extends Dataset>(
  dataset: D,
  data: unknown,
  expectedUpdatedAt: Date,
  userId: string | null,
  options: SaveDraftOptions = {},
): Promise<DatasetVersion<D>> {
  const db = await getDb();
  const doc = validateDataset(dataset, data);
  return db.transaction(async (tx) => {
    const draft = await lockDraft(dataset, tx);
    if (draft.updatedAt.getTime() !== expectedUpdatedAt.getTime())
      throw new ConcurrentEditError(await userLabel(draft.updatedBy, tx), draft.updatedAt);
    // Sempre strettamente crescente, anche con due salvataggi nello stesso millisecondo.
    const at = new Date(Math.max(Date.now(), draft.updatedAt.getTime() + 1));
    return withAudit(options.auditAction ?? "salva", { userId, dataset, entity: ENTITY, entityId: draft.id })(tx, async () => {
      const [row] = await tx
        .update(datasetVersions)
        .set({
          data: doc,
          updatedAt: at,
          updatedBy: userId,
          ...(options.notes !== undefined ? { notes: options.notes } : {}),
          ...(options.effectiveFrom !== undefined ? { effectiveFrom: options.effectiveFrom } : {}),
        })
        .where(eq(datasetVersions.id, draft.id))
        .returning();
      return { result: toVersion<D>(row!), before: draft.data, after: doc };
    });
  });
}

export interface PublishResult<D extends Dataset> {
  readonly published: DatasetVersion<D>;
  /** Versione attiva con la stessa validità passata ad archiviata, se c'era. */
  readonly archived: DatasetVersionSummary<D> | null;
}

/** Pubblica la bozza: validazione completa, poi attiva la bozza e archivia l'attiva con la stessa validità. */
export async function publishDraft<D extends Dataset>(dataset: D, userId: string | null, options: { expectedUpdatedAt?: Date } = {}): Promise<PublishResult<D>> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const draft = await lockDraft(dataset, tx);
    // la bozza provata prima della pubblicazione deve essere quella pubblicata
    if (options.expectedUpdatedAt && draft.updatedAt.getTime() !== options.expectedUpdatedAt.getTime())
      throw new ConcurrentEditError(await userLabel(draft.updatedBy, tx), draft.updatedAt);
    const doc = validateDataset(dataset, draft.data);
    const at = new Date();
    // Base del confronto: l'attiva con la stessa validità, altrimenti quella in vigore a quella data.
    const previous = await getActive(dataset, draft.effectiveFrom, tx);
    const [archivedRow] = await tx
      .update(datasetVersions)
      .set({ status: "archiviata", updatedAt: at, updatedBy: userId })
      .where(and(eq(datasetVersions.dataset, dataset), eq(datasetVersions.status, "attiva"), eq(datasetVersions.effectiveFrom, draft.effectiveFrom)))
      .returning(summaryColumns);
    const [row] = await tx
      .update(datasetVersions)
      .set({ status: "attiva", data: doc, publishedAt: at, publishedBy: userId, updatedAt: at, updatedBy: userId })
      .where(eq(datasetVersions.id, draft.id))
      .returning();
    await record({ userId, dataset, entity: ENTITY, entityId: draft.id, action: "pubblica", diff: diffDocuments(previous?.data ?? null, doc) }, tx);
    if (archivedRow) await record({ userId, dataset, entity: ENTITY, entityId: archivedRow.id, action: "archivia" }, tx);
    return {
      published: toVersion<D>(row!),
      archived: archivedRow ? ({ ...archivedRow, dataset } as DatasetVersionSummary<D>) : null,
    };
  });
}

/** Versioni dell'insieme (senza documento), dalla più recente. */
export async function listVersions<D extends Dataset>(dataset: D): Promise<DatasetVersionSummary<D>[]> {
  const db = await getDb();
  const rows = await db.select(summaryColumns).from(datasetVersions).where(eq(datasetVersions.dataset, dataset)).orderBy(desc(datasetVersions.version));
  return rows as DatasetVersionSummary<D>[];
}

/** Differenze del documento da `aId` a `bId` (percorso, valore precedente e nuovo). */
export async function diff(aId: string, bId: string): Promise<DiffEntry[]> {
  const [a, b] = await Promise.all([getVersion(aId), getVersion(bId)]);
  if (a.dataset !== b.dataset) throw new NotFoundError(`le versioni ${aId} e ${bId} appartengono a insiemi diversi`);
  return diffDocuments(a.data, b.data);
}
