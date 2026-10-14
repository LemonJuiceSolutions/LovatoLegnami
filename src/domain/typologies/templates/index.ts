import type { TypologyTemplate } from "../template";
import { addossataMonofalda } from "./addossata-monofalda";

export { addossataMonofalda };

/** Template di tipologia inclusi nel prodotto, nell'ordine di elenco. */
export const BUILTIN_TEMPLATES: readonly TypologyTemplate[] = [addossataMonofalda];
