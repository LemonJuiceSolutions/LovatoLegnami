import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import {
  customerTokens,
  emailOutbox,
  leadCounters,
  leadEvents,
  leads,
  quotes,
  users,
  LEAD_STATUSES,
  type LeadEventRow,
  type LeadRow,
  type LeadStatus,
  type QuoteRow,
} from "@/db/schema";
import { record } from "./audit";
import { ConflictError, NotFoundError } from "./errors";

/**
 * Richieste di preventivo (spec `richieste-preventivo`, `persistenza-dati`).
 *
 * La forma di `customer`, `consent` e `photos` è validata dall'API pubblica (8.6): qui
 * sono documenti `jsonb`; il repository conosce solo i campi che usa (nome ed email per
 * la ricerca, `ip`/`userAgent` del consenso da togliere all'anonimizzazione).
 */

export interface LeadCustomer {
  readonly name: string;
  readonly email: string;
  readonly phone?: string;
  readonly [key: string]: unknown;
}

export interface LeadConsent {
  /** Testo dell'informativa accettata, versione, data e ora. */
  readonly text: string;
  readonly version: string;
  readonly acceptedAt: string;
  readonly [key: string]: unknown;
}

export interface QuoteSnapshotInput {
  readonly config: unknown;
  readonly quote: unknown;
  readonly totalCents: number;
  readonly priceListVersionId?: string | null;
  readonly ruleSetVersionId?: string | null;
  readonly siteFactors?: unknown;
}

export interface CreateLeadInput {
  readonly customer: LeadCustomer;
  readonly consent: LeadConsent;
  readonly photos?: readonly unknown[];
  readonly notes?: string | null;
  readonly quote: QuoteSnapshotInput;
  /** Istante della richiesta (test); default adesso. */
  readonly now?: Date;
}

export type Lead = LeadRow;
export type LeadQuote = QuoteRow;
export type LeadEvent = LeadEventRow;

/** Anno del codice: calendario italiano (una richiesta del 31/12 alle 23:30 è dell'anno che finisce). */
const codeYear = (at: Date): number => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric" }).format(at));

export const formatLeadCode = (year: number, n: number): string => `PRV-${year}-${String(n).padStart(5, "0")}`;

async function nextCode(tx: DbOrTx, at: Date): Promise<string> {
  const year = codeYear(at);
  const [row] = await tx
    .insert(leadCounters)
    .values({ year, last: 1 })
    .onConflictDoUpdate({ target: leadCounters.year, set: { last: sql`${leadCounters.last} + 1` } })
    .returning({ last: leadCounters.last });
  return formatLeadCode(year, row!.last);
}

const quoteValues = (leadId: string, kind: "indicativo" | "definitivo", q: QuoteSnapshotInput, at: Date, userId: string | null, manualLines: readonly unknown[] = []) => {
  if (!Number.isInteger(q.totalCents)) throw new ConflictError("totale del preventivo non intero (centesimi)");
  return {
    leadId,
    kind,
    config: q.config,
    quote: q.quote,
    totalCents: q.totalCents,
    priceListVersionId: q.priceListVersionId ?? null,
    ruleSetVersionId: q.ruleSetVersionId ?? null,
    siteFactors: q.siteFactors ?? null,
    manualLines: [...manualLines],
    createdBy: userId,
    createdAt: at,
  };
};

/** Salva richiesta e preventivo indicativo in una transazione, con codice `PRV-AAAA-NNNNN` progressivo per anno. */
export async function createLeadWithQuote(input: CreateLeadInput): Promise<{ lead: Lead; quote: LeadQuote }> {
  const db = await getDb();
  const at = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const code = await nextCode(tx, at);
    const [lead] = await tx
      .insert(leads)
      .values({
        code,
        status: "nuovo",
        customer: input.customer,
        consent: input.consent,
        photos: [...(input.photos ?? [])],
        notes: input.notes ?? null,
        createdAt: at,
        updatedAt: at,
      })
      .returning();
    const [quote] = await tx.insert(quotes).values(quoteValues(lead!.id, "indicativo", input.quote, at, null)).returning();
    await tx.insert(leadEvents).values({ leadId: lead!.id, at, userId: null, from: null, to: "nuovo", note: "richiesta dal sito" });
    return { lead: lead!, quote: quote! };
  });
}

export interface LeadListFilter {
  readonly status?: LeadStatus;
  /** Ricerca nel codice, nel nome e nell'email del cliente (senza distinzione di maiuscole). */
  readonly q?: string;
  /** Da 1. */
  readonly page?: number;
  readonly pageSize?: number;
}

export interface LeadListItem {
  readonly id: string;
  readonly code: string;
  readonly status: LeadStatus;
  readonly createdAt: Date;
  readonly customerName: string | null;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly anonymized: boolean;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Elenco paginato delle richieste, dalla più recente. */
export async function list(filter: LeadListFilter = {}): Promise<{ items: LeadListItem[]; total: number; page: number; pageSize: number }> {
  const db = await getDb();
  const pageSize = Math.min(Math.max(1, Math.trunc(filter.pageSize ?? 25)), 100);
  const page = Math.max(1, Math.trunc(filter.page ?? 1));
  const where: SQL[] = [];
  if (filter.status) where.push(eq(leads.status, filter.status));
  const q = filter.q?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    where.push(or(ilike(leads.code, pattern), ilike(sql`${leads.customer}->>'name'`, pattern), ilike(sql`${leads.customer}->>'email'`, pattern))!);
  }
  const cond = where.length ? and(...where) : undefined;
  const [{ n }] = (await db.select({ n: count() }).from(leads).where(cond)) as [{ n: number }];
  const rows = await db
    .select({
      id: leads.id,
      code: leads.code,
      status: leads.status,
      createdAt: leads.createdAt,
      customerName: sql<string | null>`${leads.customer}->>'name'`,
      assigneeId: leads.assigneeId,
      assigneeName: sql<string | null>`coalesce(${users.name}, ${users.email})`,
      anonymizedAt: leads.anonymizedAt,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assigneeId))
    .where(cond)
    .orderBy(desc(leads.createdAt), desc(leads.code))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    items: rows.map(({ anonymizedAt, ...r }) => ({ ...r, anonymized: anonymizedAt !== null })),
    total: n,
    page,
    pageSize,
  };
}

export interface LeadDetail {
  readonly lead: Lead;
  /** Dal più recente. */
  readonly quotes: LeadQuote[];
  /** In ordine cronologico. */
  readonly events: LeadEvent[];
}

async function getLeadRow(id: string, db: DbOrTx, lock = false): Promise<Lead> {
  const base = db.select().from(leads).where(eq(leads.id, id)).limit(1);
  const [row] = lock ? await base.for("update") : await base;
  if (!row) throw new NotFoundError(`richiesta ${id} non trovata`);
  return row;
}

export async function get(id: string): Promise<LeadDetail> {
  const db = await getDb();
  const lead = await getLeadRow(id, db);
  const [qs, events] = await Promise.all([
    db.select().from(quotes).where(eq(quotes.leadId, id)).orderBy(desc(quotes.createdAt), desc(quotes.id)),
    db.select().from(leadEvents).where(eq(leadEvents.leadId, id)).orderBy(leadEvents.at, leadEvents.id),
  ]);
  return { lead, quotes: qs, events };
}

export async function getByCode(code: string): Promise<LeadDetail> {
  const db = await getDb();
  const [row] = await db.select({ id: leads.id }).from(leads).where(eq(leads.code, code)).limit(1);
  if (!row) throw new NotFoundError(`richiesta ${code} non trovata`);
  return get(row.id);
}

/**
 * Cambia lo stato e registra l'evento (autore, da → a, nota). `preventivo-inviato`
 * richiede un preventivo definitivo salvato.
 */
export async function changeStatus(leadId: string, to: LeadStatus, userId: string | null, note?: string): Promise<Lead> {
  if (!(LEAD_STATUSES as readonly string[]).includes(to)) throw new ConflictError(`stato sconosciuto: ${to}`);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const lead = await getLeadRow(leadId, tx, true);
    if (lead.status === to) throw new ConflictError(`la richiesta ${lead.code} è già nello stato ${to}`);
    if (to === "preventivo-inviato") {
      const [def] = await tx
        .select({ id: quotes.id })
        .from(quotes)
        .where(and(eq(quotes.leadId, leadId), eq(quotes.kind, "definitivo")))
        .limit(1);
      if (!def) throw new ConflictError(`la richiesta ${lead.code} non ha un preventivo definitivo: salvalo prima di segnarla come inviata`);
    }
    const at = new Date();
    const [row] = await tx.update(leads).set({ status: to, updatedAt: at }).where(eq(leads.id, leadId)).returning();
    await tx.insert(leadEvents).values({ leadId, at, userId, from: lead.status, to, note: note ?? null });
    await record({ userId, entity: "lead", entityId: leadId, action: "cambia-stato", diff: [{ path: "status", before: lead.status, after: to }] }, tx);
    return row!;
  });
}

/** Assegna (o toglie, con `null`) la richiesta a un utente. */
export async function assign(leadId: string, assigneeId: string | null, userId: string | null): Promise<Lead> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const lead = await getLeadRow(leadId, tx, true);
    let label = "nessuno";
    if (assigneeId) {
      const [u] = await tx.select({ name: users.name, email: users.email, active: users.active }).from(users).where(eq(users.id, assigneeId)).limit(1);
      if (!u) throw new NotFoundError(`utente ${assigneeId} non trovato`);
      if (!u.active) throw new ConflictError(`l'utente ${u.email} è disattivato`);
      label = u.name ?? u.email;
    }
    const at = new Date();
    const [row] = await tx.update(leads).set({ assigneeId, updatedAt: at }).where(eq(leads.id, leadId)).returning();
    await tx.insert(leadEvents).values({ leadId, at, userId, from: lead.status, to: lead.status, note: `assegnata a ${label}` });
    await record({ userId, entity: "lead", entityId: leadId, action: "assegna", diff: [{ path: "assigneeId", before: lead.assigneeId, after: assigneeId }] }, tx);
    return row!;
  });
}

/** Salva un preventivo definitivo (configurazione rivista, istantanea, righe manuali). */
export async function addFinalQuote(
  leadId: string,
  snapshot: QuoteSnapshotInput,
  manualLines: readonly unknown[],
  userId: string | null,
): Promise<LeadQuote> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const lead = await getLeadRow(leadId, tx, true);
    const at = new Date();
    const [q] = await tx.insert(quotes).values(quoteValues(leadId, "definitivo", snapshot, at, userId, manualLines)).returning();
    await tx.update(leads).set({ updatedAt: at }).where(eq(leads.id, leadId));
    await tx.insert(leadEvents).values({ leadId, at, userId, from: lead.status, to: lead.status, note: "preventivo definitivo salvato" });
    await record({ userId, entity: "lead", entityId: leadId, action: "preventivo-definitivo", diff: [{ path: "quotes", after: q!.id }] }, tx);
    return q!;
  });
}

/** Valore che sostituisce i dati personali. */
export const ANONYMIZED_CUSTOMER = { name: "Anonimizzato", email: "", anonymized: true } as const;

/**
 * Anonimizza la richiesta: rimuove nome, contatti, indirizzo, note e foto (restituite
 * per cancellarne i file), i dati personali delle email in coda e i token cliente;
 * conserva configurazione, preventivi e cronologia. Il consenso resta come prova
 * (testo, versione, data) senza identificativi tecnici (`ip`, `userAgent`).
 */
export async function anonymize(leadId: string, userId: string | null): Promise<{ lead: Lead; removedPhotos: unknown[] }> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const lead = await getLeadRow(leadId, tx, true);
    if (lead.anonymizedAt) throw new ConflictError(`la richiesta ${lead.code} è già anonimizzata`);
    const at = new Date();
    const consent = { ...(lead.consent as Record<string, unknown>) };
    delete consent.ip;
    delete consent.userAgent;
    const [row] = await tx
      .update(leads)
      .set({ customer: ANONYMIZED_CUSTOMER, consent, photos: [], notes: null, anonymizedAt: at, updatedAt: at })
      .where(eq(leads.id, leadId))
      .returning();
    await tx.update(emailOutbox).set({ to: "anonimizzato", payload: {} }).where(eq(emailOutbox.leadId, leadId));
    await tx.delete(customerTokens).where(eq(customerTokens.leadId, leadId));
    await tx.insert(leadEvents).values({ leadId, at, userId, from: lead.status, to: lead.status, note: "dati personali anonimizzati" });
    // Il registro non conserva i dati rimossi: solo quali campi sono stati svuotati.
    await record({ userId, entity: "lead", entityId: leadId, action: "anonimizza", diff: ["customer", "photos", "notes"].map((path) => ({ path, after: "rimosso" })) }, tx);
    return { lead: row!, removedPhotos: Array.isArray(lead.photos) ? (lead.photos as unknown[]) : [] };
  });
}

/** Riferimento a un file caricato con la richiesta (`leads.photos`): foto del cliente o immagine della scena. */
export interface UploadRef {
  readonly id: string;
  readonly kind: "foto" | "scena";
  readonly contentType: string;
  readonly size: number;
}

const isUploadRef = (v: unknown): v is UploadRef =>
  typeof v === "object" && v !== null && typeof (v as UploadRef).id === "string" && ((v as UploadRef).kind === "foto" || (v as UploadRef).kind === "scena");

/** Richiesta che contiene il file `uploadId` (ricerca per contenimento `jsonb`), con il riferimento. */
export async function findByUploadId(uploadId: string): Promise<{ leadId: string; upload: UploadRef } | null> {
  const db = await getDb();
  const [row] = await db
    .select({ id: leads.id, photos: leads.photos })
    .from(leads)
    .where(sql`${leads.photos} @> ${JSON.stringify([{ id: uploadId }])}::jsonb`)
    .limit(1);
  if (!row || !Array.isArray(row.photos)) return null;
  const upload = (row.photos as unknown[]).find((p): p is UploadRef => isUploadRef(p) && p.id === uploadId);
  return upload ? { leadId: row.id, upload } : null;
}
