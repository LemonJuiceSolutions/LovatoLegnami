import { exportSTEP, type Shape3D } from "replicad";

/**
 * Export STEP (D8) tramite replicad/OCCT: un solido per pezzo, nominato con
 * l'id del pezzo (`TDataStd_Name` → `PRODUCT('<id>', …)` nel file), unità mm.
 *
 * Richiede OCCT inizializzato: va eseguito **solo nel worker del kernel**
 * (messaggio `export-step`, vedi `src/geometry/kernel-core.ts`) o nei test
 * geometry. Il thread UI usa `KernelClient.exportStep(...)`.
 */

export const STEP_EXTENSION = "step";
export const STEP_MIME_TYPE = "application/step";

/** Nomi non validi o non accoppiati ai solidi. */
export class StepExportError extends Error {
  constructor(message: string) {
    super(`Export STEP: ${message}`);
    this.name = "StepExportError";
  }
}

/**
 * Scrive un file STEP con i solidi dati (già posizionati nel sistema
 * assieme) e i nomi corrispondenti. Le unità del file sono millimetri.
 */
export async function exportStep(shapes: readonly Shape3D[], names: readonly string[]): Promise<Uint8Array> {
  if (shapes.length !== names.length)
    throw new StepExportError(`${shapes.length} solidi ma ${names.length} nomi`);
  if (shapes.length === 0) throw new StepExportError("nessun solido da esportare");
  const seen = new Set<string>();
  for (const name of names) {
    if (!name.trim()) throw new StepExportError("nome vuoto");
    if (seen.has(name)) throw new StepExportError(`nome duplicato "${name}"`);
    seen.add(name);
  }
  const blob = exportSTEP(
    shapes.map((shape, i) => ({ shape, name: names[i] })),
    { unit: "MM", modelUnit: "MM" },
  );
  return new Uint8Array(await blob.arrayBuffer());
}
