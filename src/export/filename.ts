/**
 * Nomi dei file scaricati (spec `export-cnc`):
 * `pergola-<tipologia>-<AAAAMMGG-HHMM>.<ext>`, data e ora locali.
 */

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** `AAAAMMGG-HHMM` nell'ora locale. */
export function fileTimestamp(date: Date): string {
  return `${pad(date.getFullYear(), 4)}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** Slug sicuro per un nome file: minuscole, `[a-z0-9-]`, trattini singoli. */
export function fileSlug(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "senza-nome";
}

/** Nome del file esportato, es. `pergola-addossata-monofalda-20261014-0930.sat`. */
export function exportFileName(typologySlug: string, extension: string, date: Date = new Date()): string {
  const ext = extension.replace(/^\.+/, "");
  return `pergola-${fileSlug(typologySlug)}-${fileTimestamp(date)}.${ext}`;
}
