import { desc, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { quotes, type QuoteRow } from "@/db/schema";
import { officeView, type Quote } from "@/domain";
import type { LeadDetailView, LeadRowView, LeadStatusValue } from "@/components/admin/richieste/types";
import { listForLead } from "@/server/email/outbox";
import { get, list, type LeadListFilter } from "@/server/repositories/leads";
import { StoredQuoteSchema } from "@/server/quotes/snapshot";
import { formatDateTime, userLabels } from "./overview";

/**
 * Viste serializzabili delle richieste per l'area admin (9.9): elenco con tipologia,
 * dimensioni e totale dell'ultimo preventivo; dettaglio con cliente, foto, configurazione,
 * vista ufficio del prezzo, cronologia ed email.
 */

const metres = (mm: number) => (mm / 1000).toFixed(2).replace(".", ",");

interface ConfigLike {
  typology?: string;
  params?: Record<string, unknown>;
  envelope?: { box?: { width?: number; depth?: number; height?: number } };
}

function dimensionsOf(config: ConfigLike): string {
  const p = config.params ?? {};
  const w = typeof p.larghezza === "number" ? p.larghezza : config.envelope?.box?.width;
  const d = typeof p.profondita === "number" ? p.profondita : config.envelope?.box?.depth;
  return typeof w === "number" && typeof d === "number" ? `${metres(w)} × ${metres(d)} m` : "";
}

const typologyOf = (row: QuoteRow): string => {
  const stored = StoredQuoteSchema.safeParse(row.quote);
  return stored.success ? stored.data.typology.title : ((row.config as ConfigLike).typology ?? "");
};

/** Ultimo preventivo di ogni richiesta (definitivo prima dell'indicativo). */
async function latestQuotes(ids: readonly string[]): Promise<Map<string, QuoteRow>> {
  if (!ids.length) return new Map();
  const db = await getDb();
  const rows = await db.select().from(quotes).where(inArray(quotes.leadId, [...ids])).orderBy(desc(quotes.createdAt));
  const out = new Map<string, QuoteRow>();
  for (const r of rows) {
    const cur = out.get(r.leadId);
    if (!cur || (cur.kind === "indicativo" && r.kind === "definitivo")) out.set(r.leadId, r);
  }
  return out;
}

export async function leadRows(filter: LeadListFilter): Promise<{ items: LeadRowView[]; total: number; page: number; pageSize: number }> {
  const res = await list(filter);
  const qs = await latestQuotes(res.items.map((i) => i.id));
  return {
    ...res,
    items: res.items.map((i) => {
      const q = qs.get(i.id);
      return {
        id: i.id,
        code: i.code,
        createdAt: formatDateTime(i.createdAt),
        customer: i.customerName ?? "",
        typology: q ? typologyOf(q) : "",
        dimensions: q ? dimensionsOf(q.config as ConfigLike) : "",
        totalCents: q?.totalCents ?? null,
        status: i.status as LeadStatusValue,
        assignee: i.assigneeName,
        anonymized: i.anonymized,
      };
    }),
  };
}

const CUSTOMER_FIELDS: readonly [string, string][] = [
  ["name", "Nome"],
  ["email", "Email"],
  ["phone", "Telefono"],
  ["cap", "CAP"],
  ["comune", "Comune"],
];

const show = (v: unknown) => (typeof v === "number" ? String(v).replace(".", ",") : String(v));

export async function leadDetailView(id: string): Promise<LeadDetailView> {
  const detail = await get(id);
  const { lead } = detail;
  const row = detail.quotes.find((q) => q.kind === "definitivo") ?? detail.quotes[0] ?? null;
  const stored = row ? StoredQuoteSchema.safeParse(row.quote) : null;
  const config = (row?.config ?? null) as ConfigLike | null;
  const labels = await userLabels([lead.assigneeId, ...detail.events.map((e) => e.userId)]);
  const customer = (lead.customer ?? {}) as Record<string, unknown>;
  const consent = (lead.consent ?? {}) as Record<string, unknown>;
  const photos = Array.isArray(lead.photos) ? (lead.photos as { id?: unknown; kind?: unknown }[]) : [];
  let office = null;
  if (stored?.success && stored.data.office && typeof stored.data.office === "object") {
    try {
      office = officeView(stored.data.office as Quote);
    } catch {
      office = null;
    }
  }
  const emails = await listForLead(id);
  const box = config?.envelope?.box;
  return {
    id: lead.id,
    code: lead.code,
    status: lead.status as LeadStatusValue,
    createdAt: formatDateTime(lead.createdAt),
    anonymized: lead.anonymizedAt !== null,
    assignee: lead.assigneeId ? (labels.get(lead.assigneeId) ?? null) : null,
    assigneeId: lead.assigneeId,
    customer: CUSTOMER_FIELDS.filter(([k]) => customer[k] !== undefined && customer[k] !== "").map(([k, label]) => ({ label, value: String(customer[k]) })),
    consent: [consent.version ? `informativa ${String(consent.version)}` : "", consent.acceptedAt ? `accettata il ${formatDateTime(new Date(String(consent.acceptedAt)))}` : ""].filter(Boolean).join(", "),
    notes: lead.notes,
    photos: photos.filter((p) => typeof p.id === "string" && (p.kind === "foto" || p.kind === "scena")).map((p) => ({ id: p.id as string, kind: p.kind as string })),
    config: config
      ? {
          typology: stored?.success ? `${stored.data.typology.title} (${stored.data.typology.slug})` : (config.typology ?? ""),
          params: Object.entries(config.params ?? {}).map(([name, value]) => ({ name, value: show(value) })),
          envelope: box ? `${metres(box.width ?? 0)} × ${metres(box.depth ?? 0)} × ${metres(box.height ?? 0)} m` : "",
        }
      : null,
    quoteKind: row?.kind ?? null,
    office,
    customerQuote: stored?.success ? stored.data.customerQuote : null,
    events: detail.events.map((e) => ({ at: formatDateTime(e.at), by: e.userId ? (labels.get(e.userId) ?? null) : null, from: e.from, to: e.to, note: e.note })),
    emails: emails.map((m) => ({ template: m.template, status: m.status, attempts: m.attempts, lastError: m.lastError })),
  };
}
