import { revalidatePath, revalidateTag } from "next/cache";
import type { Dataset } from "@/db/schema";
import type { Preset, PriceList, RuleSet, TypologySettings } from "@/domain";
import { getActive } from "@/server/repositories/datasets";
import { invalidatePublicCatalog } from "@/server/quotes/catalog";
import { checkPresets, checkPriceList, checkRuleSet, checkTypologySettings, presetsOrCatalog, visibleTypologies, type PublishCheck } from "./publish-checks";

/**
 * Prove di pubblicazione con i dati degli altri dataset in vigore e invalidazione delle
 * cache del sito dopo la pubblicazione. Modulo server, non `"use server"`.
 */

export async function runPublishChecks(dataset: Dataset, doc: unknown): Promise<PublishCheck> {
  switch (dataset) {
    case "regole": {
      const settings = (await getActive("tipologie"))?.data ?? null;
      return checkRuleSet(doc as RuleSet, visibleTypologies(settings));
    }
    case "listino":
      return checkPriceList(doc as PriceList, presetsOrCatalog((await getActive("preset"))?.data));
    case "tipologie":
      return checkTypologySettings(doc as TypologySettings, presetsOrCatalog((await getActive("preset"))?.data));
    case "preset":
      return checkPresets(doc as Preset[], (await getActive("tipologie"))?.data ?? null);
  }
}

/**
 * Dopo una pubblicazione: cache del catalogo pubblico (stima, regole) e pagine del sito.
 * `revalidateTag`/`revalidatePath` funzionano solo dentro una richiesta di Next (fuori,
 * es. nei test, lanciano): l'errore è ignorato, la cache del catalogo scade comunque in 60 s.
 */
export function revalidateSite(dataset: Dataset): void {
  invalidatePublicCatalog();
  try {
    revalidateTag(dataset);
    revalidatePath("/", "layout");
  } catch {
    // fuori da una richiesta di Next
  }
}
