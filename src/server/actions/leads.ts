"use server";

import { z } from "zod";
import { LEAD_STATUSES } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { resendForLead } from "@/server/email/outbox";
import { anonymize, assign, changeStatus, get } from "@/server/repositories/leads";
import { deleteUploads } from "@/server/storage/uploads";
import { runAction, type ActionResult } from "./result";

/**
 * Azioni sulle richieste dall'area admin (9.9). Prendere in carico, cambiare stato,
 * assegnare e reinviare le email richiedono `richieste:gestisci`; l'anonimizzazione
 * `dati:cancella` (solo admin) e cancella anche i file delle foto dallo storage.
 */

const Id = z.string().min(1).max(100);

export interface LeadActionOutcome {
  readonly status: string;
  readonly assigneeId: string | null;
}

/** Presa in carico: assegnata a chi la prende e, se `nuovo`, passa a `in-lavorazione`. */
export async function takeLead(leadId: string): Promise<ActionResult<LeadActionOutcome>> {
  return runAction(async () => {
    const user = await requireUser("richieste:gestisci");
    const id = Id.parse(leadId);
    let lead = (await get(id)).lead;
    if (lead.assigneeId !== user.id) lead = await assign(id, user.id, user.id);
    if (lead.status === "nuovo") lead = await changeStatus(id, "in-lavorazione", user.id, "presa in carico");
    return { status: lead.status, assigneeId: lead.assigneeId };
  });
}

const StatusSchema = z.object({ leadId: Id, to: z.enum(LEAD_STATUSES), note: z.string().trim().max(1000).optional() }).strict();

export async function changeLeadStatus(input: z.input<typeof StatusSchema>): Promise<ActionResult<LeadActionOutcome>> {
  return runAction(async () => {
    const user = await requireUser("richieste:gestisci");
    const v = StatusSchema.parse(input);
    const lead = await changeStatus(v.leadId, v.to, user.id, v.note || undefined);
    return { status: lead.status, assigneeId: lead.assigneeId };
  });
}

export async function assignLead(leadId: string, assigneeId: string | null): Promise<ActionResult<LeadActionOutcome>> {
  return runAction(async () => {
    const user = await requireUser("richieste:gestisci");
    const lead = await assign(Id.parse(leadId), Id.nullable().parse(assigneeId), user.id);
    return { status: lead.status, assigneeId: lead.assigneeId };
  });
}

/** "Reinvia email": nuovo tentativo di tutte le email della richiesta (conferma al cliente e notifica). */
export async function resendLeadEmails(leadId: string): Promise<ActionResult<{ sent: number; failed: number }>> {
  return runAction(async () => {
    await requireUser("richieste:gestisci");
    const id = Id.parse(leadId);
    await get(id); // 404 se la richiesta non esiste
    const results = await resendForLead(id);
    return { sent: results.filter((r) => r.status === "inviata").length, failed: results.filter((r) => r.status === "da-reinviare").length };
  });
}

/** Anonimizza (solo `dati:cancella`): dati personali tolti, file delle foto cancellati. */
export async function anonymizeLead(leadId: string): Promise<ActionResult<{ removedPhotos: number }>> {
  return runAction(async () => {
    const user = await requireUser("dati:cancella");
    const { removedPhotos } = await anonymize(Id.parse(leadId), user.id);
    await deleteUploads(removedPhotos);
    return { removedPhotos: removedPhotos.length };
  });
}
