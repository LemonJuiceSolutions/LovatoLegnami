import { ValidationError } from "@/domain/components/errors";
import { parsePresets } from "@/domain/presets/schema";
import type { Preset } from "@/domain/presets/types";
import { parsePriceList, type PriceList } from "@/domain/pricing/types";
import { loadRuleSet, type RuleSet } from "@/domain/rules/types";
import { parseTypologySettings, type TypologySettings } from "@/domain/site/typology-settings";
import type { Dataset } from "@/db/schema";
import { DatasetValidationError } from "./errors";

/**
 * Validatore di ogni insieme di dati (P5): stesso schema del dominio alla scrittura e
 * alla lettura. Il valore restituito (normalizzato, con i default) è quello salvato.
 */

export interface DatasetDocuments {
  listino: PriceList;
  regole: RuleSet;
  tipologie: TypologySettings;
  preset: Preset[];
}

type Parser<T> = (data: unknown) => T;

const PARSERS: { [D in Dataset]: Parser<DatasetDocuments[D]> } = {
  listino: parsePriceList,
  regole: loadRuleSet,
  tipologie: (data) => parseTypologySettings(data),
  preset: (data) => parsePresets(data),
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
