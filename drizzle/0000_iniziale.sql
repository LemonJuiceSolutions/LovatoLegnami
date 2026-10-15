CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"user_id" text,
	"dataset" text,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"diff" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"effective_from" date NOT NULL,
	"data" jsonb NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone,
	CONSTRAINT "dataset_versions_dataset_check" CHECK ("dataset_versions"."dataset" in ('listino', 'regole', 'tipologie', 'preset')),
	CONSTRAINT "dataset_versions_status_check" CHECK ("dataset_versions"."status" in ('bozza', 'attiva', 'archiviata')),
	CONSTRAINT "dataset_versions_version_check" CHECK ("dataset_versions"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text,
	"to" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'in-coda' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_outbox_status_check" CHECK ("email_outbox"."status" in ('in-coda', 'inviata', 'da-reinviare'))
);
--> statement-breakpoint
CREATE TABLE "lead_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"user_id" text,
	"from_status" text,
	"to_status" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'nuovo' NOT NULL,
	"assignee_id" text,
	"customer" jsonb NOT NULL,
	"consent" jsonb NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"anonymized_at" timestamp with time zone,
	CONSTRAINT "leads_code_unique" UNIQUE("code"),
	CONSTRAINT "leads_status_check" CHECK ("leads"."status" in ('nuovo', 'in-lavorazione', 'preventivo-inviato', 'accettato', 'rifiutato', 'archiviato'))
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"kind" text NOT NULL,
	"config" jsonb NOT NULL,
	"price_list_version_id" text,
	"rule_set_version_id" text,
	"site_factors" jsonb,
	"quote" jsonb NOT NULL,
	"manual_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_cents" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "quotes_kind_check" CHECK ("quotes"."kind" in ('indicativo', 'definitivo'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'ufficio-tecnico', 'commerciale'))
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tokens" ADD CONSTRAINT "customer_tokens_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_price_list_version_id_dataset_versions_id_fk" FOREIGN KEY ("price_list_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_rule_set_version_id_dataset_versions_id_fk" FOREIGN KEY ("rule_set_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_dataset_idx" ON "audit_log" USING btree ("dataset","at");--> statement-breakpoint
CREATE INDEX "audit_log_user_idx" ON "audit_log" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "customer_tokens_lead_idx" ON "customer_tokens" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_versions_dataset_version_idx" ON "dataset_versions" USING btree ("dataset","version");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_versions_one_draft_idx" ON "dataset_versions" USING btree ("dataset") WHERE "dataset_versions"."status" = 'bozza';--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_versions_one_active_idx" ON "dataset_versions" USING btree ("dataset","effective_from") WHERE "dataset_versions"."status" = 'attiva';--> statement-breakpoint
CREATE INDEX "email_outbox_status_idx" ON "email_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "lead_events_lead_idx" ON "lead_events" USING btree ("lead_id","at");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "quotes_lead_idx" ON "quotes" USING btree ("lead_id","created_at");