import type { EmailMessage } from "../sender";
import { escapeHtml } from "./shared";

/** Email con il collegamento di accesso all'area interna (HTML + testo, italiano). */

export function accessEmail(params: { to: string; url: string; minutes: number; siteName?: string }): EmailMessage {
  const site = params.siteName ?? "Lovato Legnami";
  const subject = `Accesso a ${site}`;
  const text = [
    `Per accedere all'area interna di ${site} apri questo collegamento:`,
    "",
    params.url,
    "",
    `Il collegamento vale ${params.minutes} minuti e si può usare una sola volta.`,
    "Se non hai richiesto l'accesso ignora questa email: nessuno potrà entrare senza il collegamento.",
  ].join("\n");
  const url = escapeHtml(params.url);
  const html = `<!doctype html><html lang="it"><body style="font-family:system-ui,sans-serif;color:#1f1a17;line-height:1.5">
<p>Per accedere all'area interna di ${escapeHtml(site)} usa il pulsante qui sotto.</p>
<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#5a3a22;color:#fff;border-radius:6px;text-decoration:none">Accedi</a></p>
<p style="font-size:14px">Il collegamento vale ${params.minutes} minuti e si può usare una sola volta.<br>Se non hai richiesto l'accesso ignora questa email.</p>
<p style="font-size:12px;color:#6b625c">Se il pulsante non funziona copia questo indirizzo nel browser:<br>${url}</p>
</body></html>`;
  return { to: params.to, subject, html, text };
}
