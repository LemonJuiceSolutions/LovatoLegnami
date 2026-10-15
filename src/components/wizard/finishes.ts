import type { WizardOptions } from "@/server/site/wizard-data"
import type { FinishAnswers } from "./answers"

/**
 * Testi e campioni delle finiture (passo 4). Le voci disponibili vengono **solo** dal
 * listino attivo (id + etichetta passati dal server); qui ci sono descrizioni semplici e
 * colori dei campioni per gli id noti, con un ripiego generico per le voci nuove.
 * DA VALIDARE con l'ufficio commerciale.
 */

export const SPECIES_COPY: Readonly<Record<string, { text: string; swatch: string }>> = {
  abete: { text: "Chiaro e leggero, il più scelto per le pergole. Va protetto con un trattamento.", swatch: "#E2C799" },
  larice: { text: "Più resinoso e resistente all'esterno, con venature calde.", swatch: "#C88D5B" },
  castagno: { text: "Scuro e robusto, naturalmente durevole.", swatch: "#8B5B37" },
}

export const QUALITY_COPY: Readonly<Record<string, string>> = {
  lamellare: "Travi incollate a strati: dritte, stabili, senza crepe.",
  massello: "Legno massiccio: aspetto più rustico, con qualche fessura naturale.",
}

export const TREATMENT_COPY: Readonly<Record<string, string>> = {
  "impregnante-incolore": "Protegge il legno lasciandone il colore naturale.",
  "impregnante-tinta": "Protegge e colora: scegli la tinta che preferisci.",
  "vernice-coprente": "Colore pieno e uniforme, copre la venatura.",
}

export const COVERING_COPY: Readonly<Record<string, string>> = {
  "policarbonato-alveolare": "Lastre leggere e luminose: riparano dalla pioggia e lasciano passare la luce.",
  "policarbonato-compatto": "Trasparente come il vetro, più robusto dell'alveolare.",
  "pannello-sandwich": "Pannello isolato: ripara da pioggia, sole e caldo, sotto resta il legno a vista.",
  "tegola-canadese": "Perline di legno, guaina impermeabile e tegola canadese: l'aspetto di un vero tetto.",
  "telo-pvc": "Telo impermeabile teso: economico e facile da sostituire.",
  lamiera: "Lamiera grecata: resistente e veloce da montare.",
}

/** Descrizione di una copertura anche per id nuovi (parole chiave dell'etichetta). */
export function coveringText(id: string, label: string): string {
  if (COVERING_COPY[id]) return COVERING_COPY[id]
  const l = label.toLowerCase()
  if (l.includes("lamiera")) return COVERING_COPY.lamiera!
  if (l.includes("policarbonato")) return COVERING_COPY["policarbonato-alveolare"]!
  if (l.includes("telo")) return COVERING_COPY["telo-pvc"]!
  if (l.includes("perlin") || l.includes("tegol")) return COVERING_COPY["tegola-canadese"]!
  return "Copertura per riparare dalla pioggia."
}

/** Il trattamento permette di scegliere la tinta. */
export const hasTint = (id: string | null, label = ""): boolean => !!id && (id.includes("tinta") || /tinta|colorat/i.test(label))

export const TINTS: readonly { id: string; label: string; color: string }[] = [
  { id: "noce", label: "Noce", color: "#6B4428" },
  { id: "castagno", label: "Castagno", color: "#8A5530" },
  { id: "teak", label: "Teak", color: "#A86A36" },
  { id: "douglas", label: "Douglas", color: "#C27C4E" },
  { id: "grigio", label: "Grigio antico", color: "#8D8A82" },
  { id: "bianco", label: "Bianco", color: "#ECE8DF" },
]

/**
 * Finiture coerenti con il listino attivo: una voce che non c'è più (listino cambiato
 * dopo il salvataggio della sessione) torna alla prima disponibile o a "nessuna".
 */
export function normalizeFinishes(f: FinishAnswers, o: WizardOptions): FinishAnswers {
  const has = (list: readonly { id: string }[], id: string | null) => id !== null && list.some((x) => x.id === id)
  const species = has(o.species, f.species) ? f.species : (o.species[0]?.id ?? f.species)
  const quality = has(o.qualities, f.quality) ? f.quality : (o.qualities.find((q) => q.id === "lamellare")?.id ?? o.qualities[0]?.id ?? f.quality)
  const treatment = f.treatment === null || has(o.treatments, f.treatment) ? f.treatment : (o.treatments[0]?.id ?? null)
  const covering = f.covering === null || has(o.coverings, f.covering) ? f.covering : null
  const tint = hasTint(treatment) ? f.tint : null
  return { species, quality, treatment, covering, tint }
}
