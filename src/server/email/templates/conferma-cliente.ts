import { z } from "zod";
import type { EmailAttachment, EmailMessage } from "../sender";
import { button, escapeHtml, formatDateIt, htmlDocument, oneLine } from "./shared";

/**
 * Conferma al cliente (spec `richieste-preventivo`, "Notifiche email"): codice, riepilogo
 * del prezzo indicativo, collegamento personale (token, 90 giorni) e PDF allegato.
 * Il payload è quello salvato nell'outbox: solo dati già destinati al cliente (vista
 * cliente), mai importi o voci interne.
 */

const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//.test(u), "deve essere un URL http(s)");

export const CustomerConfirmationSchema = z
  .object({
    leadId: z.string().min(1),
    code: z.string().regex(/^PRV-\d{4}-\d{5}$/),
    name: z.string().min(1).max(120),
    typology: z.string().min(1).max(120),
    /** Totale indicativo IVA inclusa già formattato (`4.700,00 €`); assente = prezzo su richiesta. */
    total: z.string().max(40).nullable(),
    /** Fascia indicativa formattata (`4.230,00 € – 5.170,00 €`). */
    range: z.string().max(80).nullable(),
    /** Note per il cliente (vista cliente). */
    notes: z.array(z.string().max(300)).max(20).default([]),
    link: httpUrl,
    /** Scadenza del collegamento, `AAAA-MM-GG`. */
    expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type CustomerConfirmationData = z.input<typeof CustomerConfirmationSchema>;

export const customerPdfFilename = (code: string): string => `preventivo-${code}.pdf`;

export function customerConfirmationEmail(to: string, input: CustomerConfirmationData, pdf?: Uint8Array | null, siteName = "Lovato Legnami"): EmailMessage {
  const d = CustomerConfirmationSchema.parse(input);
  const subject = oneLine(`${siteName}: richiesta di preventivo ${d.code} ricevuta`);
  const price = d.total ? `Prezzo indicativo: ${d.total} IVA inclusa${d.range ? ` (fascia ${d.range})` : ""}` : "Prezzo: su richiesta (lo calcola l'ufficio dopo aver visto i dettagli)";
  const text = [
    `Gentile ${oneLine(d.name)},`,
    "",
    `abbiamo ricevuto la tua richiesta di preventivo ${d.code} per: ${oneLine(d.typology)}.`,
    price,
    ...(d.notes.length ? ["", ...d.notes.map((n) => `- ${oneLine(n, 300)}`)] : []),
    "",
    "Il prezzo è indicativo e soggetto a sopralluogo: ti contatteremo a breve per i dettagli.",
    "",
    `Puoi rivedere il riepilogo e scaricare il PDF da qui (valido fino al ${formatDateIt(d.expiresOn)}):`,
    d.link,
    "",
    pdf ? "In allegato trovi il riepilogo in PDF." : "",
    `${siteName}`,
  ]
    .filter((l, i, all) => !(l === "" && all[i - 1] === ""))
    .join("\n");
  const html = htmlDocument(`<p>Gentile ${escapeHtml(oneLine(d.name))},</p>
<p>abbiamo ricevuto la tua richiesta di preventivo <strong>${escapeHtml(d.code)}</strong> per: ${escapeHtml(oneLine(d.typology))}.</p>
<p><strong>${escapeHtml(price)}</strong></p>
${d.notes.length ? `<ul>${d.notes.map((n) => `<li>${escapeHtml(oneLine(n, 300))}</li>`).join("")}</ul>` : ""}
<p>Il prezzo è indicativo e soggetto a sopralluogo: ti contatteremo a breve per i dettagli.</p>
${button(d.link, "Rivedi il riepilogo")}
<p style="font-size:14px">Il collegamento è personale e vale fino al ${escapeHtml(formatDateIt(d.expiresOn))}.${pdf ? " In allegato trovi il riepilogo in PDF." : ""}</p>
<p style="font-size:12px;color:#6b625c">Se il pulsante non funziona copia questo indirizzo nel browser:<br>${escapeHtml(d.link)}</p>
<p>${escapeHtml(siteName)}</p>`);
  const attachments: EmailAttachment[] = pdf ? [{ filename: customerPdfFilename(d.code), content: pdf, contentType: "application/pdf" }] : [];
  return { to, subject, html, text, ...(attachments.length ? { attachments } : {}) };
}
