/**
 * Mattoni comuni dei template email: escape HTML di **ogni** valore interpolato (i dati
 * del cliente arrivano dal sito pubblico), righe di intestazione senza a capo, impaginazione
 * minima compatibile con i client di posta (stili in linea, nessuna risorsa esterna).
 */

const HTML_ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

/** Testo su una riga: niente caratteri di controllo né a capo (oggetto, intestazioni). */
export const oneLine = (value: string, max = 200): string =>
  value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Testo semplice: normalizza gli a capo e toglie gli altri caratteri di controllo. */
export const plainText = (value: string): string =>
  value
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");

/** Paragrafo HTML da testo libero: escape e `<br>` per gli a capo. */
export const htmlParagraph = (value: string): string => escapeHtml(plainText(value)).replace(/\n/g, "<br>");

/** Data italiana `GG/MM/AAAA` da `AAAA-MM-GG` o da un istante. */
export function formatDateIt(value: string | Date): string {
  const iso = typeof value === "string" ? value.slice(0, 10) : new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(value);
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function htmlDocument(body: string): string {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1f1a17;line-height:1.5;max-width:640px">
${body}
</body></html>`;
}

export const button = (href: string, label: string): string =>
  `<p><a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 18px;background:#5a3a22;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(label)}</a></p>`;
