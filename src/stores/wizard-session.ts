import type { SubmittedSummary } from "./wizard-store"

/**
 * Accesso leggero alla sessione del wizard (`sessionStorage`, chiave `lovato-wizard-v1`)
 * per la pagina di conferma: legge l'ultimo invio e azzera le risposte **senza** caricare
 * lo store, il dominio e zod (la conferma resta una pagina leggera).
 */

export const WIZARD_STORAGE_KEY = "lovato-wizard-v1"

interface Saved {
  state?: { step?: string; answers?: unknown; submitted?: SubmittedSummary | null }
  version?: number
}

function read(storage: Storage): Saved | null {
  try {
    const raw = storage.getItem(WIZARD_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}

/** Ultimo invio salvato nella sessione (o `null`). */
export function readSubmitted(storage: Storage = sessionStorage): SubmittedSummary | null {
  const s = read(storage)?.state?.submitted
  return s && typeof s.code === "string" && typeof s.token === "string" ? s : null
}

/** Azzera risposte e passo (il prossimo preventivo riparte da zero), tiene l'ultimo invio. */
export function clearAnswers(storage: Storage = sessionStorage): void {
  const s = read(storage)
  if (!s?.state) return
  try {
    storage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ ...s, state: { submitted: s.state.submitted ?? null, step: "tipologia" } }))
  } catch {
    // storage pieno o non disponibile: nessun problema, al massimo il wizard riparte dalle risposte vecchie
  }
}
