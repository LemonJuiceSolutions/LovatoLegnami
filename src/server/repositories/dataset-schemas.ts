import { z } from "zod";
import { ValidationError, formatPath } from "@/domain/components/errors";
import { parsePriceList, type PriceList } from "@/domain/pricing/types";
import { loadRuleSet, type RuleSet } from "@/domain/rules/types";
import type { Dataset } from "@/db/schema";
import { DatasetValidationError } from "./errors";

/**
 * Validatore di ogni insieme di dati (P5): stesso schema del dominio alla scrittura e
 * alla lettura. Il valore restituito (normalizzato, con i default) è quello salvato.
 */

export interface DatasetDocuments {
  listino: PriceList;
  regole: RuleSet;
  tipologie: unknown[];
  preset: unknown[];
}

type Parser<T> = (data: unknown) => T;

const fromZod =
  <T>(schema: z.ZodType<T>): Parser<T> =>
  (data) => {
    const r = schema.safeParse(data);
    if (!r.success)
      throw new ValidationError(
        "documento non valido",
        r.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })),
      );
    return r.data;
  };

const PARSERS: { [D in Dataset]: Parser<DatasetDocuments[D]> } = {
  listino: parsePriceList,
  regole: loadRuleSet,
  // Schemi definitivi nel task 6.5.
  tipologie: fromZod(z.array(z.unknown())),
  preset: fromZod(z.array(z.unknown())),
};

/** Valida il documento dell'insieme; `DatasetValidationError` con i campi errati. */
export function validateDataset<D extends Dataset>(dataset: D, data: unknown): DatasetDocuments[D] {
  try {
    return PARSERS[dataset](data);
  } catch (e) {
    if (e instanceof ValidationError) throw new DatasetValidationError(dataset, e.issues);
    throw e;
  }
}
