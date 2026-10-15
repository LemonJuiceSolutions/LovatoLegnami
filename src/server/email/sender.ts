import { getEnv } from "@/server/env";

/**
 * Adattatore email (P7). Questo file nasce con l'accesso (7.2) e contiene solo
 * l'interfaccia e le tre implementazioni; template di richiesta, allegati PDF e outbox
 * arrivano con il task 8.1.
 *
 * - `resendSender`: produzione (`RESEND_API_KEY`);
 * - `consoleSender`: sviluppo, stampa l'email in console (in produzione stampa solo
 *   destinatario e oggetto: un collegamento di accesso nei log sarebbe una credenziale);
 * - `createMemorySender()`: test, conserva i messaggi in `sent`.
 */

export interface EmailAttachment {
  readonly filename: string;
  readonly content: Uint8Array;
  readonly contentType?: string;
}

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly from?: string;
  readonly replyTo?: string;
  readonly attachments?: readonly EmailAttachment[];
}

export interface EmailSender {
  readonly kind: "resend" | "console" | "memory";
  send(message: EmailMessage): Promise<{ id?: string }>;
}

export function createConsoleSender(options: { production?: boolean; log?: (line: string) => void } = {}): EmailSender {
  const log = options.log ?? ((line: string) => console.info(line));
  return {
    kind: "console",
    async send(m) {
      if (options.production) {
        log(`[email] (non inviata: RESEND_API_KEY assente) a ${m.to}: ${m.subject}`);
      } else {
        log(`\n[email] a: ${m.to}\n[email] oggetto: ${m.subject}\n${m.text}\n`);
      }
      return {};
    },
  };
}

export interface MemorySender extends EmailSender {
  readonly sent: EmailMessage[];
  clear(): void;
}

export function createMemorySender(): MemorySender {
  const sent: EmailMessage[] = [];
  return {
    kind: "memory",
    sent,
    clear: () => void sent.splice(0, sent.length),
    async send(m) {
      sent.push(m);
      return { id: `mem-${sent.length}` };
    },
  };
}

export function createResendSender(apiKey: string, defaultFrom: string): EmailSender {
  return {
    kind: "resend",
    async send(m) {
      const { Resend } = await import("resend");
      const client = new Resend(apiKey);
      const { data, error } = await client.emails.send({
        from: m.from ?? defaultFrom,
        to: m.to,
        subject: m.subject,
        html: m.html,
        text: m.text,
        ...(m.replyTo ? { replyTo: m.replyTo } : {}),
        ...(m.attachments?.length
          ? { attachments: m.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content), ...(a.contentType ? { contentType: a.contentType } : {}) })) }
          : {}),
      });
      if (error) throw new Error(`invio email non riuscito: ${error.message}`);
      return { id: data?.id };
    },
  };
}

let override: EmailSender | undefined;
let cached: EmailSender | undefined;

/** Adattatore del processo, scelto da `getEnv().services.email`. */
export function getEmailSender(): EmailSender {
  if (override) return override;
  if (!cached) {
    const env = getEnv();
    cached = env.services.email === "resend" && env.resendApiKey ? createResendSender(env.resendApiKey, env.emailFrom) : createConsoleSender({ production: env.production });
  }
  return cached;
}

/** Solo test: sostituisce l'adattatore (`undefined` ripristina la scelta da env). */
export function setEmailSender(sender: EmailSender | undefined): void {
  override = sender;
  cached = undefined;
}
