import { CommercialSchema, parseConfigFile, serializeConfig } from "@/stores/config-file";
import { NotFoundError } from "@/server/repositories/errors";
import { get, type LeadCustomer } from "@/server/repositories/leads";
import { StoredQuoteSchema } from "./snapshot";

/**
 * Richiesta aperta nel configuratore interno (`/configuratore?richiesta=<id>`, 10.4):
 * intestazione (codice, cliente, stato, link all'admin, ultimo preventivo) e
 * configurazione da caricare nello store. Si parte dal preventivo più recente (il
 * definitivo se c'è); se la configurazione salvata non ha `commercial` lo ricostruisce
 * dalle scelte del cliente registrate nell'istantanea (finiture e cantiere dichiarato).
 */

export interface OpenedRequest {
  readonly id: string;
  readonly code: string;
  readonly customer: { readonly name: string; readonly email: string | null; readonly phone: string | null; readonly comune: string | null };
  readonly status: string;
  readonly adminUrl: string;
  readonly latestQuote: { readonly kind: "indicativo" | "definitivo"; readonly totalCents: number; readonly createdAt: string } | null;
  readonly quotesCount: number;
  /** File di configurazione (JSON) da passare a `parseConfigFile` nel client; `null` se illeggibile. */
  readonly config: unknown | null;
}

export type OpenRequestResult = { readonly ok: true; readonly request: OpenedRequest } | { readonly ok: false; readonly message: string };

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export async function openRequest(id: string): Promise<OpenRequestResult> {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(id)) return { ok: false, message: `La richiesta "${id.slice(0, 40)}" non esiste: configurazione predefinita.` };
  let detail;
  try {
    detail = await get(id);
  } catch (e) {
    if (e instanceof NotFoundError) return { ok: false, message: `La richiesta "${id}" non esiste: configurazione predefinita.` };
    throw e;
  }
  const { lead, quotes } = detail;
  const latest = quotes.find((q) => q.kind === "definitivo") ?? quotes[0] ?? null;
  let config: unknown | null = null;
  if (latest) {
    try {
      const parsed = parseConfigFile(latest.config, { keepInvalidParams: true });
      const stored = StoredQuoteSchema.safeParse(latest.quote);
      const commercial =
        parsed.commercial ??
        (stored.success ? CommercialSchema.parse({ ...stored.data.commercial, ...stored.data.declared }) : undefined);
      config = JSON.parse(serializeConfig(commercial ? { ...parsed, commercial } : parsed));
    } catch {
      config = null;
    }
  }
  const c = lead.customer as LeadCustomer & { comune?: unknown };
  return {
    ok: true,
    request: {
      id: lead.id,
      code: lead.code,
      customer: { name: text(c.name) ?? "—", email: text(c.email), phone: text(c.phone), comune: text(c.comune) },
      status: lead.status,
      adminUrl: `/admin/richieste/${lead.id}`,
      latestQuote: latest ? { kind: latest.kind as "indicativo" | "definitivo", totalCents: latest.totalCents, createdAt: latest.createdAt.toISOString() } : null,
      quotesCount: quotes.length,
      config,
    },
  };
}
