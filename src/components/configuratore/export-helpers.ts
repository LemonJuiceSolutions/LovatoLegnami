import { exportSat, validateSat, type SatExportResult } from "@/export/sat"
import { selectPieceResults, type ConfiguratoreState } from "@/stores/configuratore-store"

/**
 * Logica pura del pannello esportazioni: SAT dallo stato corrente,
 * problemi che richiedono "Esporta comunque", verifica strutturale dei file.
 */

/** Problemi bloccanti (violazioni `errore` e collisioni) da confermare prima dell'export CAD. */
export function exportProblems(state: Pick<ConfiguratoreState, "derived">): string[] {
  const { violations, collisions } = state.derived
  return [
    ...violations.filter((v) => v.severity === "errore").map((v) => v.message),
    ...collisions.map((c) => c.message),
  ]
}

/** SAT dell'assieme corrente con le opzioni della configurazione e i solidi del kernel. */
export function satFromState(state: ConfiguratoreState, date: Date = new Date()): SatExportResult {
  const assembly = state.derived.assembly
  if (!assembly) throw new Error("nessun assieme da esportare")
  return exportSat(assembly.pieces, selectPieceResults(state), { ...state.config.exportOptions.sat, date })
}

export interface SatVerification {
  readonly ok: boolean
  /** Riepilogo leggibile (file, body, entità). */
  readonly summary: string
  /** Errori e avvisi per file (`<file>: messaggio`). */
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
}

/** Verifica strutturale (`validateSat`) di tutti i file prodotti dall'export. */
export function verifySatExport(result: SatExportResult): SatVerification {
  const errors: string[] = []
  const warnings: string[] = []
  let bodies = 0
  let records = 0
  for (const file of result.files) {
    const v = validateSat(file.text)
    bodies += v.bodies.length
    records += v.records.length
    errors.push(...v.errors.map((e) => `${file.name}: ${e}`))
    warnings.push(...v.warnings.map((w) => `${file.name}: ${w}`))
  }
  errors.push(...result.errors.map((e) => `pezzo escluso: ${e.message}`))
  const files = result.files.length
  const summary = `${files} file SAT ${result.options.version}, ${bodies} body, ${records} entità`
  return { ok: errors.length === 0 && files > 0, summary, errors, warnings }
}
