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

const valueSize = (value: unknown): number => {
  try {
    return JSON.stringify(value ?? null).length;
  } catch {
    return Infinity;
  }
};

const ChangeSchema = z.object({ path: z.string().max(100), value: z.unknown() }).strict();

const SaveSectionsSchema = z
  .object({
    dataset: z.enum(DATASETS),
    changes: z.array(ChangeSchema).min(1).max(30),
    /** `updatedAt` della bozza letta dall'utente (ISO), `null` se la pagina non aveva bozza. */
    expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    v.changes.forEach((c, i) => {
      if (!isSectionPath(v.dataset, c.path)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["changes", i, "path"], message: `percorso non ammesso per ${v.dataset}: "${c.path}"` });
    });
    if (valueSize(v.changes.map((c) => c.value)) > MAX_VALUE_CHARS) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["changes"], message: "valore troppo grande" });
  });

export type SaveSectionsInput = z.input<typeof SaveSectionsSchema>;
export interface SaveSectionInput {
  readonly dataset: (typeof DATASETS)[number];
  readonly path: string;
  readonly value: unknown;
  readonly expectedUpdatedAt: string | null;
}

/**
 * Salva una o più porzioni (`changes: [{ path, value }]`) nella bozza del dataset in un
 * solo salvataggio (una voce di registro). Esito con lo stato aggiornato (nuovo
 * `updatedAt` per il lock del salvataggio successivo).
 */
export async function saveDraftSections(input: SaveSectionsInput): Promise<ActionResult<DatasetStatusInfo>> {
  return runAction(async () => {
    const user = await requireUser();
    const v = SaveSectionsSchema.parse(input);
    const base = await resolveBase(v.dataset, v.expectedUpdatedAt);
    let next = base.doc;
    for (const c of v.changes) {
      const remove = c.value === null && OPTIONAL_SECTION_PATHS.includes(c.path);
      next = setAtPath(next, c.path, remove ? undefined : c.value);
    }
    await assertCanChange(user, v.dataset, base.doc, next);
    // nessuna modifica su una bozza esistente: niente scrittura né voce di registro
    if (base.draft && v.changes.every((c) => JSON.stringify(getAtPath(base.doc, c.path) ?? null) === JSON.stringify(getAtPath(next, c.path) ?? null))) return datasetStatus(v.dataset);
    return commitDraft(user, v.dataset, next, base);
  });
}

/** Salva `value` al percorso `path` della bozza (una porzione). */
export async function saveDraftSection(input: SaveSectionInput): Promise<ActionResult<DatasetStatusInfo>> {
  const { path, value, ...rest } = (input ?? {}) as SaveSectionInput;
  return saveDraftSections({ ...rest, changes: [{ path, value }] });
}
