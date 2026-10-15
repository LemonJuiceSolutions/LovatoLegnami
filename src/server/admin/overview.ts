import { inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users, type Dataset } from "@/db/schema";
import { getActive, getDraft, type DatasetVersion } from "@/server/repositories/datasets";
import { list as listLeads } from "@/server/repositories/leads";
import { DATASET_LABELS, type DatasetStatusInfo, type VersionInfo } from "@/components/admin/types";

/**
 * Stato delle versioni per l'area admin (9.1): attiva e bozza di ogni insieme di dati con
 * autore e data già in forma leggibile (formattati sul server, così server e client
 * mostrano lo stesso testo).
 */

export type { VersionInfo, DatasetStatusInfo };
export { DATASET_LABELS };

export const formatDateTime = (d: Date): string =>
  d.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Nome (o email) degli utenti per id. */
export async function userLabels(ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((v): v is string => !!v))];
  if (!wanted.length) return new Map();
  const db = await getDb();
  const rows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.name ?? r.email]));
}

function info(v: DatasetVersion | null, who: "updated" | "published", labels: Map<string, string>): VersionInfo | null {
  if (!v) return null;
  const by = who === "published" ? (v.publishedBy ?? v.updatedBy) : v.updatedBy;
  const at = who === "published" ? (v.publishedAt ?? v.updatedAt) : v.updatedAt;
  return {
    id: v.id,
    version: v.version,
    effectiveFrom: v.effectiveFrom,
    notes: v.notes,
    updatedAt: v.updatedAt.toISOString(),
    by: by ? (labels.get(by) ?? null) : null,
    at: formatDateTime(at),
  };
}

/** Attiva di oggi e bozza dell'insieme, con autori. */
export async function datasetStatus(dataset: Dataset): Promise<DatasetStatusInfo> {
  const [active, draft] = await Promise.all([getActive(dataset), getDraft(dataset)]);
  const labels = await userLabels([active?.publishedBy, active?.updatedBy, draft?.updatedBy]);
  return { dataset, active: info(active, "published", labels), draft: info(draft, "updated", labels) };
}

/** Documento su cui lavora l'editor: la bozza se c'è, altrimenti l'attiva (la bozza nasce al primo salvataggio). */
export async function editableDocument<D extends Dataset>(dataset: D): Promise<{ status: DatasetStatusInfo; data: DatasetVersion<D>["data"] | null }> {
  const [status, draft, active] = await Promise.all([datasetStatus(dataset), getDraft(dataset), getActive(dataset)]);
  return { status, data: (draft ?? active)?.data ?? null };
}

/** Numero di richieste nello stato `nuovo` (riepilogo). */
export async function newLeadsCount(): Promise<number> {
  return (await listLeads({ status: "nuovo", pageSize: 1 })).total;
}
