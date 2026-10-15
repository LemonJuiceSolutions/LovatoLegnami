import { z } from "zod";
import type { EmailAttachment, EmailMessage } from "../sender";
import { button, escapeHtml, formatDateIt, htmlDocument, oneLine } from "./shared";
import { customerPdfFilename } from "./conferma-cliente";

/**
 * Preventivo definitivo al cliente (10.4, "Salva preventivo definitivo" con invio): codice,
 * totale del definitivo IVA inclusa, collegamento personale e PDF allegato (rigenerato
 * dall'istantanea del definitivo a ogni tentativo, come la conferma). Solo dati della
 * vista cliente.
 */

const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//.test(u), "deve essere un URL http(s)");

export const FinalQuoteEmailSchema = z
  .object({
    leadId: z.string().min(1),
    code: z.string().regex(/^PRV-\d{4}-\d{5}$/),
    name: z.string().min(1).max(120),
    typology: z.string().min(1).max(120),
    /** Totale IVA inclusa già formattato (`4.700,00 €`). */
    total: z.string().max(40),
    link: httpUrl,
    /** Scadenza del collegamento, `AAAA-MM-GG`. */
    expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type FinalQuoteEmailData = z.input<typeof FinalQuoteEmailSchema>;

export function finalQuoteEmail(to: string, input: FinalQuoteEmailData, pdf?: Uint8Array | null, siteName = "Lovato Legnami"): EmailMessage {
  const d = FinalQuoteEmailSchema.parse(input);
  const subject = oneLine(`${siteName}: preventivo ${d.code}`);
  const text = [
    `Gentile ${oneLine(d.name)},`,
    "",
    `ti inviamo il preventivo ${d.code} per: ${oneLine(d.typology)}.`,
    `Totale: ${d.total} IVA inclusa.`,
    "",
    `Puoi rivederlo e scaricare il PDF da qui (valido fino al ${formatDateIt(d.expiresOn)}):`,
    d.link,
    "",
    pdf ? "In allegato trovi il preventivo in PDF." : "",
    "Per qualsiasi domanda rispondi pure a questa email.",
    `${siteName}`,
  ]
    .filter((l, i, all) => !(l === "" && all[i - 1] === ""))
    .join("\n");
  const html = htmlDocument(`<p>Gentile ${escapeHtml(oneLine(d.name))},</p>
<p>ti inviamo il preventivo <strong>${escapeHtml(d.code)}</strong> per: ${escapeHtml(oneLine(d.typology))}.</p>
<p><strong>Totale: ${escapeHtml(d.total)} IVA inclusa</strong></p>
${button(d.link, "Rivedi il preventivo")}
<p style="font-size:14px">Il collegamento è personale e vale fino al ${escapeHtml(formatDateIt(d.expiresOn))}.${pdf ? " In allegato trovi il preventivo in PDF." : ""}</p>
<p style="font-size:12px;color:#6b625c">Se il pulsante non funziona copia questo indirizzo nel browser:<br>${escapeHtml(d.link)}</p>
<p>Per qualsiasi domanda rispondi pure a questa email.</p>
<p>${escapeHtml(siteName)}</p>`);
  const attachments: EmailAttachment[] = pdf ? [{ filename: customerPdfFilename(d.code), content: pdf, contentType: "application/pdf" }] : [];
  return { to, subject, html, text, ...(attachments.length ? { attachments } : {}) };
}
