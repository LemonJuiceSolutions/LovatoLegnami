/**
 * Tipi serializzabili passati dalle pagine server dell'area admin ai componenti client
 * (nessuna `Date`: date in ISO o già formattate).
 */

export type DatasetName = "listino" | "regole" | "tipologie" | "preset"

export interface VersionInfo {
  readonly id: string
  readonly version: number
  readonly effectiveFrom: string
  readonly notes: string | null
  /** `updatedAt` della versione in ISO: per la bozza è il lock ottimistico. */
  readonly updatedAt: string
  /** "Lucia Bianchi" o l'email, `null` se sconosciuto. */
  readonly by: string | null
  /** "15/10/2026, 10:32" (Europe/Rome). */
  readonly at: string
}

export interface DatasetStatusInfo {
  readonly dataset: DatasetName
  readonly active: VersionInfo | null
  readonly draft: VersionInfo | null
}

export const DATASET_LABELS: Readonly<Record<DatasetName, string>> = {
  listino: "Listino",
  regole: "Regole costruttive",
  tipologie: "Tipologie sul sito",
  preset: "Preset",
}

/** Differenza di un campo (come `diffDocuments`). */
export interface DiffItem {
  readonly path: string
  readonly before?: unknown
  readonly after?: unknown
}
