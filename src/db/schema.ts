import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Schema del database (P5). Una sola definizione per Postgres (produzione, `pg`) e
 * PGlite (sviluppo e test): solo SQL standard, nessuna estensione. Le migrazioni in
 * `drizzle/` sono generate da questo file con `npm run db:generate`.
 *
 * Convenzioni: nomi di tabelle e colonne in snake_case, chiavi TS in camelCase; i
 * valori a scelta chiusa sono `text` con vincolo `check` (aggiungere un valore è una
 * migrazione banale, a differenza di un `enum` Postgres); i documenti configurabili
 * (listino, regole, tipologie, preset) sono `jsonb` validati dagli schemi del dominio.
 * Tutti gli istanti sono `timestamptz`; le date di validità sono `date` (`AAAA-MM-GG`).
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const now = () => new Date();
const uuid = () => crypto.randomUUID();
const quoted = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

// ---------------------------------------------------------------------------
// Valori ammessi

export const ROLE_VALUES = ["admin", "ufficio-tecnico", "commerciale"] as const;
export type RoleValue = (typeof ROLE_VALUES)[number];

export const DATASETS = ["listino", "regole", "tipologie", "preset"] as const;
export type Dataset = (typeof DATASETS)[number];

export const DATASET_STATUSES = ["bozza", "attiva", "archiviata"] as const;
export type DatasetStatus = (typeof DATASET_STATUSES)[number];

export const LEAD_STATUSES = ["nuovo", "in-lavorazione", "preventivo-inviato", "accettato", "rifiutato", "archiviato"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const QUOTE_KINDS = ["indicativo", "definitivo"] as const;
export type QuoteKind = (typeof QUOTE_KINDS)[number];

export const OUTBOX_STATUSES = ["in-coda", "inviata", "da-reinviare"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

// ---------------------------------------------------------------------------
// Utenti e tabelle di Auth.js (forma richiesta da `@auth/drizzle-adapter`)

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    /** Sempre in minuscolo (normalizzato dal repository). */
    email: text("email").notNull().unique(),
    name: text("name"),
    role: text("role").$type<RoleValue>().notNull(),
    active: boolean("active").notNull().default(true),
    emailVerified: ts("email_verified"),
    image: text("image"),
    /**
     * Hash della password (`scrypt$N$r$p$sale$hash`, `src/server/auth/password.ts`), `null`
     * se l'utente accede solo con il collegamento via email. Mai esposto al client.
     */
    passwordHash: text("password_hash"),
    passwordChangedAt: ts("password_changed_at"),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [check("users_role_check", sql`${t.role} in (${quoted(ROLE_VALUES)})`)],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: ts("expires").notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: ts("expires").notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// Documenti versionati (listini-versionati)

export const datasetVersions = pgTable(
  "dataset_versions",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    dataset: text("dataset").$type<Dataset>().notNull(),
    version: integer("version").notNull(),
    status: text("status").$type<DatasetStatus>().notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    data: jsonb("data").$type<unknown>().notNull(),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    /** Lock ottimistico della bozza: impostato dal codice (precisione al millisecondo). */
    updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
    publishedBy: text("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: ts("published_at"),
  },
  (t) => [
    uniqueIndex("dataset_versions_dataset_version_idx").on(t.dataset, t.version),
    /** Una sola bozza per insieme di dati. */
    uniqueIndex("dataset_versions_one_draft_idx").on(t.dataset).where(sql`${t.status} = 'bozza'`),
    /** Al più una versione attiva per data di validità. */
    uniqueIndex("dataset_versions_one_active_idx").on(t.dataset, t.effectiveFrom).where(sql`${t.status} = 'attiva'`),
    check("dataset_versions_dataset_check", sql`${t.dataset} in (${quoted(DATASETS)})`),
    check("dataset_versions_status_check", sql`${t.status} in (${quoted(DATASET_STATUSES)})`),
    check("dataset_versions_version_check", sql`${t.version} >= 1`),
  ],
);

// ---------------------------------------------------------------------------
// Registro delle modifiche (solo inserimenti)

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: ts("at").notNull().$defaultFn(now),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    dataset: text("dataset").$type<Dataset>(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    diff: jsonb("diff").$type<unknown>().notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [index("audit_log_dataset_idx").on(t.dataset, t.at), index("audit_log_user_idx").on(t.userId, t.at)],
);

// ---------------------------------------------------------------------------
// Richieste di preventivo

export const leads = pgTable(
  "leads",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    /** `PRV-AAAA-NNNNN`. */
    code: text("code").notNull().unique(),
    status: text("status").$type<LeadStatus>().notNull().default("nuovo"),
    assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
    customer: jsonb("customer").$type<unknown>().notNull(),
    consent: jsonb("consent").$type<unknown>().notNull(),
    photos: jsonb("photos").$type<unknown>().notNull().default(sql`'[]'::jsonb`),
    notes: text("notes"),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
    anonymizedAt: ts("anonymized_at"),
  },
  (t) => [
    index("leads_status_idx").on(t.status, t.createdAt),
    check("leads_status_check", sql`${t.status} in (${quoted(LEAD_STATUSES)})`),
  ],
);

/** Contatore dei codici per anno (assegnazione atomica con `insert … on conflict`). */
export const leadCounters = pgTable("lead_counters", {
  year: integer("year").primaryKey(),
  last: integer("last").notNull(),
});

export const quotes = pgTable(
  "quotes",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    kind: text("kind").$type<QuoteKind>().notNull(),
    config: jsonb("config").$type<unknown>().notNull(),
    priceListVersionId: text("price_list_version_id").references(() => datasetVersions.id, { onDelete: "restrict" }),
    ruleSetVersionId: text("rule_set_version_id").references(() => datasetVersions.id, { onDelete: "restrict" }),
    siteFactors: jsonb("site_factors").$type<unknown>(),
    quote: jsonb("quote").$type<unknown>().notNull(),
    manualLines: jsonb("manual_lines").$type<unknown>().notNull().default(sql`'[]'::jsonb`),
    totalCents: integer("total_cents").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("quotes_lead_idx").on(t.leadId, t.createdAt),
    check("quotes_kind_check", sql`${t.kind} in (${quoted(QUOTE_KINDS)})`),
  ],
);

export const leadEvents = pgTable(
  "lead_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    at: ts("at").notNull().$defaultFn(now),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    from: text("from_status"),
    to: text("to_status"),
    note: text("note"),
  },
  (t) => [index("lead_events_lead_idx").on(t.leadId, t.at)],
);

export const customerTokens = pgTable(
  "customer_tokens",
  {
    token: text("token").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("customer_tokens_lead_idx").on(t.leadId)],
);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    to: text("to").notNull(),
    template: text("template").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    status: text("status").$type<OutboxStatus>().notNull().default("in-coda"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    sentAt: ts("sent_at"),
  },
  (t) => [
    index("email_outbox_status_idx").on(t.status, t.createdAt),
    check("email_outbox_status_check", sql`${t.status} in (${quoted(OUTBOX_STATUSES)})`),
  ],
);

export type User = typeof users.$inferSelect;
export type DatasetVersionRow = typeof datasetVersions.$inferSelect;
export type AuditRow = typeof auditLog.$inferSelect;
export type LeadRow = typeof leads.$inferSelect;
export type QuoteRow = typeof quotes.$inferSelect;
export type LeadEventRow = typeof leadEvents.$inferSelect;
export type CustomerTokenRow = typeof customerTokens.$inferSelect;
export type EmailOutboxRow = typeof emailOutbox.$inferSelect;
