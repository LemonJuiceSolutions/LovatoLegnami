import { z } from "zod";
import type { EmailMessage } from "../sender";
import { escapeHtml, htmlDocument, htmlParagraph, oneLine, plainText } from "./shared";

/**
 * Messaggio dal form della pagina Contatti del sito (11.4) all'ufficio: dati del mittente
 * e testo libero, con `replyTo` al mittente. Tutto il contenuto è testo non fidato:
 * escape in HTML, una riga sola nell'oggetto.
 */

export const ContactMessageSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email().max(254),
    phone: z.string().max(40).default(""),
    message: z.string().min(1).max(4000),
    /** Versione dell'informativa accettata dal mittente. */
    privacyVersion: z.string().min(1).max(20),
  })
  .strict();
export type ContactMessageData = z.input<typeof ContactMessageSchema>;

export function contactMessageEmail(to: string, input: ContactMessageData): EmailMessage {
  const d = ContactMessageSchema.parse(input);
  const subject = oneLine(`Messaggio dal sito – ${d.name}`);
  const rows: [string, string][] = [
    ["Nome", oneLine(d.name)],
    ["Email", d.email],
    ["Telefono", oneLine(d.phone) || "non indicato"],
    ["Informativa privacy accettata", `versione ${oneLine(d.privacyVersion)}`],
  ];
  const text = ["Nuovo messaggio dalla pagina Contatti del sito.", "", ...rows.map(([k, v]) => `${k}: ${v}`), "", "Messaggio:", plainText(d.message)].join("\n");
  const html = htmlDocument(`<p>Nuovo messaggio dalla pagina Contatti del sito.</p>
<table style="border-collapse:collapse;font-size:14px">${rows
    .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b625c">${escapeHtml(k)}</td><td style="padding:2px 0">${escapeHtml(v)}</td></tr>`)
    .join("")}</table>
<p style="font-size:14px"><strong>Messaggio</strong><br>${htmlParagraph(d.message)}</p>`);
  return { to, subject, html, text, replyTo: d.email };
}
