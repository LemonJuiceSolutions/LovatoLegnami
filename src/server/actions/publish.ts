"use server";

import { z } from "zod";
import { DATASETS, type Dataset } from "@/db/schema";
import { diffDocuments, type DiffEntry } from "@/domain/pricing/diff";
import { IsoDateSchema } from "@/domain/pricing/types";
import { resolveBase } from "@/server/admin/drafts";
import { datasetStatus, type DatasetStatusInfo } from "@/server/admin/overview";
import { revalidateSite, runPublishChecks } from "@/server/admin/publish";
import { can, ForbiddenError, requireUser, type AuthUser } from "@/server/auth";
import { canPublishPriceList } from "@/server/auth/permissions";
import { getActive, getDraft, publishDraft, saveDraft } from "@/server/repositories/datasets";
import { ConflictError, NotFoundError } from "@/server/repositories/errors";
import { runAction, type ActionResult } from "./result";

/**
 * Pubblicazione delle bozze (P10, 9.4): anteprima con le differenze rispetto alla versione
 * in vigore e le prove; pubblicazione con validità e note, prove bloccanti (regole sulle
 * tipologie visibili, listino sui preset, riferimenti tra tipologie e preset), poi
 * attivazione in transazione e invalidazione delle cache del sito.
 */

const MAX_DIFF = 500;

function assertCanPublish(user: AuthUser, dataset: Dataset): void {
  if (dataset === "listino") {
    if (!canPublishPriceList(user)) throw new ForbiddenError("listino:scrivi");
    return;
  }
  const permission = dataset === "regole" ? "regole:scrivi" : dataset === "tipologie" ? "tipologie:scrivi" : "preset:scrivi";
  if (!can(user, permission)) throw new ForbiddenError(permission);
}

export interface PublishPreview {
  readonly status: DatasetStatusInfo;
  /** Differenze bozza ↔ versione in vigore alla validità della bozza (al massimo 500). */
  readonly diff: readonly DiffEntry[];
  readonly totalDiff: number;
  readonly blocking: readonly string[];
  readonly warnings: readonly string[];
}

const DatasetSchema = z.enum(DATASETS);

export async function getPublishPreview(dataset: Dataset): Promise<ActionResult<PublishPreview>> {
  return runAction(async () => {
    const user = await requireUser();
    const d = DatasetSchema.parse(dataset);
    assertCanPublish(user, d);
    const draft = await getDraft(d);
    if (!draft) throw new NotFoundError("nessuna bozza da pubblicare");
    const previous = await getActive(d, draft.effectiveFrom);
    const diff = diffDocuments(previous?.data ?? null, draft.data);
    const checks = await runPublishChecks(d, draft.data);
    return { status: await datasetStatus(d), diff: diff.slice(0, MAX_DIFF), totalDiff: diff.length, ...checks };
  });
}

const PublishSchema = z
  .object({
    dataset: DatasetSchema,
    effectiveFrom: IsoDateSchema.refine((s) => !Number.isNaN(Date.parse(s)), "data non valida"),
    notes: z.string().trim().max(2000).nullable(),
    /** Lock: la bozza vista nell'anteprima. */
    expectedUpdatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export interface PublishOutcome {
  readonly version: number;
  readonly archivedVersion: number | null;
  readonly status: DatasetStatusInfo;
  readonly warnings: readonly string[];
}

export async function publishDataset(input: z.input<typeof PublishSchema>): Promise<ActionResult<PublishOutcome>> {
  return runAction(async () => {
    const user = await requireUser();
    const v = PublishSchema.parse(input);
    assertCanPublish(user, v.dataset);
    const base = await resolveBase(v.dataset, v.expectedUpdatedAt);
    let draft = base.draft!;
    if (draft.effectiveFrom !== v.effectiveFrom || (draft.notes ?? null) !== (v.notes || null))
      draft = await saveDraft(v.dataset, draft.data, draft.updatedAt, user.id, { effectiveFrom: v.effectiveFrom, notes: v.notes || null });
    const checks = await runPublishChecks(v.dataset, draft.data);
    if (checks.blocking.length) throw new ConflictError(`pubblicazione rifiutata: ${checks.blocking.join("; ")}`);
    const { published, archived } = await publishDraft(v.dataset, user.id, { expectedUpdatedAt: draft.updatedAt });
    revalidateSite(v.dataset);
    return { version: published.version, archivedVersion: archived?.version ?? null, status: await datasetStatus(v.dataset), warnings: checks.warnings };
  });
}
