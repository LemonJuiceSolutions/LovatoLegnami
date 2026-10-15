import { revalidatePath, revalidateTag } from "next/cache";
import { invalidatePublicCatalog } from "@/server/quotes/catalog";

/** Tag di cache delle pagine pubbliche (gruppo 11: contenuti del sito, 300 s). */
export const PUBLIC_SITE_TAG = "tipologie";

/**
 * Dopo la pubblicazione di **qualunque** dataset (listino, regole, tipologie, preset): cache
 * del catalogo pubblico (stima, regole) e pagine del sito (tag `tipologie`, più il dataset
 * stesso e l'intero layout). `revalidateTag`/`revalidatePath` funzionano solo dentro una
 * richiesta di Next (fuori, es. nei test o negli script, lanciano): l'errore è ignorato, le
 * cache scadono comunque da sole.
 */
export function revalidatePublicSite(dataset?: string): void {
  invalidatePublicCatalog();
  for (const step of [
    () => revalidateTag(PUBLIC_SITE_TAG),
    () => dataset && dataset !== PUBLIC_SITE_TAG && revalidateTag(dataset),
    () => revalidatePath("/", "layout"),
  ]) {
    try {
      step();
    } catch {
      // fuori da una richiesta di Next
    }
  }
}
