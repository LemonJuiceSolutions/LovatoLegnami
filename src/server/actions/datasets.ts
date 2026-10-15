"use server";

import { z } from "zod";
import { DATASETS } from "@/db/schema";
import { assertCanChange, commitDraft, resolveBase } from "@/server/admin/drafts";
import { datasetStatus, type DatasetStatusInfo } from "@/server/admin/overview";
import { getAtPath, isSectionPath, OPTIONAL_SECTION_PATHS, setAtPath } from "@/server/admin/sections";
import { requireUser } from "@/server/auth";
import { runAction, type ActionResult } from "./result";

/**
 * Salvataggio delle porzioni di bozza dai form admin (P10, 9.2). Ogni chiamata:
 * 1. autentica e rilegge l'utente (`requireUser`);
 * 2. valida l'ingresso (dataset, percorso ammesso, dimensione, data del lock);
 * 3. verifica il permesso **sulle parti effettivamente cambiate** (listino: tecnico vs
 *    commerciale per percorso) o sul dataset;
 * 4. valida il documento risultante con lo schema del dominio prima di creare la bozza;
 * 5. salva con lock ottimistico e voce di registro (`saveDraft`).
 */

const MAX_VALUE_CHARS = 2_000_000;

const SaveSectionSchema = z
  .object({
    dataset: z.enum(DATASETS),
    path: z.string().max(100),
    value: z.unknown(),
    /** `updatedAt` della bozza letta dall'utente (ISO), `null` se la pagina non aveva bozza. */
    expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!isSectionPath(v.dataset, v.path)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["path"], message: `percorso non ammesso per ${v.dataset}: "${v.path}"` });
    let size = 0;
    try {
      size = JSON.stringify(v.value ?? null).length;
    } catch {
      size = Infinity;
    }
    if (size > MAX_VALUE_CHARS) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "valore troppo grande" });
  });

export type SaveSectionInput = z.input<typeof SaveSectionSchema>;

/**
 * Salva `value` al percorso `path` della bozza del dataset. Esito con lo stato aggiornato
 * (nuovo `updatedAt` per il lock del salvataggio successivo).
 */
export async function saveDraftSection(input: SaveSectionInput): Promise<ActionResult<DatasetStatusInfo>> {
  return runAction(async () => {
    const user = await requireUser();
    const v = SaveSectionSchema.parse(input);
    const base = await resolveBase(v.dataset, v.expectedUpdatedAt);
    const remove = v.value === null && OPTIONAL_SECTION_PATHS.includes(v.path);
    const next = setAtPath(base.doc, v.path, remove ? undefined : v.value);
    await assertCanChange(user, v.dataset, base.doc, next);
    // nessuna modifica su una bozza esistente: niente scrittura né voce di registro
    if (base.draft && JSON.stringify(getAtPath(base.doc, v.path) ?? null) === JSON.stringify(getAtPath(next, v.path) ?? null)) return datasetStatus(v.dataset);
    return commitDraft(user, v.dataset, next, base);
  });
}
