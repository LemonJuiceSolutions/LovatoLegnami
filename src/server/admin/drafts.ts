import type { Dataset } from "@/db/schema";
import { diffDocuments } from "@/domain/pricing/diff";
import { datasetStatus, userLabels, type DatasetStatusInfo } from "@/server/admin/overview";
import { can, ForbiddenError, type AuthUser, type Permission } from "@/server/auth";
import { priceListChangePermissions } from "@/server/auth/permissions";
import { validateDataset } from "@/server/repositories/dataset-schemas";
import { getActive, getDraft, openDraft, saveDraft, type DatasetVersion } from "@/server/repositories/datasets";
import { ConcurrentEditError, NotFoundError } from "@/server/repositories/errors";

/**
 * Mattoni comuni delle action che scrivono nelle bozze (salvataggio di sezione, import CSV,
 * pubblicazione). **Non** è un modulo `"use server"`: queste funzioni ricevono l'utente già
 * verificato e non devono essere invocabili dal client.
 */

/** Permessi di scrittura di ogni dataset (il listino è deciso per percorso). */
const DATASET_PERMISSION: Readonly<Record<Exclude<Dataset, "listino">, Permission>> = {
  regole: "regole:scrivi",
  tipologie: "tipologie:scrivi",
  preset: "preset:scrivi",
};

function assertCan(user: AuthUser, permission: Permission): void {
  if (!can(user, permission)) throw new ForbiddenError(permission);
}

/** Verifica dei permessi della modifica `before → after` del dataset. */
export async function assertCanChange(user: AuthUser, dataset: Dataset, before: unknown, after: unknown): Promise<void> {
  if (dataset !== "listino") return assertCan(user, DATASET_PERMISSION[dataset]);
  const paths = diffDocuments(before, after).map((d) => d.path);
  const needed = priceListChangePermissions(paths);
  if (!needed.length && !can(user, "listino:scrivi")) assertCan(user, "listino-tecnico:scrivi");
  for (const p of needed) assertCan(user, p);
}

async function staleDraft(draft: DatasetVersion): Promise<ConcurrentEditError> {
  const labels = await userLabels([draft.updatedBy]);
  return new ConcurrentEditError((draft.updatedBy && labels.get(draft.updatedBy)) || "un altro utente", draft.updatedAt);
}

/**
 * Bozza di partenza per una modifica: la bozza esistente se coincide con quella letta
 * dall'utente, altrimenti errore di lock; senza bozza letta, il documento attivo (la bozza
 * è creata solo dopo i controlli, da `commit`).
 */
export async function resolveBase(dataset: Dataset, expectedUpdatedAt: string | null): Promise<{ doc: unknown; draft: DatasetVersion | null; expected: Date | null }> {
  const draft = await getDraft(dataset);
  if (expectedUpdatedAt === null) {
    if (draft) throw await staleDraft(draft);
    const active = await getActive(dataset);
    if (!active) throw new NotFoundError(`nessuna versione attiva di ${dataset} da modificare`);
    return { doc: active.data, draft: null, expected: null };
  }
  if (!draft) throw new NotFoundError("la bozza non esiste più (forse è stata pubblicata): ricarica la pagina");
  const expected = new Date(expectedUpdatedAt);
  if (draft.updatedAt.getTime() !== expected.getTime()) throw await staleDraft(draft);
  return { doc: draft.data, draft, expected };
}

/** Scrive il documento già validato nella bozza (creandola se serve) e restituisce lo stato aggiornato. */
export async function commitDraft(
  user: AuthUser,
  dataset: Dataset,
  next: unknown,
  base: { draft: DatasetVersion | null; expected: Date | null },
  auditAction: "salva" | "importa" = "salva",
): Promise<DatasetStatusInfo> {
  validateDataset(dataset, next);
  const draft = base.draft ?? (await openDraft(dataset, user.id));
  await saveDraft(dataset, next, base.expected ?? draft.updatedAt, user.id, { auditAction });
  return datasetStatus(dataset);
}

