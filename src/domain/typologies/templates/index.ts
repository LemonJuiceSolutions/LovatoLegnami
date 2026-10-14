import type { TypologyTemplate } from "../template";
import { addossataMonofalda } from "./addossata-monofalda";
import { autoportanteBifalda } from "./autoportante-bifalda";

export { addossataMonofalda, autoportanteBifalda };

/** Template di tipologia inclusi nel prodotto, nell'ordine di elenco. */
export const BUILTIN_TEMPLATES: readonly TypologyTemplate[] = [addossataMonofalda, autoportanteBifalda];
