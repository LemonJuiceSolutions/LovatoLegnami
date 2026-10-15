import type { Dataset } from "@/db/schema";
import { isForbiddenKey } from "@/domain/pricing/csv";

/**
 * Porzioni dei documenti modificabili dai form dell'area admin (P10, 9.2): ogni form
 * scrive **una** porzione della bozza (`saveDraftSection(dataset, path, value)`) e solo i
 * percorsi elencati qui sono ammessi. `""` = documento intero (tipologie, preset: elenchi
 * modificati riga per riga dalla stessa tabella).
 */

export const SECTION_PATHS: Readonly<Record<Dataset, readonly string[]>> = {
  listino: [
    "timber.species",
    "timber.qualities",
    "timber.pricePerM3",
    "timber.pricePerMl",
    "timber.curvedPerMl",
    "timber.curvedSetupCents",
    "timber.panelsPerM2",
    "timber.stockLengths",
    "timber.kerf",
    "timber.endTrim",
    "timber.minReusableOffcut",
    "timber.offcutRecoveryPct",
    "machining.hourlyRateCents",
    "machining.handlingMinPerPiece",
    "machining.perType",
    "hardware.priceCents",
    "treatments",
    "coverings",
    "labour.hourlyRateCents",
    "labour.crewSize",
    "labour.hoursPerDay",
    "labour.setupHours",
    "labour.minPerPiece",
    "labour.minPerJoint",
    "labour.minPerHardware",
    "labour.scaffoldHeightMm",
    "labour.scaffoldCents",
    "complications",
    "transport.zones",
    "transport.fallbackZone",
    "transport.perKmCents",
    "margins.materialsPct",
    "margins.labourPct",
    "discounts",
    "vatRates",
    "defaultVat",
    "minimumOrderCents",
    "roundingStepCents",
    "indicativityPct",
  ],
  regole: ["rules", "name"],
  tipologie: [""],
  preset: [""],
};

/** Campi facoltativi del listino: `null` dal form li rimuove. */
export const OPTIONAL_SECTION_PATHS: readonly string[] = ["timber.pricePerMl", "transport.perKmCents"];

export const isSectionPath =(dataset: Dataset, path: string): boolean => SECTION_PATHS[dataset].includes(path);

/** Segmenti del percorso (`timber.stockLengths` → `["timber", "stockLengths"]`; `""` → `[]`). */
const segments = (path: string): string[] => (path === "" ? [] : path.split("."));

/**
 * Copia del documento con `value` al percorso (gli oggetti intermedi esistono già nel
 * documento valido; mancanti ⇒ creati). Percorso `""` ⇒ `value`. `undefined` rimuove la
 * chiave (campi facoltativi come `timber.pricePerMl`).
 */
export function setAtPath(doc: unknown, path: string, value: unknown): unknown {
  const keys = segments(path);
  if (keys.some(isForbiddenKey)) throw new Error(`percorso non ammesso: ${path}`);
  if (!keys.length) return structuredClone(value);
  const root = structuredClone(doc) as Record<string, unknown>;
  let node = root;
  for (const k of keys.slice(0, -1)) {
    const next = node[k];
    if (typeof next !== "object" || next === null || Array.isArray(next)) node[k] = {};
    node = node[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1]!;
  if (value === undefined) delete node[last];
  else node[last] = structuredClone(value);
  return root;
}

/** Valore al percorso (`undefined` se assente). */
export function getAtPath(doc: unknown, path: string): unknown {
  let node: unknown = doc;
  for (const k of segments(path)) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[k];
  }
  return node;
}
