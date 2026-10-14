/**
 * Tipo `Assembly` e relativo schema. Definiti in `components` perché la
 * serializzazione (3.5) li valida; qui sono riesportati come API del modulo assieme.
 */
export type { Assembly, ParamValue } from "../components/types";
export { AssemblySchema, parseAssembly } from "../components/schemas";
