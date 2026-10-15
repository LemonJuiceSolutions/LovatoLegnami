import { TYPOLOGY_CATEGORIES, type TypologyCategory, type TypologyInfo } from "@/domain"

/**
 * Funzioni pure del selettore delle tipologie (filtro per categoria e ricerca).
 */

export const CATEGORY_LABELS: Readonly<Record<TypologyCategory, string>> = {
  addossata: "Addossata",
  autoportante: "Autoportante",
  carport: "Carport",
  gazebo: "Gazebo",
  pensilina: "Pensilina",
}

/** Filtro di categoria: una categoria o tutte. */
export type CategoryFilter = TypologyCategory | "tutte"

/** Testo normalizzato per la ricerca: minuscole, senza accenti, spazi compattati. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Categorie presenti nell'elenco, nell'ordine canonico. */
export function presentCategories(list: readonly Pick<TypologyInfo, "category">[]): TypologyCategory[] {
  const present = new Set(list.map((t) => t.category))
  return TYPOLOGY_CATEGORIES.filter((c) => present.has(c))
}

/**
 * Tipologie della categoria scelta il cui nome, slug, descrizione, categoria o
 * tag contengono tutte le parole cercate (senza distinzione di maiuscole e accenti).
 */
export function filterTypologies<T extends Pick<TypologyInfo, "slug" | "name" | "description" | "category" | "tags">>(
  list: readonly T[],
  category: CategoryFilter,
  query: string,
): T[] {
  const words = normalizeSearch(query).split(" ").filter(Boolean)
  return list.filter((t) => {
    if (category !== "tutte" && t.category !== category) return false
    if (words.length === 0) return true
    const haystack = normalizeSearch([t.name, t.slug, t.description, CATEGORY_LABELS[t.category], ...t.tags].join(" "))
    return words.every((w) => haystack.includes(w))
  })
}
