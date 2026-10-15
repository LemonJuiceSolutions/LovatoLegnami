import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbOrTx } from "@/db/client";
import { emailOutbox, type EmailOutboxRow, type OutboxStatus } from "@/db/schema";
import { getEnv } from "@/server/env";
import { getEmailSender, type EmailMessage, type EmailSender } from "./sender";
import { CustomerConfirmationSchema, customerConfirmationEmail } from "./templates/conferma-cliente";
import { OfficeNotificationSchema, officeNotificationEmail } from "./templates/notifica-ufficio";
import { ContactMessageSchema, contactMessageEmail } from "./templates/messaggio-contatti";

/**
 * Outbox delle email (P7): la richiesta è salvata **prima**, poi le email sono accodate in
 * `email_outbox` e inviate nella stessa request; un errore del provider lascia la voce
 * `da-reinviare` con `attempts` e `lastError`, da cui l'admin ("Reinvia") o un `flush`
 * successivo riprovano. Nessuna coda esterna nell'MVP.
 *
 * Il payload salvato contiene i **dati** del template (validati con zod all'accodamento e
 * all'invio), non l'HTML: il messaggio è ricomposto a ogni tentativo. Il PDF allegato alla
 * conferma non è salvato nell'outbox: lo rigenera dall'istantanea `pdfForLead` (8.6).
 *
 * Presa in carico atomica: un tentativo incrementa `attempts` con `update … where attempts
 * = <letto>`; se un altro processo ha già preso la voce l'update non trova righe e la voce
 * è saltata (niente doppio invio da due `flush` concorrenti).
 */

export const OUTBOX_TEMPLATES = ["conferma-cliente", "notifica-ufficio", "messaggio-contatti"] as const;
export type OutboxTemplate = (typeof OUTBOX_TEMPLATES)[number];

const PAYLOAD_SCHEMAS = {
  "conferma-cliente": CustomerConfirmationSchema,
  "notifica-ufficio": OfficeNotificationSchema,
  "messaggio-contatti": ContactMessageSchema,
} as const satisfies Record<OutboxTemplate, z.ZodTypeAny>;

export type OutboxPayload<T extends OutboxTemplate> = z.input<(typeof PAYLOAD_SCHEMAS)[T]>;

/** Tentativi automatici massimi di `flush` (il reinvio manuale non ha limite). */
export const MAX_AUTOMATIC_ATTEMPTS = 5;

const MAX_ERROR_LENGTH = 500;

export interface OutboxDeps {
  readonly sender?: EmailSender;
  /** PDF del preventivo della richiesta (allegato della conferma); `null` = nessun allegato. */
  readonly pdfForLead?: (leadId: string) => Promise<Uint8Array | null>;
  readonly now?: () => Date;
}

let defaultPdfForLead: OutboxDeps["pdfForLead"];

/**
 * Fornitore di PDF di processo; senza, l'outbox usa `pdfForLead` di
 * `server/quotes/lead-pdf` (importato quando serve, per evitare un ciclo di moduli).
 */
export function setDefaultPdfProvider(provider: OutboxDeps["pdfForLead"]): void {
  defaultPdfForLead = provider;
}

export class OutboxPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboxPayloadError";
  }
}

/**
 * Destinatario: un solo indirizzo, senza spazi, a capo, virgole o punti e virgola (niente
 * destinatari aggiunti né intestazioni iniettate). Più largo di `z.email()` perché in
 * sviluppo l'ufficio è `ufficio@localhost`; gli indirizzi del cliente sono già validati
 * con `z.email()` all'invio della richiesta.
 */
const recipient = z
  .string()
  .max(254)
  .regex(/^[^\s<>@,;"']+@[^\s<>@,;"']+$/, "indirizzo non valido");

/** Accoda un'email (stato `in-coda`). Lancia `OutboxPayloadError` se destinatario o dati non sono validi. */
export async function enqueue<T extends OutboxTemplate>(
  entry: { readonly template: T; readonly to: string; readonly payload: OutboxPayload<T>; readonly leadId?: string | null },
  db?: DbOrTx,
): Promise<EmailOutboxRow> {
  const to = recipient.safeParse(entry.to);
  if (!to.success) throw new OutboxPayloadError(`destinatario non valido per ${entry.template}`);
  const payload = PAYLOAD_SCHEMAS[entry.template].safeParse(entry.payload);
  if (!payload.success) throw new OutboxPayloadError(`dati non validi per ${entry.template}: ${payload.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  const handle = db ?? (await getDb());
  const [row] = await handle
    .insert(emailOutbox)
    .values({ template: entry.template, to: to.data, payload: payload.data, leadId: entry.leadId ?? null, status: "in-coda" })
    .returning();
  return row!;
}

/** Messaggio dell'email della voce (dati rivalidati: una voce anonimizzata non è più inviabile). */
export async function renderEntry(row: Pick<EmailOutboxRow, "template" | "to" | "payload" | "leadId">, deps: OutboxDeps = {}): Promise<EmailMessage> {
  if (!recipient.safeParse(row.to).success) throw new OutboxPayloadError("destinatario non valido o rimosso");
  switch (row.template as OutboxTemplate) {
    case "conferma-cliente": {
      const data = CustomerConfirmationSchema.safeParse(row.payload);
      if (!data.success) throw new OutboxPayloadError("dati dell'email non validi o rimossi");
      const pdfForLead = deps.pdfForLead ?? defaultPdfForLead ?? (await import("@/server/quotes/lead-pdf")).pdfForLead;
      const pdf = await pdfForLead(data.data.leadId);
      return customerConfirmationEmail(row.to, data.data, pdf);
    }
    case "notifica-ufficio": {
      const data = OfficeNotificationSchema.safeParse(row.payload);
      if (!data.success) throw new OutboxPayloadError("dati dell'email non validi o rimossi");
      return officeNotificationEmail(row.to, data.data);
    }
    case "messaggio-contatti": {
      const data = ContactMessageSchema.safeParse(row.payload);
      if (!data.success) throw new OutboxPayloadError("dati dell'email non validi o rimossi");
      return contactMessageEmail(row.to, data.data);
    }
    default:
      throw new OutboxPayloadError(`template sconosciuto: ${row.template}`);
  }
}

export interface DeliveryResult {
  readonly id: string;
  readonly status: OutboxStatus | "saltata";
  readonly error?: string;
}

const errorText = (e: unknown): string => {
  const message = e instanceof Error ? e.message : String(e);
  // eslint-disable-next-line no-control-regex
  return message.replace(/[\u0000-\u001f]+/g, " ").slice(0, MAX_ERROR_LENGTH) || "errore sconosciuto";
};

/** Un tentativo su una voce già letta: presa in carico atomica, invio, esito. */
async function attempt(row: EmailOutboxRow, deps: OutboxDeps): Promise<DeliveryResult> {
  const db = await getDb();
  const [claimed] = await db
    .update(emailOutbox)
    .set({ attempts: row.attempts + 1 })
    .where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.attempts, row.attempts), eq(emailOutbox.status, row.status)))
    .returning({ id: emailOutbox.id });
  if (!claimed) return { id: row.id, status: "saltata" };
  const now = deps.now ?? (() => new Date());
  try {
    const message = await renderEntry(row, deps);
    const sender = deps.sender ?? getEmailSender();
    await sender.send({ ...message, from: message.from ?? getEnv().emailFrom });
    await db.update(emailOutbox).set({ status: "inviata", sentAt: now(), lastError: null }).where(eq(emailOutbox.id, row.id));
    return { id: row.id, status: "inviata" };
  } catch (e) {
    const error = errorText(e);
    await db.update(emailOutbox).set({ status: "da-reinviare", lastError: error }).where(eq(emailOutbox.id, row.id));
    return { id: row.id, status: "da-reinviare", error };
  }
}

export interface FlushOptions extends OutboxDeps {
  /** Solo queste voci (es. quelle appena accodate dalla richiesta). */
  readonly ids?: readonly string[];
  readonly limit?: number;
  readonly maxAttempts?: number;
}

/**
 * Invia le voci `in-coda` e `da-reinviare` con meno di `maxAttempts` tentativi (dalla più
 * vecchia). Non lancia: gli errori finiscono in `lastError` e nel risultato.
 */
export async function flush(options: FlushOptions = {}): Promise<{ sent: number; failed: number; results: DeliveryResult[] }> {
  const db = await getDb();
  const maxAttempts = options.maxAttempts ?? MAX_AUTOMATIC_ATTEMPTS;
  const filters = [inArray(emailOutbox.status, ["in-coda", "da-reinviare"] as OutboxStatus[]), lt(emailOutbox.attempts, maxAttempts)];
  if (options.ids) {
    if (options.ids.length === 0) return { sent: 0, failed: 0, results: [] };
    filters.push(inArray(emailOutbox.id, [...options.ids]));
  }
  const rows = await db
    .select()
    .from(emailOutbox)
    .where(and(...filters))
    .orderBy(asc(emailOutbox.createdAt), asc(emailOutbox.id))
    .limit(Math.min(Math.max(options.limit ?? 20, 1), 200));
  const results: DeliveryResult[] = [];
  for (const row of rows) results.push(await attempt(row, options));
  return {
    sent: results.filter((r) => r.status === "inviata").length,
    failed: results.filter((r) => r.status === "da-reinviare").length,
    results,
  };
}

/** Reinvio manuale ("Reinvia email" dall'admin): anche una voce già inviata o oltre il limite automatico. */
export async function resend(id: string, deps: OutboxDeps = {}): Promise<DeliveryResult> {
  const db = await getDb();
  const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id)).limit(1);
  if (!row) throw new OutboxPayloadError("email non trovata");
  return attempt(row, deps);
}

/** Reinvio manuale di tutte le email di una richiesta. */
export async function resendForLead(leadId: string, deps: OutboxDeps = {}): Promise<DeliveryResult[]> {
  const rows = await listForLead(leadId);
  const results: DeliveryResult[] = [];
  for (const row of rows) results.push(await attempt(row, deps));
  return results;
}

export async function listForLead(leadId: string): Promise<EmailOutboxRow[]> {
  const db = await getDb();
  return db.select().from(emailOutbox).where(eq(emailOutbox.leadId, leadId)).orderBy(asc(emailOutbox.createdAt), asc(emailOutbox.id));
}

/** `true` se almeno un'email della richiesta è da reinviare (badge "email da reinviare"). */
export async function hasPendingFailures(leadId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.leadId, leadId), eq(emailOutbox.status, "da-reinviare")))
    .limit(1);
  return rows.length > 0;
}
