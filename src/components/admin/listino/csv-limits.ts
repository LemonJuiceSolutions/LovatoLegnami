/** Limiti dell'import CSV del listino (9.5), condivisi da anteprima nel browser e action. */

/** 256 KB e 5 000 righe bastano per ogni tabella del listino (la ferramenta ha ~150 codici). */
export const MAX_CSV_BYTES = 256 * 1024
export const MAX_CSV_ROWS = 5_000

/** Messaggio se il testo supera i limiti, altrimenti `null`. */
export function csvLimitError(text: string): string | null {
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) return "file troppo grande (massimo 256 KB)"
  if (text.split("\n").length > MAX_CSV_ROWS + 1) return `troppe righe (massimo ${MAX_CSV_ROWS})`
  return null
}
