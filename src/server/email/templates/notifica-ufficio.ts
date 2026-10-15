import { z } from "zod";
import type { EmailMessage } from "../sender";
import { button, escapeHtml, htmlDocument, htmlParagraph, oneLine, plainText } from "./shared";

/**
 * Notifica all'ufficio (spec `richieste-preventivo`): dati essenziali della richiesta e
 * collegamento alla scheda nell'area admin. Tutti i campi del cliente sono testo non
 * fidato: escape in HTML, una riga sola nelle intestazioni, `replyTo` solo se l'email è
 * valida (lo è sempre: validata all'invio e qui).
 */

export const OfficeNotificationSchema = z
  .object({
    leadId: z.string().min(1),
    code: z.string().regex(/^PRV-\d{4}-\d{5}$/),
    customer: z
      .object({
        name: z.string().min(1).max(120),
        email: z.string().email().max(254),
        phone: z.string().max(40),
        cap: z.string().max(10),
        comune: z.string().max(120),
      })
      .strict(),
    typology: z.string().min(1).max(120),
    total: z.string().max(40).nullable(),
    notes: z.string().max(2000).nullable().default(null),
    photos: z.number().int().min(0).max(5).default(0),
    adminUrl: z
      .string()
      .url()
      .refine((u) => /^https?:\/\//.test(u)),
  })
  .strict();
export type OfficeNotificationData = z.input<typeof OfficeNotificationSchema>;

export function officeNotificationEmail(to: string, input: OfficeNotificationData): EmailMessage {
  const d = OfficeNotificationSchema.parse(input);
  const c = d.customer;
  const subject = oneLine(`Nuova richiesta ${d.code} – ${c.name} (${c.comune || c.cap})`);
  const rows: [string, string][] = [
    ["Codice", d.code],
    ["Cliente", oneLine(c.name)],
    ["Email", c.email],
    ["Telefono", oneLine(c.phone)],
    ["Cantiere", oneLine(`${c.cap} ${c.comune}`)],
    ["Tipologia", oneLine(d.typology)],
    ["Prezzo indicativo", d.total ?? "su richiesta"],
    ["Foto allegate", String(d.photos)],
  ];
  const text = [
    `Nuova richiesta di preventivo dal sito: ${d.code}`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(d.notes ? ["", "Note del cliente:", plainText(d.notes)] : []),
    "",
    `Apri la richiesta: ${d.adminUrl}`,
  ].join("\n");
  const html = htmlDocument(`<p>Nuova richiesta di preventivo dal sito: <strong>${escapeHtml(d.code)}</strong></p>
<table style="border-collapse:collapse;font-size:14px">${rows
    .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b625c">${escapeHtml(k)}</td><td style="padding:2px 0">${escapeHtml(v)}</td></tr>`)
    .join("")}</table>
${d.notes ? `<p style="font-size:14px"><strong>Note del cliente</strong><br>${htmlParagraph(d.notes)}</p>` : ""}
${button(d.adminUrl, "Apri la richiesta")}`);
  return { to, subject, html, text, replyTo: c.email };
}
