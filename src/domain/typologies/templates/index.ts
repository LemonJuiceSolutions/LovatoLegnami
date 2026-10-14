import type { TypologyTemplate } from "../template";
import { addossataMonofalda } from "./addossata-monofalda";
import { addossataSandwich } from "./addossata-sandwich";
import { autoportanteBifalda } from "./autoportante-bifalda";
import { carportArco } from "./carport-arco";
import { monofaldaScalare } from "./monofalda-scalare";
import { portaleSandwich } from "./portale-sandwich";
import { telaioGiunti } from "./telaio-giunti";

export { addossataMonofalda, addossataSandwich, autoportanteBifalda, carportArco, monofaldaScalare, portaleSandwich, telaioGiunti };

/** Template di tipologia inclusi nel prodotto, nell'ordine di elenco. */
export const BUILTIN_TEMPLATES: readonly TypologyTemplate[] = [
  addossataMonofalda,
  autoportanteBifalda,
  portaleSandwich,
  addossataSandwich,
  monofaldaScalare,
  telaioGiunti,
  carportArco,
];
