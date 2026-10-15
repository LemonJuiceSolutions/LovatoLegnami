"use server";

import { z } from "zod";
import { importTable, PRICE_TABLES } from "@/domain/pricing/csv";
import type { PriceList } from "@/domain/pricing/types";
import { assertCanChange, commitDraft, resolveBase } from "@/server/admin/drafts";
import type { DatasetStatusInfo } from "@/server/admin/overview";
import { requireUser } from "@/server/auth";
import { DatasetValidationError } from "@/server/repositories/errors";
import { csvLimitError } from "@/components/admin/listino/csv-limits";
import { runAction, type ActionResult } from "./result";

/**
 * Import CSV di una tabella del listino nella bozza (9.5). L'anteprima è calcolata nel
 * browser con la stessa funzione del dominio; qui il CSV è **rianalizzato sul server** sul
 * documento della bozza (il client non è fidato): limiti di dimensione e righe, errori per
 * riga, permessi sulla differenza, voce di registro `importa`.
 */

const ImportSchema = z
  .object({
    table: z.enum(PRICE_TABLES),
    csv: z.string().superRefine((s, ctx) => {
      const error = csvLimitError(s);
      if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }),
    expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export async function importPriceListCsv(input: z.input<typeof ImportSchema>): Promise<ActionResult<DatasetStatusInfo>> {
  return runAction(async () => {
    const user = await requireUser();
    const v = ImportSchema.parse(input);
    const base = await resolveBase("listino", v.expectedUpdatedAt);
    const result = importTable(base.doc as PriceList, v.table, v.csv);
    if (!result.next) throw new DatasetValidationError("CSV", result.errors.map((message) => ({ path: "", message })));
    await assertCanChange(user, "listino", base.doc, result.next);
    return commitDraft(user, "listino", result.next, base, "importa");
  });
}
